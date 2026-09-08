import * as cheerio from 'cheerio';
import { PlaywrightCrawler } from 'crawlee';
import { createCrawlConfiguration, browserCrawlOptions, runBrowserCrawl } from './crawler';

export interface ScrapedArticle {
    url: string;
    title: string;
    content: string;
    pubDate?: string;
}

export interface ScrapeOptions {
    startDate?: string;
    endDate?: string;
}

function extractDate($: cheerio.CheerioAPI): string | undefined {
    // Try common date meta tags first
    const metaSelectors = [
        'meta[property="article:published_time"]',
        'meta[property="og:published_time"]',
        'meta[name="pubdate"]',
        'meta[name="publishdate"]',
        'meta[name="date"]',
        'meta[itemprop="datePublished"]',
    ];

    for (const selector of metaSelectors) {
        const content = $(selector).attr('content');
        if (content) {
            const parsed = new Date(content);
            if (!isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }
    }

    // Try time elements with datetime attribute
    const timeEl = $('time[datetime]').first();
    if (timeEl.length > 0) {
        const datetime = timeEl.attr('datetime');
        if (datetime) {
            const parsed = new Date(datetime);
            if (!isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }
    }

    // Try common date class selectors
    const dateSelectors = [
        '.published-date',
        '.post-date',
        '.article-date',
        '.entry-date',
        '.date',
        '[class*="publish"]',
        '[class*="date"]',
    ];

    for (const selector of dateSelectors) {
        const text = $(selector).first().text().trim();
        if (text) {
            const parsed = new Date(text);
            if (!isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }
    }

    return undefined;
}

function isWithinDateRange(pubDate: string | undefined, startDate?: Date, endDate?: Date): boolean {
    // If no date range specified, include all
    if (!startDate && !endDate) return true;

    // If article has no date and we have a range, exclude it
    if (!pubDate) return false;

    const articleDate = new Date(pubDate);
    if (isNaN(articleDate.getTime())) return false;

    if (startDate && articleDate < startDate) return false;
    if (endDate && articleDate > endDate) return false;

    return true;
}

function extractArticle(url: string, html: string): ScrapedArticle {
    const $ = cheerio.load(html);
    // Extract date before removing elements
    const pubDate = extractDate($);

    // Remove non-content elements
    $('script, style, nav, header, footer, aside, .sidebar, .comments, .advertisement, .ad, .social-share').remove();

    // Extract title
    const title = $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim() ||
        '';

    // Extract main content - try common article selectors
    const contentSelectors = [
        'article',
        '[role="main"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content',
        'main',
        '.blog-post',
        '.post-body',
    ];

    let content = '';
    for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
            content = element.text().trim();
            if (content.length > 200) break;
        }
    }

    // Fallback to body if no content found
    if (!content || content.length < 200) {
        content = $('body').text().trim();
    }

    // Clean up whitespace
    content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();

    return { url, title, content, pubDate };
}

export async function scrapeArticles(urls: string[], options?: ScrapeOptions): Promise<ScrapedArticle[]> {
    if (urls.length === 0) return [];
    const results = new Map<string, ScrapedArticle>();
    const uniqueUrls = [...new Set(urls)];
    const start = options?.startDate ? new Date(`${options.startDate}T00:00:00Z`) : undefined;
    const end = options?.endDate ? new Date(`${options.endDate}T23:59:59.999Z`) : undefined;
    const crawler = new PlaywrightCrawler({
        ...browserCrawlOptions,
        maxRequestsPerCrawl: uniqueUrls.length,
        async requestHandler({ page, request }) {
            await page.locator('article, main, [role="main"], .post-content, .entry-content, h1').first()
                .waitFor({ state: 'attached', timeout: 10000 });
            await page.waitForFunction(() => (document.body.textContent || '').trim().length >= 100,
                undefined, { timeout: 10000 });
            const article = extractArticle(request.url, await page.content());
            if (article.content.length < 100) throw new Error('Article has insufficient content');
            results.set(request.url, article);
        },
        failedRequestHandler({ request }) {
            results.set(request.url, { url: request.url, title: '', content: '' });
        },
    }, createCrawlConfiguration());
    await runBrowserCrawl(crawler, uniqueUrls.map(url => ({ url, uniqueKey: url })));
    return uniqueUrls.flatMap(url => {
        const article = results.get(url);
        return article && isWithinDateRange(article.pubDate, start, end) ? [article] : [];
    });
}
