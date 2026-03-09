import Parser from 'rss-parser';
import { ThreatSource, getEnabledSources, getRssSources, getScrapeSources } from './sources';
import { scrapeWithPlaywright } from './playwright-scraper';

export interface FeedItem {
    title: string;
    link: string;
    pubDate: string;
    contentSnippet?: string;
    sourceName: string;
    sourceType: 'rss' | 'scrape';
}

const parser = new Parser();

// Fetch articles from RSS sources
async function fetchRssSource(source: ThreatSource): Promise<FeedItem[]> {
    try {
        console.log(`[RSS] Fetching: ${source.name}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
            const feed = await parser.parseURL(source.url);
            clearTimeout(timeoutId);

            return feed.items.map((item) => ({
                title: item.title || 'Untitled',
                link: item.link || '',
                pubDate: item.pubDate || item.isoDate || '',
                contentSnippet: item.contentSnippet || item.summary || '',
                sourceName: source.name,
                sourceType: 'rss' as const,
            }));
        } catch (parseError) {
            clearTimeout(timeoutId);
            throw parseError;
        }
    } catch (error) {
        console.error(`[RSS] Failed to fetch ${source.name}:`, error instanceof Error ? error.message : error);
        return [];
    }
}

async function fetchScrapeSource(source: ThreatSource): Promise<FeedItem[]> {
    console.log(`[SCRAPE] Starting fetch for: ${source.name}`);
    console.log(`[SCRAPE] Source config:`, JSON.stringify(source, null, 2));
    try {
        console.log(`[SCRAPE] About to call scrapeWithPlaywright...`);

        const articles = await scrapeWithPlaywright(source.url, {
            articleSelector: source.articleSelector || 'article, .post, .blog-item',
            titleSelector: source.titleSelector || 'h2, h3, .title',
            linkSelector: source.linkSelector || 'a',
            dateSelector: source.dateSelector || 'time, .date, .published',
            loadMoreSelector: source.loadMoreSelector,
            maxScrolls: source.maxScrolls || 5,
            onLog: (msg) => console.log(`[SCRAPE:${source.name}] ${msg}`),
        });

        console.log(`[SCRAPE] scrapeWithPlaywright returned ${articles.length} articles`);

        const items: FeedItem[] = articles.map((article) => ({
            title: article.title,
            link: article.link,
            pubDate: article.date || '',
            contentSnippet: '',
            sourceName: source.name,
            sourceType: 'scrape' as const,
        }));

        console.log(`[SCRAPE] Found ${items.length} articles from ${source.name}`);
        return items;
    } catch (error) {
        console.error(`[SCRAPE] Failed to fetch ${source.name}:`, error);
        return [];
    }
}

// Fetch from all enabled sources
export async function fetchAllSources(): Promise<FeedItem[]> {
    const rssSources = getRssSources();
    const scrapeSources = getScrapeSources();

    console.log(`Fetching from ${rssSources.length} RSS sources and ${scrapeSources.length} scrape sources`);

    // Fetch RSS sources in parallel
    const rssPromises = rssSources.map(fetchRssSource);

    // Fetch scrape sources with some throttling
    const scrapePromises = scrapeSources.map(async (source, index) => {
        // Add small delay between scrape requests
        await new Promise(resolve => setTimeout(resolve, index * 300));
        return fetchScrapeSource(source);
    });

    const results = await Promise.all([...rssPromises, ...scrapePromises]);
    const allItems = results.flat();

    // Sort by date, newest first
    allItems.sort((a, b) => {
        const dateA = new Date(a.pubDate).getTime() || 0;
        const dateB = new Date(b.pubDate).getTime() || 0;
        return dateB - dateA;
    });

    console.log(`Total articles fetched: ${allItems.length}`);
    return allItems;
}

// Fetch with date range filtering
export async function fetchByDateRange(
    startDate?: string,
    endDate?: string,
    sources?: ThreatSource[]
): Promise<FeedItem[]> {
    // If specific sources provided, use those; otherwise use enabled
    let allItems: FeedItem[];

    if (sources && sources.length > 0) {
        const rssItems = await Promise.all(
            sources.filter(s => s.type === 'rss').map(fetchRssSource)
        );
        const scrapeItems = await Promise.all(
            sources.filter(s => s.type === 'scrape').map(fetchScrapeSource)
        );
        allItems = [...rssItems.flat(), ...scrapeItems.flat()];
    } else {
        allItems = await fetchAllSources();
    }

    // Apply date filtering
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = startDate ? new Date(startDate) : new Date(end);
    if (!startDate) {
        start.setDate(start.getDate() - 7);
    }
    start.setHours(0, 0, 0, 0);

    console.log(`Filtering articles from ${start.toISOString()} to ${end.toISOString()}`);

    const filtered = allItems.filter((item) => {
        if (!item.pubDate) {
            // Include items without dates (common for scraped sources)
            // They'll be filtered out later if needed
            return true;
        }
        const itemDate = new Date(item.pubDate);
        return itemDate >= start && itemDate <= end;
    });

    console.log(`Filtered to ${filtered.length} articles in date range`);

    // Sort by date
    filtered.sort((a, b) => {
        const dateA = new Date(a.pubDate).getTime() || 0;
        const dateB = new Date(b.pubDate).getTime() || 0;
        return dateB - dateA;
    });

    return filtered;
}
