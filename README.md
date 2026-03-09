# Threat Intel Analyzer

A Next.js application that aggregates, scrapes, and analyzes threat intelligence feeds using AI.

## Prerequisites

- Node.js (v18+ recommended)
- A [Google Gemini API Key](https://aistudio.google.com/apikey) (Free tier available)

## Setup & Installation

1. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   # or
   yarn install
   ```

2. **Environment Configuration**  
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and add your Google Gemini API key:
   ```env
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
   ```

3. **Install Browser Dependencies**  
   This project uses Playwright for web scraping. You need to install the browser binaries:
   ```bash
   npx playwright install
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

## Features
- **Source & Feed Management**: Add and manage various RSS feeds and threat intel sources.
- **Automated Scraping**: Fetches and parses article content automatically.
- **AI Analysis**: Extracts key indicators of compromise (IoCs) and threat data using Google Gemini.
- **Dashboard**: View organized, deduplicated threat intelligence in a real-time table layout.
