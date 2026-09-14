import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { fetchByDateRange, type FeedItem } from './fetcher';
import { scrapeArticles } from './scraper';
import {
    ThreatAnalysisArraySchema,
    TriageDecisionArraySchema,
    EXTRACTION_SYSTEM_PROMPT,
    TRIAGE_SYSTEM_PROMPT,
    preFilterArticle,
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

function isReportWorthy(analysis: ThreatAnalysisWithDuplicates): boolean {
    // Backward compatible with v1-cached rows that lack the new field:
    // fall back to the old broad relevance flag so old scans still render.
    if (typeof analysis.reportWorthy === 'boolean') return analysis.reportWorthy;
    return analysis.ukFinanceRelevance === true;
}

// Cheap headline gate before any browser scraping. Fail-open: any triage
// error keeps every article so a model outage can never silently drop coverage.
async function triageFeedItems(
    items: FeedItem[],
    emit: (event: CorpusProgress['event'], data: Record<string, unknown>) => void,
): Promise<{ passed: FeedItem[]; skipped: number }> {
    if (items.length === 0) return { passed: [], skipped: 0 };
    const decisions = new Map<string, boolean>();
    const batchSize = 20;
    const totalBatches = Math.ceil(items.length / batchSize);
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        emit('status', { message: `Triaging batch ${batchNum}/${totalBatches} (${batch.length} headlines)...`, phase: 'triage', batch: batchNum, totalBatches });
        const context = batch.map((item, index) => `\n--- ITEM ${index + 1} ---\nURL: ${item.link}\nSOURCE: ${item.sourceName}\nTITLE: ${item.title}\nSNIPPET: ${(item.contentSnippet || '').slice(0, 500)}\n--- END ITEM ${index + 1} ---`).join('\n');
        try {
            const { object } = await generateObject({
                model: google('gemini-2.0-flash'),
                schema: TriageDecisionArraySchema,
                system: TRIAGE_SYSTEM_PROMPT,
                prompt: `Triage the following ${batch.length} cybersecurity headlines. Return one decision per item:\n\n${context}`,
            });
            for (const decision of object) {
                decisions.set(decision.url, decision.reportWorthy);
            }
        } catch (error) {
            emit('error', { message: `Triage batch ${batchNum} failed, keeping all ${batch.length} articles: ${error instanceof Error ? error.message : 'Unknown error'}`, phase: 'triage', batch: batchNum });
        }
    }
    const passed = items.filter(item => decisions.get(item.link) !== false);
    return { passed, skipped: items.length - passed.length };
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
        preFiltered: 0, triageSkipped: 0, belowBar: 0,
    };

    try {
        emit('status', { message: 'Fetching all source listings...', phase: 'fetch' });
        const feedItems = await fetchByDateRange(range.start, range.end, options.sources);
        stats.discovered = feedItems.length;

        const preFilteredOut = feedItems.filter(item => !preFilterArticle(item.title, item.sourceName, item.contentSnippet).keep);
        stats.preFiltered = preFilteredOut.length;
        const afterPreFilter = feedItems.filter(item => preFilterArticle(item.title, item.sourceName, item.contentSnippet).keep);
        if (stats.preFiltered > 0) {
            emit('status', {
                message: `Pre-filter removed ${stats.preFiltered} low-value listings (MSRC CVE noise, legal/marketing items)`,
                phase: 'prefilter', preFiltered: stats.preFiltered,
            });
        }

        const { passed: triagedItems, skipped } = await triageFeedItems(afterPreFilter, emit);
        stats.triageSkipped = skipped;
        if (stats.triageSkipped > 0) {
            emit('status', {
                message: `Triage skipped ${stats.triageSkipped} headlines not worth a full read; ${triagedItems.length} proceed to scraping`,
                phase: 'triage', triageSkipped: stats.triageSkipped,
            });
        }

        stats.stored = upsertFeedItems(triagedItems, discoveredAt);
        emit('status', {
            message: `Discovered ${stats.discovered} articles, kept ${triagedItems.length} after filtering, stored ${stats.stored} listings`,
            phase: 'fetch', articlesFound: stats.discovered,
        });

        const storedArticles = getArticlesForRange(range.start, range.end, discoveredAt, sourceNames);
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

        const currentArticles = getArticlesForRange(range.start, range.end, discoveredAt, sourceNames).filter(article => article.content.length > 100);
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
                const withDuplicates = addDuplicates(stored, duplicateMap);
                if (isReportWorthy(withDuplicates)) {
                    analyses.push(withDuplicates);
                } else {
                    stats.belowBar++;
                }
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
                    if (isReportWorthy(withDuplicates)) {
                        analyses.push(withDuplicates);
                    } else {
                        stats.belowBar++;
                    }
                }
                stats.analyzed += object.length;
                const worthyInBatch = object.map(item => addDuplicates(item, duplicateMap)).filter(isReportWorthy);
                emit('progress', { message: `Batch ${batchNum}/${totalBatches} complete (${worthyInBatch.length}/${object.length} client-worthy)`, phase: 'analyze', results: worthyInBatch, analyzedSoFar: stats.analyzed + stats.reused });
            } catch (error) {
                stats.analysisFailed += batch.length;
                emit('error', { message: `Batch ${batchNum} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, phase: 'analyze', batch: batchNum });
            }
        }
        finishCollectionRun(runId, 'complete', stats);
        const sourceByUrl = new Map(currentArticles.map(article => [article.url, article.sourceName]));
        const sourceStats = analyses.reduce<Record<string, number>>((acc, analysis) => {
            const source = sourceByUrl.get(analysis.url) || sourceFromUrl(analysis.url);
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {});
        emit('status', {
            message: `Brief ready: ${analyses.length} client-worthy articles (${stats.preFiltered} pre-filtered, ${stats.triageSkipped} triage-skipped, ${stats.belowBar} below the reporting bar)`,
            phase: 'done', reportWorthy: analyses.length, belowBar: stats.belowBar,
        });
        return { data: analyses, stats, sourceStats };
    } catch (error) {
        finishCollectionRun(runId, 'failed', stats, error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
