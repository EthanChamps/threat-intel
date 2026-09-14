import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FeedItem } from './fetcher';
import type { ScrapedArticle } from './scraper';
import type { ThreatAnalysisWithDuplicates } from './extractor';

export interface StoredArticle {
    id: number;
    url: string;
    title: string;
    sourceName: string;
    sourceType: 'rss' | 'scrape';
    pubDate?: string;
    content: string;
    discoveredAt: string;
    scrapedAt?: string;
    scrapeError?: string;
}

export interface CollectionRunStats {
    discovered: number;
    stored: number;
    scraped: number;
    scrapeFailed: number;
    eligible: number;
    unique: number;
    duplicatesRemoved: number;
    analyzed: number;
    reused: number;
    analysisFailed: number;
    preFiltered: number;
    triageSkipped: number;
    belowBar: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'threat-intel.sqlite');
const PROMPT_VERSION = 'extraction-v2';

let database: Database.Database | undefined;

function getDatabase(): Database.Database {
    if (!database) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        database = new Database(DB_PATH);
        database.pragma('journal_mode = WAL');
        database.pragma('foreign_keys = ON');
        database.exec(`
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT '',
                source_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                pub_date TEXT,
                content TEXT NOT NULL DEFAULT '',
                content_hash TEXT,
                discovered_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                scraped_at TEXT,
                scrape_error TEXT
            );
            CREATE TABLE IF NOT EXISTS article_sources (
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                source_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                PRIMARY KEY (article_id, source_name)
            );
            CREATE TABLE IF NOT EXISTS analyses (
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                prompt_version TEXT NOT NULL,
                result_json TEXT NOT NULL,
                analyzed_at TEXT NOT NULL,
                PRIMARY KEY (article_id, prompt_version)
            );
            CREATE TABLE IF NOT EXISTS collection_runs (
                id TEXT PRIMARY KEY,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                sources_json TEXT NOT NULL,
                status TEXT NOT NULL,
                stats_json TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                error TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date);
            CREATE INDEX IF NOT EXISTS idx_articles_discovered_at ON articles(discovered_at);
        `);
    }
    return database;
}

function canonicalUrl(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return url.trim();
    }
}

