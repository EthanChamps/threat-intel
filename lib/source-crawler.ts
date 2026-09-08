import type { Page } from 'playwright';
import { PlaywrightCrawler, playwrightUtils } from 'crawlee';
import { createCrawlConfiguration, browserCrawlOptions, runBrowserCrawl } from './crawler';

export interface ScrapedArticleInfo {
    title: string;
    link: string;
    date?: string;
}

export type ScrapeLogger = (message: string) => void;

export interface SourceCrawlOptions {
    articleSelector: string;
    titleSelector: string;
    linkSelector: string;
    dateSelector: string;
    loadMoreSelector?: string;
    maxScrolls?: number;
    scrollDelay?: number;
    loadMoreClicks?: number;
    maxPages?: number;
    paginationPattern?: string;
    onLog?: ScrapeLogger;
}

const DEFAULT_OPTIONS: Partial<SourceCrawlOptions> = {
    maxScrolls: 3,
    scrollDelay: 1000,
    loadMoreClicks: 10,
    maxPages: 1,
    paginationPattern: '/page/{n}/',
};

async function autoScroll(page: Page, maxScrolls: number, scrollDelay: number): Promise<void> {
    if (maxScrolls <= 0) return;
    let scrolls = 0;
    await playwrightUtils.infiniteScroll(page, {
        timeoutSecs: Math.max(1, Math.ceil(maxScrolls * scrollDelay / 1000)),
        waitForSecs: Math.max(1, Math.ceil(scrollDelay / 1000)),
        stopScrollCallback: () => ++scrolls >= maxScrolls,
    });
}

async function clickLoadMoreUntilDate(
    page: Page,
    selector: string,
    articleSelector: string,
    dateSelector: string,
    startTime: number | null,
    log: ScrapeLogger,
    maxClicks: number = 50,
    delay: number = 2500
): Promise<void> {
    let clickCount = 0;
    let previousArticleCount = await page.evaluate(
        (sel) => document.querySelectorAll(sel).length,
        articleSelector
    );

    log(`Found ${previousArticleCount} initial articles, looking for more...`);

    while (clickCount < maxClicks) {
        try {
            const button = await page.$(selector);
            if (!button) {
                log('No more "Load More" button found');
                break;
            }

            const isVisible = await button.isVisible();
            if (!isVisible) {
                log('"Load More" button not visible');
                break;
            }

            await button.scrollIntoViewIfNeeded();
            
            await button.click();
            clickCount++;
            await page.waitForFunction(
                ({ selector, previousCount }) => document.querySelectorAll(selector).length > previousCount,
                { selector: articleSelector, previousCount: previousArticleCount },
                { timeout: Math.max(1000, delay * 3) }
            );

            const newArticleCount = await page.evaluate(
                (sel) => document.querySelectorAll(sel).length,
                articleSelector
            );

            log(`Loaded more articles: ${previousArticleCount} → ${newArticleCount}`);

            if (newArticleCount === previousArticleCount) {
                log('No new articles loaded, stopping');
                break;
            }

            if (startTime) {
                const newestLoadedArticleDates = await page.evaluate(
                    ({ articleSel, dateSel, prevCount }) => {
                        const articles = document.querySelectorAll(articleSel);
                        const newArticles = Array.from(articles).slice(prevCount);
                        
                        return newArticles.map((article) => {
                            const dateEl = article.querySelector(dateSel);
                            if (!dateEl) return null;
                            const datetime = dateEl.getAttribute('datetime') || dateEl.textContent?.trim();
                            if (!datetime) return null;
                            const time = new Date(datetime).getTime();
                            return isNaN(time) ? null : time;
                        }).filter((t): t is number => t !== null);
                    },
                    { articleSel: articleSelector, dateSel: dateSelector, prevCount: previousArticleCount }
                );

                const allNewArticlesOld = newestLoadedArticleDates.length > 0 &&
                    newestLoadedArticleDates.every((t) => t < startTime);

                if (allNewArticlesOld) {
                    log('All new articles are older than date range, stopping');
                    break;
                }
            }

            previousArticleCount = newArticleCount;
        } catch {
            break;
        }
    }

    log(`Finished loading articles after ${clickCount} clicks`);
}

