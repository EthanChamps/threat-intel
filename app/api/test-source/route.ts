import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { ThreatSource } from '@/lib/sources';
import { testScrapeSource, closeBrowser } from '@/lib/playwright-scraper';

const parser = new Parser();

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const source = body.source as ThreatSource;
        const startDate = body.startDate as string | undefined;
        const endDate = body.endDate as string | undefined;

        if (!source || !source.url) {
            return NextResponse.json({ success: false, error: 'No source provided' }, { status: 400 });
        }

        let articleCount = 0;
        let totalBeforeFilter = 0;
        let articles: { title: string; link: string; date?: string }[] = [];
        const logs: string[] = [];

        if (source.type === 'rss') {
            try {
                const feed = await parser.parseURL(source.url);
                totalBeforeFilter = feed.items.length;

                const startTime = startDate ? new Date(startDate).getTime() : null;
                const endTime = endDate ? new Date(endDate + 'T23:59:59').getTime() : null;

                const filteredItems = feed.items.filter(item => {
                    const dateStr = item.pubDate || item.isoDate;
                    if (!dateStr || (!startTime && !endTime)) return true;

                    const itemTime = new Date(dateStr).getTime();
                    if (startTime && itemTime < startTime) return false;
                    if (endTime && itemTime > endTime) return false;
                    return true;
                });

                articleCount = filteredItems.length;
                articles = filteredItems.slice(0, 5).map(item => ({
                    title: item.title || 'Untitled',
                    link: item.link || '',
                    date: item.pubDate || item.isoDate || '',
                }));
            } catch (error) {
                return NextResponse.json({
                    success: false,
                    error: `RSS fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                });
            }
        } else {
            try {
                const result = await testScrapeSource(
                    source.url,
                    {
                        articleSelector: source.articleSelector || 'article, .post, .blog-item',
                        titleSelector: source.titleSelector || 'h2, h3, .title',
                        linkSelector: source.linkSelector || 'a',
                        dateSelector: source.dateSelector || 'time, .date, .published',
                        loadMoreSelector: source.loadMoreSelector,
                        maxScrolls: source.maxScrolls || 3,
                        paginationPattern: source.paginationPattern || '/page/{n}/',
                    },
                    startDate,
                    endDate,
                    (message) => logs.push(`[${new Date().toISOString()}] ${message}`)
                );

                articles = result.articles;
                totalBeforeFilter = result.totalBeforeFilter;
                articleCount = result.articleCount;
            } catch (error) {
                await closeBrowser();
                return NextResponse.json({
                    success: false,
                    error: `Scrape failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                });
            }
        }

        return NextResponse.json({
            success: true,
            sourceId: source.id,
            sourceName: source.name,
            articleCount,
            totalBeforeFilter: totalBeforeFilter || articleCount,
            articles,
            logs: logs.length > 0 ? logs : undefined,
        });
    } catch (error) {
        await closeBrowser();
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'An error occurred' },
            { status: 500 }
        );
    }
}
