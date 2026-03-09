import * as cheerio from 'cheerio';
import { getBrowser, closeBrowser } from './playwright-scraper';
import type { BrowserContext } from 'playwright';

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

async function createBrowserContext(): Promise<BrowserContext> {
    const browser = await getBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        },
    });

    return context;
}

async function scrapeArticleWithPlaywright(url: string, context: BrowserContext): Promise<ScrapedArticle> {
    const page = await context.newPage();

    // Anti-bot measures
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000); // Let page settle

        const html = await page.content();
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
    } catch (error) {
        console.error(`[SCRAPER] Failed to scrape ${url}:`, error);
        return { url, title: '', content: '' };
    } finally {
        await page.close();
    }
}

export async function scrapeArticles(urls: string[], options?: ScrapeOptions): Promise<ScrapedArticle[]> {
    const results: ScrapedArticle[] = [];
    const batchSize = 3; // Reduced batch size for Playwright (more resource intensive)

    // Parse date range if provided
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (options?.startDate) {
        startDate = new Date(options.startDate);
        startDate.setHours(0, 0, 0, 0);
    }
    if (options?.endDate) {
        endDate = new Date(options.endDate);
        endDate.setHours(23, 59, 59, 999);
    }

    let context: BrowserContext | null = null;

    try {
        context = await createBrowserContext();

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(url => scrapeArticleWithPlaywright(url, context!))
            );

            // Filter by date range if specified
            for (const article of batchResults) {
                if (isWithinDateRange(article.pubDate, startDate, endDate)) {
                    results.push(article);
                } else if (article.pubDate) {
                    console.log(`[SCRAPER] Filtered out ${article.url} - date ${article.pubDate} outside range`);
                }
            }

            // Small delay between batches
            if (i + batchSize < urls.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`[SCRAPER] Scraped ${results.filter(r => r.content.length > 0).length}/${urls.length} articles successfully`);
        return results;
    } catch (error) {
        console.error('[SCRAPER] Error during scraping:', error);
        await closeBrowser();
        throw error;
    } finally {
        if (context) {
            await context.close();
        }
    }
}
