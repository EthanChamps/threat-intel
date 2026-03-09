import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { fetchByDateRange, FeedItem } from '@/lib/fetcher';
import { scrapeArticles, ScrapedArticle } from '@/lib/scraper';
import { ThreatAnalysisArraySchema, EXTRACTION_SYSTEM_PROMPT, ThreatAnalysisWithDuplicates, DuplicateInfo } from '@/lib/extractor';
import { ThreatSource } from '@/lib/sources';
import { deduplicateArticles, ArticleGroup, getDeduplicationStats } from '@/lib/deduplicator';

export const maxDuration = 300;

function extractSourceFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return 'unknown';
    }
}

async function* generateAnalysisEvents(
    sources: ThreatSource[] | undefined,
    startDate: string | undefined,
    endDate: string | undefined,
    limit: number
): AsyncGenerator<string> {
    const formatEvent = (event: string, data: unknown) => 
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    yield formatEvent('status', { message: 'Starting analysis...', phase: 'init' });
    yield formatEvent('status', { message: 'Fetching articles from sources...', phase: 'fetch' });

    let feedItems: FeedItem[];
    try {
        feedItems = await fetchByDateRange(startDate, endDate, sources);
    } catch (err) {
        yield formatEvent('error', {
            message: `Fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            phase: 'fetch',
        });
        feedItems = [];
    }

    const itemsToProcess = feedItems.slice(0, limit);

    yield formatEvent('status', {
        message: `Found ${feedItems.length} articles, processing ${itemsToProcess.length}`,
        phase: 'fetch',
        articlesFound: feedItems.length,
        articlesToProcess: itemsToProcess.length,
    });

    if (itemsToProcess.length === 0) {
        yield formatEvent('complete', {
            success: true,
            data: [],
            message: 'No articles found in the selected date range',
        });
        return;
    }

    yield formatEvent('status', { message: `Scraping ${itemsToProcess.length} articles...`, phase: 'scrape' });

    const urls = itemsToProcess.map((item) => item.link);
    const scrapedArticles = await scrapeArticles(urls, { startDate, endDate });
    const validScraped = scrapedArticles.filter((a) => a.content.length > 100);

    yield formatEvent('status', {
        message: `Scraped ${validScraped.length} articles successfully`,
        phase: 'scrape'
    });

    if (validScraped.length === 0) {
        yield formatEvent('complete', {
            success: true,
            data: [],
            message: 'No articles could be scraped successfully',
            totalArticles: itemsToProcess.length,
            analyzedArticles: 0,
        });
        return;
    }

    yield formatEvent('status', { message: 'Deduplicating similar articles...', phase: 'dedup' });

    const articleGroups = deduplicateArticles(validScraped);
    const dedupStats = getDeduplicationStats(articleGroups);

    yield formatEvent('status', {
        message: `Deduplicated: ${dedupStats.originalCount} → ${dedupStats.uniqueCount} unique (${dedupStats.duplicatesRemoved} duplicates removed)`,
        phase: 'dedup',
        originalCount: dedupStats.originalCount,
        uniqueCount: dedupStats.uniqueCount,
        duplicatesRemoved: dedupStats.duplicatesRemoved,
        duplicateGroups: dedupStats.groups,
    });

    const uniqueArticles = articleGroups.map(g => g.primary);
    const duplicateMap = new Map<string, DuplicateInfo[]>();
    
    for (const group of articleGroups) {
        if (group.duplicates.length > 0) {
            duplicateMap.set(group.primary.url, group.duplicates.map(d => ({
                url: d.url,
                title: d.title,
                source: extractSourceFromUrl(d.url),
            })));
        }
    }

    const allAnalyses: ThreatAnalysisWithDuplicates[] = [];
    const batchSize = 5;
    const totalBatches = Math.ceil(uniqueArticles.length / batchSize);

    for (let i = 0; i < uniqueArticles.length; i += batchSize) {
        const batchNum = Math.floor(i / batchSize) + 1;
        const batch = uniqueArticles.slice(i, i + batchSize);

        yield formatEvent('status', {
            message: `Analyzing batch ${batchNum}/${totalBatches} (${batch.length} unique articles)...`,
            phase: 'analyze',
            batch: batchNum,
            totalBatches,
        });

        const articlesContext = batch
            .map((article, idx) => `
--- ARTICLE ${idx + 1} ---
URL: ${article.url}
TITLE: ${article.title}
CONTENT: ${article.content.slice(0, 3000)}
--- END ARTICLE ${idx + 1} ---
`)
            .join('\n');

        try {
            const { object } = await generateObject({
                model: google('gemini-2.0-flash'),
                schema: ThreatAnalysisArraySchema,
                system: EXTRACTION_SYSTEM_PROMPT,
                prompt: `Analyze the following ${batch.length} cybersecurity articles and extract structured threat intelligence data for each one:\n\n${articlesContext}`,
            });

            const resultsWithDuplicates: ThreatAnalysisWithDuplicates[] = object.map(analysis => {
                const duplicates = duplicateMap.get(analysis.url);
                return duplicates ? { ...analysis, duplicates } : analysis;
            });

            allAnalyses.push(...resultsWithDuplicates);

            yield formatEvent('progress', {
                message: `Batch ${batchNum}/${totalBatches} complete: ${object.length} articles analyzed`,
                phase: 'analyze',
                batch: batchNum,
                totalBatches,
                analyzedSoFar: allAnalyses.length,
                results: resultsWithDuplicates,
            });
        } catch (error) {
            yield formatEvent('error', {
                message: `Batch ${batchNum} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                phase: 'analyze',
                batch: batchNum,
            });
        }
    }

    const sourceStats = itemsToProcess.reduce((acc, item) => {
        acc[item.sourceName] = (acc[item.sourceName] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    yield formatEvent('complete', {
        success: true,
        data: allAnalyses,
        totalArticles: itemsToProcess.length,
        scrapedArticles: validScraped.length,
        uniqueArticles: uniqueArticles.length,
        duplicatesRemoved: dedupStats.duplicatesRemoved,
        analyzedArticles: allAnalyses.length,
        sourceStats,
        tokensSaved: `~${dedupStats.duplicatesRemoved * 1000} tokens saved by deduplication`,
    });
}

export async function POST(request: Request) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    const limit = (body.limit as number) || 25;
    const startDate = body.startDate as string | undefined;
    const endDate = body.endDate as string | undefined;
    const sources = body.sources as ThreatSource[] | undefined;

    const encoder = new TextEncoder();
    const generator = generateAnalysisEvents(sources, startDate, endDate, limit);

    const stream = new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await generator.next();
                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(encoder.encode(value));
                }
            } catch (error) {
                controller.enqueue(encoder.encode(
                    `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : 'Unknown error', fatal: true })}\n\n`
                ));
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
