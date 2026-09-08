import { randomUUID } from 'node:crypto';
import { Configuration, Log, LogLevel, NonRetryableError, type PlaywrightCrawler, type PlaywrightCrawlerOptions } from 'crawlee';

/** Each crawl owns its queue and storage; concurrent API requests cannot purge each other. */
export function createCrawlConfiguration(): Configuration {
    const id = randomUUID();
    return new Configuration({
        persistStorage: false,
        purgeOnStart: false,
        defaultRequestQueueId: id,
        defaultKeyValueStoreId: id,
        defaultDatasetId: id,
    });
}

export const browserCrawlOptions: PlaywrightCrawlerOptions = {
    maxConcurrency: 3,
    maxRequestRetries: 2,
    maxSessionRotations: 2,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 45,
    // Avoid logging request bodies, page contents or retry stack traces.
    log: new Log({ level: LogLevel.OFF }),
    launchContext: { launchOptions: { headless: true } },
    preNavigationHooks: [async (_context, gotoOptions) => {
        gotoOptions.waitUntil = 'domcontentloaded';
    }],
    postNavigationHooks: [async ({ response }) => {
        const status = response?.status() ?? 0;
        if (status === 404 || status === 410) throw new NonRetryableError(`HTTP ${status}`);
        if (status >= 400) throw new Error(`HTTP ${status}`);
    }],
};

/** Cover startup failures too: these can occur before Crawlee enters run()'s finally block. */
export async function runBrowserCrawl(
    crawler: PlaywrightCrawler,
    requests: Parameters<PlaywrightCrawler['run']>[0]
): Promise<void> {
    try {
        await crawler.run(requests);
    } finally {
        await crawler.browserPool.destroy();
    }
}