async function scrapeSinglePage(
    page: Page,
    url: string,
    opts: SourceCrawlOptions,
    startTime: number | null = null,
    log: ScrapeLogger = () => {}
): Promise<ScrapedArticleInfo[]> {
    log(`Loading page: ${url}`);
    await page.locator(opts.articleSelector).first().waitFor({ state: 'attached', timeout: 10000 });

    if (opts.loadMoreSelector) {
        log(`Using "Load More" button: ${opts.loadMoreSelector}`);
        await clickLoadMoreUntilDate(
            page,
            opts.loadMoreSelector,
            opts.articleSelector,
            opts.dateSelector,
            startTime,
            log,
            opts.loadMoreClicks!,
            opts.scrollDelay!
        );
    } else {
        log(`Auto-scrolling page (max ${opts.maxScrolls} scrolls)`);
    }

    await autoScroll(page, opts.maxScrolls!, opts.scrollDelay!);

    log('Extracting articles from page');
    return page.evaluate(
        ({ articleSelector, titleSelector, linkSelector, dateSelector, baseUrl }) => {
            const results: { title: string; link: string; date?: string }[] = [];
            const elements = document.querySelectorAll(articleSelector);

            elements.forEach((element) => {
                const titleEl = element.querySelector(titleSelector);
                const linkEl = element.querySelector(linkSelector) as HTMLAnchorElement | null;
                const dateEl = element.querySelector(dateSelector);

                const title = titleEl?.textContent?.trim() || linkEl?.textContent?.trim() || '';
                let link = linkEl?.href || '';

                if (link && !link.startsWith('http')) {
                    try {
                        const base = new URL(baseUrl);
                        link = new URL(link, base.origin).href;
                    } catch {
                        link = '';
                    }
                }

                let date: string | undefined;
                if (dateEl) {
                    const datetime = dateEl.getAttribute('datetime');
                    const text = dateEl.textContent?.trim();
                    const rawDate = datetime || text;

                    if (rawDate) {
                        const parsed = new Date(rawDate);
                        if (!isNaN(parsed.getTime())) {
                            date = parsed.toISOString();
                        }
                    }
                }

                if (title && /^https?:\/\//i.test(link)) {
                    const isDuplicate = results.some((r) => r.link === link);
                    if (!isDuplicate) {
                        results.push({ title, link, date });
                    }
                }
            });

            return results;
        },
        {
            articleSelector: opts.articleSelector,
            titleSelector: opts.titleSelector,
            linkSelector: opts.linkSelector,
            dateSelector: opts.dateSelector,
            baseUrl: url,
        }
    );
}

function buildPageUrl(baseUrl: string, pageNum: number, pattern: string): string {
    const url = new URL(baseUrl);
    const paginatedPath = pattern.replace('{n}', String(pageNum));
    
    if (url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1) + paginatedPath;
    } else {
        url.pathname = url.pathname + paginatedPath;
    }
    
    return url.toString();
}

export interface ScrapeWithDateOptions extends SourceCrawlOptions {
    startDate?: string;
    endDate?: string;
}

export async function crawlSource(
    url: string,
    options: ScrapeWithDateOptions
): Promise<ScrapedArticleInfo[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const log = opts.onLog || (() => {});
    const maxPages = Math.max(1, Math.min(50, opts.maxPages ?? 1));
    const startTime = opts.startDate ? new Date(`${opts.startDate}T00:00:00Z`).getTime() : null;
    const articles = new Map<string, ScrapedArticleInfo>();
    let firstPageError: Error | undefined;
    const crawler = new PlaywrightCrawler({
        ...browserCrawlOptions,
        maxConcurrency: 1,
        maxRequestsPerCrawl: opts.loadMoreSelector ? 1 : maxPages,
        requestHandlerTimeoutSecs: 120,
        async requestHandler({ page, request, crawler }) {
            const pageNumber = Number(request.userData.pageNumber);
            const found = await scrapeSinglePage(page, request.loadedUrl || request.url, opts, startTime, log);
            let added = 0;
            for (const article of found) {
                if (!articles.has(article.link)) {
                    articles.set(article.link, article);
                    added++;
                }
            }
            log(`Page ${pageNumber}: ${found.length} listings, ${added} new`);
            const allOlder = startTime !== null && found.length > 0 && found.every(article =>
                article.date && new Date(article.date).getTime() < startTime);
            if (!opts.loadMoreSelector && added > 0 && !allOlder && pageNumber < maxPages) {
                await crawler.addRequests([{
                    url: buildPageUrl(url, pageNumber + 1, opts.paginationPattern!),
                    userData: { pageNumber: pageNumber + 1 },
                }]);
            }
        },
        failedRequestHandler({ request }) {
            log(`Page ${request.userData.pageNumber} failed after retries`);
            if (request.userData.pageNumber === 1) firstPageError = new Error('Source could not be loaded or its article selector no longer matches.');
        },
    }, createCrawlConfiguration());
    // Crawlee owns pages and browsers; run() tears down its pool on success and errors.
    await runBrowserCrawl(crawler, [{ url, userData: { pageNumber: 1 } }]);
    if (firstPageError) throw firstPageError;
    return [...articles.values()];
}

export async function testScrapeSource(
    url: string,
    options: SourceCrawlOptions,
    startDate?: string,
    endDate?: string,
    onLog?: ScrapeLogger
): Promise<{
    articles: ScrapedArticleInfo[];
    totalBeforeFilter: number;
    articleCount: number;
}> {
    const log = onLog || (() => {});
    
    log(`Testing scrape source: ${url}`);
    
    const allArticles = await crawlSource(url, {
        ...options,
        startDate,
        endDate,
        onLog: log,
    });
    const totalBeforeFilter = allArticles.length;

    const startTime = startDate ? new Date(startDate + 'T00:00:00Z').getTime() : null;
    const endTime = endDate ? new Date(endDate + 'T23:59:59.999Z').getTime() : null;

    log(`Filtering ${totalBeforeFilter} articles by date range`);

    const filteredArticles = allArticles.filter((article) => {
        if (!startTime && !endTime) return true;
        if (!article.date) return false;

        const itemTime = new Date(article.date).getTime();
        if (startTime && itemTime < startTime) return false;
        if (endTime && itemTime > endTime) return false;
        return true;
    });

    log(`After filtering: ${filteredArticles.length} articles within date range`);

    return {
        articles: filteredArticles.slice(0, 5),
        totalBeforeFilter,
        articleCount: filteredArticles.length,
    };
}
