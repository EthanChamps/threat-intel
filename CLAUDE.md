# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Setup

Copy `.env.example` to `.env.local` and add your Google Gemini API key:
```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

## Architecture

**Threat Intel Analyst** - A Next.js 16 app that aggregates cybersecurity articles from multiple sources, scrapes content, and uses Google Gemini to extract structured threat intelligence using STIX 2.1 vocabulary.

### Data Flow

1. **Source Fetching** (`lib/fetcher.ts`, `lib/sources.ts`)
   - RSS feeds parsed via `rss-parser`
   - Web scraping via `cheerio` for non-RSS sources
   - Sources configurable via localStorage (defaults in `lib/sources.ts`)

2. **Article Processing** (`app/api/analyze-stream/route.ts`)
   - SSE streaming endpoint for real-time progress
   - Scrapes full article content via `lib/scraper.ts` (note: may need implementation)
   - Batches articles (5 per batch) for AI analysis

3. **AI Analysis** (`lib/extractor.ts`)
   - Uses Vercel AI SDK with `@ai-sdk/google` (Gemini 2.0 Flash)
   - `generateObject()` with Zod schema for structured output
   - Extracts: target country/sector, threat actor type/name, attack pattern, UK finance relevance

4. **Frontend** (`app/page.tsx`)
   - Client component with SSE consumption
   - `@tanstack/react-table` for results display
   - Source management persisted to localStorage

### Key Types

- `ThreatSource` - RSS or scrape source configuration (supports mode switching via `canSwitchMode`)
- `ThreatAnalysis` - Zod-validated AI extraction result (STIX 2.1 aligned)
- `FeedItem` - Fetched article metadata

### API Routes

- `POST /api/analyze-stream` - Main SSE streaming analysis (5min timeout)
- `POST /api/analyze-feed` - Non-streaming batch analysis (2min timeout)
- `POST /api/test-source` - Test individual source connectivity

### STIX 2.1 Vocabularies

The app enforces STIX 2.1 terminology defined in `lib/extractor.ts`:
- `STIX_INDUSTRY_SECTORS` - Target sector values
- `STIX_THREAT_ACTOR_TYPES` - Actor classification
- `STIX_ATTACK_PATTERNS` - Attack technique categories

## Path Aliases

`@/*` maps to project root (configured in `tsconfig.json`)
