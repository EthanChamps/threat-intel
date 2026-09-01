import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { fetchByDateRange } from './fetcher';
import { scrapeArticles } from './scraper';
import {
    ThreatAnalysisArraySchema,
    EXTRACTION_SYSTEM_PROMPT,
    type ThreatAnalysisWithDuplicates,
    type DuplicateInfo,
} from './extractor';
import type { ThreatSource } from './sources';
import { deduplicateArticles, getDeduplicationStats } from './deduplicator';
import {
    createCollectionRun,
    finishCollectionRun,
    getArticlesForRange,
    getStoredAnalysis,
    saveAnalysis,
    saveScrapedArticle,
    upsertFeedItems,
    type CollectionRunStats,
    type StoredArticle,
} from './article-store';

export interface CorpusProgress {
    event: 'status' | 'progress' | 'error';
    data: Record<string, unknown>;
}

export interface CorpusResult {
    data: ThreatAnalysisWithDuplicates[];
    stats: CollectionRunStats;
    sourceStats: Record<string, number>;
}

function dateRange(startDate?: string, endDate?: string): { start: string; end: string } {
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date(end);
    if (!startDate) start.setUTCDate(start.getUTCDate() - 7);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function sourceFromUrl(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
}

function duplicateMapForArticles(groups: ReturnType<typeof deduplicateArticles>): Map<string, DuplicateInfo[]> {
    const result = new Map<string, DuplicateInfo[]>();
    for (const group of groups) {
        if (group.duplicates.length > 0) {
            result.set(group.primary.url, group.duplicates.map(article => ({
                url: article.url,
                title: article.title,
                source: sourceFromUrl(article.url),
            })));
        }
    }
    return result;
}

function addDuplicates(analysis: ThreatAnalysisWithDuplicates, duplicateMap: Map<string, DuplicateInfo[]>): ThreatAnalysisWithDuplicates {
    const duplicates = duplicateMap.get(analysis.url);
    return duplicates ? { ...analysis, duplicates } : analysis;
}

function articleToScraped(article: StoredArticle) {
    return { url: article.url, title: article.title, content: article.content, pubDate: article.pubDate };
}

export async function runCorpusAnalysis(
    options: { sources?: ThreatSource[]; startDate?: string; endDate?: string },
    onProgress?: (progress: CorpusProgress) => void,
): Promise<CorpusResult> {
    const range = dateRange(options.startDate, options.endDate);
    const sourceNames = (options.sources || []).map(source => source.name);
    const runId = createCollectionRun(range.start, range.end, sourceNames);
    const discoveredAt = new Date().toISOString();
    const emit = (event: CorpusProgress['event'], data: Record<string, unknown>) => onProgress?.({ event, data });
    const stats: CollectionRunStats = {
        discovered: 0, stored: 0, scraped: 0, scrapeFailed: 0, eligible: 0,
        unique: 0, duplicatesRemoved: 0, analyzed: 0, reused: 0, analysisFailed: 0,
    };

    try {
        emit('status', { message: 'Fetching all source listings...', phase: 'fetch' });
        const feedItems = await fetchByDateRange(range.start, range.end, options.sources);
        stats.discovered = feedItems.length;
        stats.stored = upsertFeedItems(feedItems, discoveredAt);
        emit('status', {
            message: `Discovered ${stats.discovered} articles and stored ${stats.stored} listings`,
            phase: 'fetch', articlesFound: stats.discovered,
        });

        const storedArticles = getArticlesForRange(range.start, range.end, discoveredAt);
        const needsScraping = storedArticles.filter(article => article.content.length < 100);
        if (needsScraping.length > 0) {
            emit('status', { message: `Scraping ${needsScraping.length} new or incomplete articles...`, phase: 'scrape' });
            const scraped = await scrapeArticles(needsScraping.map(article => article.url));
            const scrapedByUrl = new Map(scraped.map(article => [article.url, article]));
            for (const article of needsScraping) {
                const result = scrapedByUrl.get(article.url);
                if (result && result.content.length > 100) {
                    saveScrapedArticle(result);
                    stats.scraped++;
                } else {
                    saveScrapedArticle(result || { url: article.url, title: article.title, content: '' }, 'Article content could not be extracted');
                    stats.scrapeFailed++;
                }
            }
        }

        const currentArticles = getArticlesForRange(range.start, range.end, discoveredAt).filter(article => article.content.length > 100);
        stats.eligible = currentArticles.length;
        emit('status', { message: `${stats.eligible} articles have usable content`, phase: 'scrape', scraped: stats.scraped, scrapeFailed: stats.scrapeFailed });
        if (currentArticles.length === 0) {
            finishCollectionRun(runId, 'complete', stats);
            return { data: [], stats, sourceStats: {} };
        }

        emit('status', { message: 'Deduplicating the complete stored corpus...', phase: 'dedup' });
        const groups = deduplicateArticles(currentArticles.map(articleToScraped));
        const dedupStats = getDeduplicationStats(groups);
        stats.unique = dedupStats.uniqueCount;
        stats.duplicatesRemoved = dedupStats.duplicatesRemoved;
        const duplicateMap = duplicateMapForArticles(groups);
        const analyses: ThreatAnalysisWithDuplicates[] = [];
        const pending = [];
        for (const group of groups) {
            const stored = getStoredAnalysis(group.primary.url);
            if (stored) {
                analyses.push(addDuplicates(stored, duplicateMap));
                stats.reused++;
            } else {
                pending.push(group.primary);
            }
        }

        const batchSize = 5;
        for (let i = 0; i < pending.length; i += batchSize) {
            const batch = pending.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(pending.length / batchSize);
            emit('status', { message: `Analyzing batch ${batchNum}/${totalBatches} (${batch.length} articles)...`, phase: 'analyze', batch: batchNum, totalBatches });
            const context = batch.map((article, index) => `\n--- ARTICLE ${index + 1} ---\nURL: ${article.url}\nTITLE: ${article.title}\nCONTENT: ${article.content.slice(0, 3000)}\n--- END ARTICLE ${index + 1} ---`).join('\n');
            try {
                const { object } = await generateObject({
                    model: google('gemini-2.0-flash'),
                    schema: ThreatAnalysisArraySchema,
                    system: EXTRACTION_SYSTEM_PROMPT,
                    prompt: `Analyze the following ${batch.length} cybersecurity articles and extract structured threat intelligence data for each one:\n\n${context}`,
                });
                for (const analysis of object) {
                    const withDuplicates = addDuplicates(analysis, duplicateMap);
                    saveAnalysis(analysis.url, analysis);
                    analyses.push(withDuplicates);
                }
                stats.analyzed += object.length;
                emit('progress', { message: `Batch ${batchNum}/${totalBatches} complete`, phase: 'analyze', results: object.map(item => addDuplicates(item, duplicateMap)), analyzedSoFar: stats.analyzed + stats.reused });
            } catch (error) {
                stats.analysisFailed += batch.length;
                emit('error', { message: `Batch ${batchNum} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, phase: 'analyze', batch: batchNum });
            }
        }
        finishCollectionRun(runId, 'complete', stats);
        const sourceStats = currentArticles.reduce<Record<string, number>>((acc, article) => {
            acc[article.sourceName] = (acc[article.sourceName] || 0) + 1;
            return acc;
        }, {});
        return { data: analyses, stats, sourceStats };
    } catch (error) {
        finishCollectionRun(runId, 'failed', stats, error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
