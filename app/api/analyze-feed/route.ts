import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { fetchByDateRange, FeedItem } from '@/lib/fetcher';
import { scrapeArticles } from '@/lib/scraper';
import { ThreatAnalysisArraySchema, EXTRACTION_SYSTEM_PROMPT, ThreatAnalysisWithDuplicates, DuplicateInfo } from '@/lib/extractor';
import { ThreatSource } from '@/lib/sources';
import { deduplicateArticles, getDeduplicationStats } from '@/lib/deduplicator';

export const maxDuration = 120;

function extractSourceFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return 'unknown';
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const limit = body.limit || 20;
        const startDate = body.startDate as string | undefined;
        const endDate = body.endDate as string | undefined;
        const sources = body.sources as ThreatSource[] | undefined;

        console.log('Fetching from sources...');
        console.log('Date range:', startDate, 'to', endDate);

        const feedItems: FeedItem[] = await fetchByDateRange(startDate, endDate, sources);
        const itemsToProcess = feedItems.slice(0, limit);

        if (itemsToProcess.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
                message: 'No articles found in the selected date range',
            });
        }

        console.log(`Scraping ${itemsToProcess.length} articles...`);
        const urls = itemsToProcess.map((item) => item.link);
        const scrapedArticles = await scrapeArticles(urls, { startDate, endDate });
        const validScraped = scrapedArticles.filter((a) => a.content.length > 100);

        if (validScraped.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
                message: 'No articles could be scraped successfully',
                totalArticles: itemsToProcess.length,
            });
        }

        console.log('Deduplicating articles...');
        const articleGroups = deduplicateArticles(validScraped);
        const dedupStats = getDeduplicationStats(articleGroups);
        console.log(`Deduplicated: ${dedupStats.originalCount} → ${dedupStats.uniqueCount} unique`);

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

        for (let i = 0; i < uniqueArticles.length; i += batchSize) {
            const batch = uniqueArticles.slice(i, i + batchSize);

            const articlesContext = batch
                .map((article, idx) => `
--- ARTICLE ${idx + 1} ---
URL: ${article.url}
TITLE: ${article.title}
CONTENT: ${article.content.slice(0, 3000)}
--- END ARTICLE ${idx + 1} ---
`)
                .join('\n');

            console.log(`Analyzing batch ${Math.floor(i / batchSize) + 1}...`);

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
            } catch (error) {
                console.error('Error analyzing batch:', error);
            }
        }

        const sourceStats = itemsToProcess.reduce((acc, item) => {
            acc[item.sourceName] = (acc[item.sourceName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return NextResponse.json({
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
    } catch (error) {
        console.error('Error in analyze-feed:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'An error occurred',
            },
            { status: 500 }
        );
    }
}
