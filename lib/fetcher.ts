import Parser from 'rss-parser';
import { ThreatSource, getEnabledSources } from './sources';
import { crawlSource } from './source-crawler';

export interface FeedItem {
    title: string;
    link: string;
    pubDate: string;
    contentSnippet?: string;
    sourceName: string;
    sourceType: 'rss' | 'scrape';
}

const parser = new Parser({ timeout: 15000 });

// Fetch articles from RSS sources
async function fetchRssSource(source: ThreatSource): Promise<FeedItem[]> {
    try {
        console.log(`[RSS] Fetching: ${source.name}`);
        
        const feed = await parser.parseURL(source.url);
        return feed.items.map(item => ({
            title: item.title || 'Untitled',
            link: item.link || '',
            pubDate: item.pubDate || item.isoDate || '',
            contentSnippet: item.contentSnippet || item.summary || '',
            sourceName: source.name,
            sourceType: 'rss' as const,
        }));
    } catch (error) {
        console.error(`[RSS] Failed to fetch ${source.name}:`, error instanceof Error ? error.message : error);
        return [];
    }
}

async function fetchScrapeSource(source: ThreatSource, startDate?: string, endDate?: string): Promise<FeedItem[]> {
    console.log(`[SCRAPE] Starting fetch for: ${source.name}`);
    try {
        console.log(`[SCRAPE] About to call crawlSource...`);

        const articles = await crawlSource(source.url, {
            articleSelector: source.articleSelector || 'article, .post, .blog-item',
            titleSelector: source.titleSelector || 'h2, h3, .title',
            linkSelector: source.linkSelector || 'a',
            dateSelector: source.dateSelector || 'time, .date, .published',
            loadMoreSelector: source.loadMoreSelector,
            maxScrolls: source.maxScrolls ?? 5,
            maxPages: source.maxPages ?? 1,
            paginationPattern: source.paginationPattern ?? '/page/{n}/',
            startDate,
            endDate,
            onLog: (msg) => console.log(`[SCRAPE:${source.name}] ${msg}`),
        });

        console.log(`[SCRAPE] crawlSource returned ${articles.length} articles`);

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
    const sources = getEnabledSources();
    return collectSources(sources);
}

async function collectSources(sources: ThreatSource[], startDate?: string, endDate?: string): Promise<FeedItem[]> {
    const rss = Promise.all(sources.filter(source => source.type === 'rss').map(fetchRssSource));
    const scraped: FeedItem[] = [];
    // One listing crawler at a time keeps the total browser count bounded.
    for (const source of sources.filter(source => source.type === 'scrape')) {
        scraped.push(...await fetchScrapeSource(source, startDate, endDate));
    }
    return [...(await rss).flat(), ...scraped].sort((a, b) =>
        (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
}

export async function fetchByDateRange(
    startDate?: string,
    endDate?: string,
    sources?: ThreatSource[]
): Promise<FeedItem[]> {
    // Apply date filtering
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    end.setUTCHours(23, 59, 59, 999);

    const start = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date(end);
    if (!startDate) {
        start.setUTCDate(start.getUTCDate() - 7);
    }
    start.setUTCHours(0, 0, 0, 0);

    const allItems = await collectSources(sources ?? getEnabledSources(), start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));

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
