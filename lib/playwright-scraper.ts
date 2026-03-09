import { chromium, Browser, Page } from 'playwright';

export interface ScrapedArticleInfo {
    title: string;
    link: string;
    date?: string;
}

export type ScrapeLogger = (message: string) => void;

export interface PlaywrightScrapeOptions {
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

const DEFAULT_OPTIONS: Partial<PlaywrightScrapeOptions> = {
    maxScrolls: 3,
    scrollDelay: 1000,
    loadMoreClicks: 3,
    maxPages: 1,
    paginationPattern: '/page/{n}/',
};

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
            ],
        });
    }
    return browserInstance;
}

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

async function autoScroll(page: Page, maxScrolls: number, scrollDelay: number): Promise<void> {
    let previousHeight = 0;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        
        if (currentHeight === previousHeight) {
            break;
        }

        previousHeight = currentHeight;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(scrollDelay);
        scrollCount++;
    }
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
            
            await Promise.all([
                page.waitForResponse(
                    (response) => response.url().includes('admin-ajax.php'),
                    { timeout: 10000 }
                ).catch(() => {}),
                page.evaluate((sel) => {
                    const btn = document.querySelector(sel) as HTMLElement;
                    if (btn) btn.click();
                }, selector),
            ]);
            
            clickCount++;
            await page.waitForTimeout(delay);

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
    opts: PlaywrightScrapeOptions,
    startTime: number | null = null,
    log: ScrapeLogger = () => {}
): Promise<ScrapedArticleInfo[]> {
    log(`Loading page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    if (opts.loadMoreSelector) {
        log(`Using "Load More" button: ${opts.loadMoreSelector}`);
        await clickLoadMoreUntilDate(
            page,
            opts.loadMoreSelector,
            opts.articleSelector,
            opts.dateSelector,
            startTime,
            log,
            50,
            2500
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

                if (title && link) {
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

export interface ScrapeWithDateOptions extends PlaywrightScrapeOptions {
    startDate?: string;
    endDate?: string;
}

export async function scrapeWithPlaywright(
    url: string,
    options: ScrapeWithDateOptions
): Promise<ScrapedArticleInfo[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const log = opts.onLog || ((msg: string) => console.log(`[PLAYWRIGHT] ${msg}`));
    
    log(`Starting Playwright scrape for: ${url}`);
    if (opts.startDate) log(`Date filter: from ${opts.startDate}`);
    if (opts.endDate) log(`Date filter: to ${opts.endDate}`);
    
    log('Getting browser...');
    const browser = await getBrowser();
    log('Browser obtained');
    
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
    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    const startTime = opts.startDate ? new Date(opts.startDate).getTime() : null;
    const maxPages = opts.maxPages || 50;

    try {
        const allArticles: ScrapedArticleInfo[] = [];
        const seenLinks = new Set<string>();

        if (opts.loadMoreSelector) {
            log('Using "Load More" mode');
            const pageArticles = await scrapeSinglePage(page, url, opts, startTime, log);
            for (const article of pageArticles) {
                if (!seenLinks.has(article.link)) {
                    seenLinks.add(article.link);
                    allArticles.push(article);
                }
            }
            log(`Collected ${allArticles.length} unique articles`);
        } else {
            log('Using pagination mode');
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                const pageUrl = pageNum === 1 ? url : buildPageUrl(url, pageNum, opts.paginationPattern!);
                
                try {
                    const pageArticles = await scrapeSinglePage(page, pageUrl, opts, startTime, log);
                    
                    if (pageArticles.length === 0 && pageNum > 1) {
                        log(`Page ${pageNum} returned no articles, stopping pagination`);
                        break;
                    }

                    let oldArticleCount = 0;
                    for (const article of pageArticles) {
                        if (!seenLinks.has(article.link)) {
                            seenLinks.add(article.link);
                            allArticles.push(article);
                            
                            if (startTime && article.date) {
                                const articleTime = new Date(article.date).getTime();
                                if (articleTime < startTime) {
                                    oldArticleCount++;
                                }
                            }
                        }
                    }

                    log(`Page ${pageNum}: found ${pageArticles.length} articles, ${oldArticleCount} older than date range`);

                    if (startTime && oldArticleCount > 0 && oldArticleCount >= pageArticles.length / 2) {
                        log('More than half of articles are older than date range, stopping pagination');
                        break;
                    }
                } catch {
                    if (pageNum === 1) throw new Error(`Failed to load ${pageUrl}`);
                    log(`Failed to load page ${pageNum}, stopping pagination`);
                    break;
                }
            }
            log(`Collected ${allArticles.length} unique articles across pages`);
        }

        return allArticles;
    } finally {
        await context.close();
        log('Browser context closed');
    }
}

export async function testScrapeSource(
    url: string,
    options: PlaywrightScrapeOptions,
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
    
    const allArticles = await scrapeWithPlaywright(url, {
        ...options,
        startDate,
        endDate,
        onLog: log,
    });
    const totalBeforeFilter = allArticles.length;

    const startTime = startDate ? new Date(startDate).getTime() : null;
    const endTime = endDate ? new Date(endDate + 'T23:59:59').getTime() : null;

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
