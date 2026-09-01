# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16 App Router application. Pages and API handlers live in `app/`; endpoints are under `app/api/`. Reusable React UI belongs in `components/`, with CSS modules alongside components. Data-fetching, scraping, deduplication, persistence helpers, and AI pipeline logic belong in `lib/`. Configuration is at the repository root. Browser state is persisted in `localStorage`; there is no database.

The analysis pipeline is duplicated intentionally in `app/api/analyze-stream/route.ts` and `app/api/analyze-feed/route.ts`; keep both implementations synchronized when changing pipeline behavior.

## Build, Test, and Development Commands

Run `npm install` to install dependencies and `npx playwright install` to install Chromium for scraping. Use:

- `npm run dev` — start the development server at `http://localhost:3000`.
- `npm run lint` — run ESLint with the Next.js flat configuration.
- `npm run build` — create a production build and catch type/build errors.
- `npm start` — serve the production build locally.

Set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local` before exercising AI analysis routes. Never commit local environment files or secrets.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Follow the existing ESLint rules, two-space indentation, semicolons, and single quotes where the surrounding file uses them. Name components and component files in PascalCase (`AnalysisTable.tsx`), utility modules in lowercase (`deduplicator.ts`), and API route files as `route.ts`. Use the `@/*` path alias for root-relative imports when it improves clarity. Keep styles in CSS modules unless a shared/global rule is required.

## Testing Guidelines

No test framework or coverage threshold is currently configured. For every change, run `npm run lint` and `npm run build`; manually verify affected flows in the dev server, especially scraping and streaming responses. Do not use `playwright test`—Playwright is a scraping dependency, not a browser-test suite here.

## Commit & Pull Request Guidelines

Use short, imperative Conventional Commit-style subjects such as `feat: add source filter`, `fix: handle empty feed`, `docs: update setup`, or `chore: remove unused asset`. Pull requests should explain the user-visible and architectural impact, list validation commands run, link the relevant issue when one exists, and include screenshots or recordings for UI changes. Call out environment, scraping, or API behavior changes explicitly.

## Architecture & Safety Notes

Preserve the Playwright singleton cleanup on route error paths. Keep STIX vocabulary arrays and the extraction system prompt in `lib/extractor.ts` synchronized. Treat scraped content and AI output as untrusted input, and avoid logging API keys or sensitive article data.