function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function normaliseDate(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createCollectionRun(startDate: string, endDate: string, sources: string[]): string {
    const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    getDatabase().prepare(`
        INSERT INTO collection_runs (id, start_date, end_date, sources_json, status, created_at)
        VALUES (?, ?, ?, ?, 'running', ?)
    `).run(id, startDate, endDate, JSON.stringify(sources), now);
    return id;
}

export function finishCollectionRun(id: string, status: 'complete' | 'failed', stats?: CollectionRunStats, error?: string): void {
    getDatabase().prepare(`
        UPDATE collection_runs SET status = ?, stats_json = ?, completed_at = ?, error = ? WHERE id = ?
    `).run(status, stats ? JSON.stringify(stats) : null, new Date().toISOString(), error || null, id);
}

export function upsertFeedItems(items: FeedItem[], discoveredAt = new Date().toISOString()): number {
    const db = getDatabase();
    const articleStatement = db.prepare(`
        INSERT INTO articles (url, title, source_name, source_type, pub_date, discovered_at, updated_at)
        VALUES (@url, @title, @sourceName, @sourceType, @pubDate, @discoveredAt, @updatedAt)
        ON CONFLICT(url) DO UPDATE SET
            title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE articles.title END,
            pub_date = CASE WHEN excluded.pub_date <> '' THEN excluded.pub_date ELSE articles.pub_date END,
            source_name = excluded.source_name,
            source_type = excluded.source_type,
            updated_at = excluded.updated_at
    `);
    const sourceStatement = db.prepare(`
        INSERT INTO article_sources (article_id, source_name, source_type, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(article_id, source_name) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `);
    const transaction = db.transaction((feedItems: FeedItem[]) => {
        for (const item of feedItems) {
            if (!item.link) continue;
            const url = canonicalUrl(item.link);
            articleStatement.run({
                url,
                title: item.title || 'Untitled',
                sourceName: item.sourceName,
                sourceType: item.sourceType,
                pubDate: normaliseDate(item.pubDate),
                discoveredAt,
                updatedAt: discoveredAt,
            });
            const row = db.prepare('SELECT id FROM articles WHERE url = ?').get(url) as { id: number };
            sourceStatement.run(row.id, item.sourceName, item.sourceType, discoveredAt, discoveredAt);
        }
    });
    transaction(items);
    return items.filter(item => item.link).length;
}

function mapArticle(row: Record<string, unknown>): StoredArticle {
    return {
        id: row.id as number,
        url: row.url as string,
        title: row.title as string,
        sourceName: row.source_name as string,
        sourceType: row.source_type as 'rss' | 'scrape',
        pubDate: (row.pub_date as string | null) || undefined,
        content: row.content as string,
        discoveredAt: row.discovered_at as string,
        scrapedAt: (row.scraped_at as string | null) || undefined,
        scrapeError: (row.scrape_error as string | null) || undefined,
    };
}

export function getArticlesForRange(startDate: string, endDate: string, discoveredAfter: string, sourceNames?: string[]): StoredArticle[] {
    const sourceFilter = sourceNames && sourceNames.length > 0
        ? `AND EXISTS (
                SELECT 1 FROM article_sources selected_source
                WHERE selected_source.article_id = articles.id
                  AND selected_source.source_name IN (${sourceNames.map(() => '?').join(', ')})
            )`
        : '';
    const rows = getDatabase().prepare(`
        SELECT * FROM articles
        WHERE ((pub_date >= ? AND pub_date <= ?)
           OR (pub_date IS NULL AND discovered_at >= ?))
        ${sourceFilter}
        ORDER BY COALESCE(pub_date, discovered_at) DESC
    `).all(
        `${startDate}T00:00:00.000Z`,
        `${endDate}T23:59:59.999Z`,
        discoveredAfter,
        ...(sourceNames || []),
    ) as Record<string, unknown>[];
    return rows.map(mapArticle);
}

export function saveScrapedArticle(article: ScrapedArticle, error?: string): void {
    const now = new Date().toISOString();
    getDatabase().prepare(`
        UPDATE articles SET title = CASE WHEN ? <> '' THEN ? ELSE title END,
            pub_date = COALESCE(?, pub_date), content = ?, content_hash = ?,
            scraped_at = ?, scrape_error = ?, updated_at = ? WHERE url = ?
    `).run(article.title, article.title, article.pubDate || null, article.content, article.content ? hashContent(article.content) : null, now, error || null, now, canonicalUrl(article.url));
}

export function getStoredAnalysis(url: string): ThreatAnalysisWithDuplicates | null {
    const row = getDatabase().prepare(`
        SELECT result_json FROM analyses a JOIN articles ar ON ar.id = a.article_id
        WHERE ar.url = ? AND a.prompt_version = ?
    `).get(canonicalUrl(url), PROMPT_VERSION) as { result_json: string } | undefined;
    return row ? JSON.parse(row.result_json) as ThreatAnalysisWithDuplicates : null;
}

export function saveAnalysis(url: string, result: ThreatAnalysisWithDuplicates): void {
    const row = getDatabase().prepare('SELECT id FROM articles WHERE url = ?').get(canonicalUrl(url)) as { id: number } | undefined;
    if (!row) return;
    getDatabase().prepare(`
        INSERT INTO analyses (article_id, prompt_version, result_json, analyzed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(article_id, prompt_version) DO UPDATE SET result_json = excluded.result_json, analyzed_at = excluded.analyzed_at
    `).run(row.id, PROMPT_VERSION, JSON.stringify(result), new Date().toISOString());
}

export { PROMPT_VERSION, DB_PATH };
