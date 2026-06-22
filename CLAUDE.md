# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint (flat config via eslint-config-next)
```

There is no test suite. Playwright is used as a scraping library (not for browser tests), so `playwright test` does not apply.

## Environment Setup

Copy `.env.example` to `.env.local` and add your Google Gemini API key:
```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

This is the only key required at runtime. `@ai-sdk/openai` is installed but not currently wired into any route.

## Architecture

**Threat Intel Analyst** — a Next.js 16 (App Router, React 19) app that aggregates cybersecurity articles from many sources, scrapes full content, deduplicates, and uses Google Gemini (`gemini-2.0-flash`) to extract structured threat intelligence using STIX 2.1 vocabulary, scored for UK financial-services relevance.

### Pipeline (the core flow)

The main analysis runs in `app/api/analyze-stream/route.ts` as an SSE generator and proceeds in distinct phases. `app/api/analyze-feed/route.ts` is the same pipeline without streaming (single JSON response). Keep the two in sync when changing pipeline logic — they duplicate it intentionally.

1. **Fetch listing** (`lib/fetcher.ts` → `fetchByDateRange`)
   - RSS sources parsed via `rss-parser`.
   - Scrape sources go through `lib/playwright-scraper.ts` (`scrapeWithPlaywright`) to collect article *links* from index/listing pages — supports infinite scroll, "Load More" button clicking (`loadMoreSelector`), and URL pagination (`paginationPattern`, default `/page/{n}/`).
   - Returns `FeedItem[]` (title + link + pubDate + source), date-filtered (defaults to last 7 days when no range given). Scraped items often lack dates and are kept at this stage.

2. **Scrape article content** (`lib/scraper.ts` → `scrapeArticles`)
   - Loads each article URL with Playwright, extracts main content via a cascade of content selectors, and re-extracts the publish date from meta tags / `<time>` — this is the authoritative date filter (items outside the range are dropped here).
   - Articles with <100 chars of content are discarded.

3. **Deduplicate** (`lib/deduplicator.ts` → `deduplicateArticles`)
   - Groups near-duplicate articles across sources using Jaccard similarity on significant title words (stop-word filtered), key-term extraction (CVE IDs, APT/actor names, vendors, platforms), and a content-snippet fallback. Default threshold 0.4.
   - Picks one `primary` per group (longest content/title); the rest become `duplicates` attached to the result. Reduces AI token spend.

4. **AI extraction** (`lib/extractor.ts`)
   - Processes unique articles in **batches of 5** via `generateObject()` (Vercel AI SDK) with `ThreatAnalysisArraySchema` (Zod) for structured output.
   - System prompt + schema enforce STIX 2.1 vocab and the UK-finance relevance heuristics — both live in `EXTRACTION_SYSTEM_PROMPT`. A batch failure is logged and skipped, not fatal.
   - Article content is truncated to 3000 chars per article before prompting.

### Persistence model

There is **no database**. All user state lives in browser `localStorage`:
- **Sources** (`lib/sources.ts`, key `threat-intel-sources`) — `DEFAULT_SOURCES` is the seed; user edits persist. Helpers: `getEnabledSources`, `getRssSources`, `getScrapeSources`, `switchSourceMode`.
- **Scans** (`lib/scans.ts`, keys `threat-intel-scans` / `threat-intel-current-scan`) — each `StoredScan` snapshots analyses, stats, logs, date range, and sources used. The frontend reloads the most recent scan on mount.

Because state is client-side, the API routes are stateless: the frontend passes the selected `sources` array (and date range) in the request body to each route.

### Playwright browser lifecycle

`lib/playwright-scraper.ts` holds a **singleton Chromium instance** (`getBrowser`/`closeBrowser`) launched headless with anti-bot flags; each scrape uses its own `BrowserContext`. On error paths, routes call `closeBrowser()` to avoid leaking the instance — preserve this when editing scrape error handling. Per-page anti-detection init scripts (spoofed `navigator.webdriver`, plugins, languages) and a desktop Chrome UA are applied in both `scraper.ts` and `playwright-scraper.ts`.

### Key types

- `ThreatSource` (`lib/sources.ts`) — RSS or scrape config. `canSwitchMode` + `rssUrl`/`scrapeUrl` let a source toggle between RSS and scraping; scrape configs carry CSS selectors and pagination/scroll options.
- `ThreatAnalysis` / `ThreatAnalysisWithDuplicates` (`lib/extractor.ts`) — Zod-validated AI result (STIX 2.1 aligned), optionally carrying merged `duplicates`.
- `FeedItem` (`lib/fetcher.ts`) — fetched article metadata flowing into the pipeline.
- `ScrapedArticle` (`lib/scraper.ts`) — URL + title + full content + date.

### API routes

- `POST /api/analyze-stream` — main SSE streaming pipeline; emits `status`/`progress`/`error`/`complete` events (`maxDuration` 300s).
- `POST /api/analyze-feed` — same pipeline, non-streaming (`maxDuration` 120s).
- `POST /api/test-source` — tests a single source's connectivity/selectors and returns a sample of up to 5 articles plus scrape logs (`maxDuration` 60s).

### STIX 2.1 vocabularies

Enforced via `as const` arrays in `lib/extractor.ts` and mirrored in the system prompt — change both together:
- `STIX_INDUSTRY_SECTORS` (target sector), `STIX_THREAT_ACTOR_TYPES` (actor classification), `STIX_ATTACK_PATTERNS` (attack technique).

### Legacy / dead code to be aware of

`lib/rss.ts` is an earlier RSS-only fetcher with its own hardcoded `DEFAULT_FEED_URLS` and a separate `FeedItem` type. The live pipeline uses `lib/fetcher.ts` instead — prefer `fetcher.ts` and don't confuse the two `FeedItem` definitions.

## Path Aliases

`@/*` maps to the project root (configured in `tsconfig.json`).
