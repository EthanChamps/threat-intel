import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { crawlSource, testScrapeSource } from '../lib/source-crawler';
import { scrapeArticles } from '../lib/scraper';
import { fetchByDateRange } from '../lib/fetcher';

// Real Crawlee and Chromium against deterministic local pages; no Gemini or external sites.
async function main() {
    console.log('Verifying crawling against local fixture pages...');
    const hits = new Map<string, number>();
    const listing = (title: string, href: string, date: string) =>
        `<article><h2><a href="${href}">${title}</a></h2><time datetime="${date}"></time></article>`;
    const text = 'Fixture security reporting about a phishing campaign and the affected organisations. '.repeat(5);
    const server = createServer((req, res) => {
        const path = req.url || '/';
        const count = (hits.get(path) || 0) + 1;
        hits.set(path, count);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (path === '/retry' && count === 1 || path === '/failed') {
            res.writeHead(500).end('Temporary fixture failure');
        } else if (path === '/listing') {
            res.end(listing('Recent', '/article', '2026-09-08') + listing('Duplicate', '/article', '2026-09-08'));
        } else if (path === '/listing/page/2/') {
            res.end(listing('Older', '/old', '2026-08-01'));
        } else if (path === '/load-more') {
            res.end(`${listing('Recent', '/article', '2026-09-08')}<button id="more" onclick="this.insertAdjacentHTML('beforebegin', '${listing('Older', '/old', '2026-08-01').replaceAll('"', '&quot;')}');this.remove()">More</button>`);
        } else if (path === '/feed') {
            res.setHeader('Content-Type', 'application/rss+xml');
            res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><link>http://localhost</link><description>Fixture feed</description><item><title>Feed article</title><link>http://${req.headers.host}/article</link><pubDate>Tue, 08 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>`);
        } else if (path === '/article' || path === '/retry' || path === '/old') {
            res.end(`<html><head><meta property="article:published_time" content="${path === '/old' ? '2026-08-01' : '2026-09-08'}"></head><body><nav>Navigation to remove</nav><article><h1>Fixture title</h1><p>${text}</p></article></body></html>`);
        } else {
            res.writeHead(404).end('Not found');
        }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const options = {
        articleSelector: 'article', titleSelector: 'h2', linkSelector: 'a', dateSelector: 'time',
        maxScrolls: 0, maxPages: 3, startDate: '2026-09-01', endDate: '2026-09-08',
    };
    const sigintListeners = process.listenerCount('SIGINT');
    try {
        const listings = await crawlSource(`${base}/listing`, options);
        assert.equal(listings.length, 2, 'Deduplicate listings and visit page two');
        assert.equal(hits.get('/listing/page/3/'), undefined, 'Stop when every dated listing is old');
        const sample = await testScrapeSource(`${base}/listing`, options, options.startDate, options.endDate);
        assert.equal(sample.articleCount, 1, 'Source test filters old listings');
        assert.equal(sample.totalBeforeFilter, 2);
        const loaded = await crawlSource(`${base}/load-more`, { ...options, loadMoreSelector: '#more', scrollDelay: 20 });
        assert.equal(loaded.length, 2, 'Load-more works without a WordPress AJAX endpoint');
        const concurrent = await Promise.all([
            crawlSource(`${base}/listing`, { ...options, maxPages: 1 }),
            crawlSource(`${base}/listing`, { ...options, maxPages: 1 }),
        ]);
        assert.deepEqual(concurrent.map(items => items.length), [1, 1], 'Concurrent crawls have independent queues');
        const articles = await scrapeArticles([`${base}/article`, `${base}/article`, `${base}/retry`, `${base}/failed`]);
        assert.equal(articles.length, 3, 'Each unique requested URL has a result');
        assert.equal(articles[0].title, 'Fixture title');
        assert(!articles[0].content.includes('Navigation to remove'));
        assert.equal(articles[0].pubDate, '2026-09-08T00:00:00.000Z');
        assert(articles[1].content.length > 100, 'Retry recovers from a transient server error');
        assert.equal(articles[2].content, '', 'Exhausted failures remain visible to the corpus');
        assert.equal(hits.get('/retry'), 2);
        assert.equal(hits.get('/failed'), 3, 'Two retries after initial request');
        const inRange = await scrapeArticles([`${base}/article`, `${base}/old`], options);
        assert.equal(inRange.length, 1, 'Article dates are filtered inclusively');
        await assert.rejects(crawlSource(`${base}/failed`, options), /Source could not be loaded/);
        assert.equal((await crawlSource(`${base}/listing`, { ...options, maxPages: 1 })).length, 1, 'Failure does not break the next crawl');
        const feed = await fetchByDateRange(options.startDate, options.endDate, [{ id: 'fixture', name: 'Fixture', type: 'rss', enabled: true, url: `${base}/feed` }]);
        assert.equal(feed.length, 1, 'RSS discovery is preserved');
        assert.deepEqual(await fetchByDateRange(options.startDate, options.endDate, []), [], 'Empty selection does not crawl default sources');
        const appUrl = process.argv.find(arg => arg.startsWith('--app-url='))?.slice('--app-url='.length);
        if (appUrl) {
            const response = await fetch(`${appUrl}/api/test-source`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: { ...options, id: 'fixture', name: 'Fixture', type: 'scrape', enabled: true, url: `${base}/listing` },
                    startDate: options.startDate, endDate: options.endDate,
                }),
            });
            assert.equal(response.status, 200);
            const result = await response.json();
            assert.equal(result.success, true, JSON.stringify(result));
            assert.equal(result.articleCount, 1, 'Next.js source-test route runs Crawlee');
            console.log('PASS: Next.js source-test API.');
        }
        assert.equal(process.listenerCount('SIGINT'), sigintListeners, 'Crawlee removes its shutdown listeners');
        console.log('PASS: pagination, dates, deduplication, load-more, queue isolation, extraction, retries, failures, cleanup and RSS.');
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
