import { NextRequest, NextResponse } from 'next/server';
import type { ThreatSource } from '@/lib/sources';
import { runCorpusAnalysis } from '@/lib/corpus-analysis';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const result = await runCorpusAnalysis({
            sources: body.sources as ThreatSource[] | undefined,
            startDate: body.startDate as string | undefined,
            endDate: body.endDate as string | undefined,
        });
        return NextResponse.json({ success: true, data: result.data, totalArticles: result.stats.eligible, scrapedArticles: result.stats.scraped, uniqueArticles: result.stats.unique, duplicatesRemoved: result.stats.duplicatesRemoved, analyzedArticles: result.stats.analyzed + result.stats.reused, newArticles: result.stats.scraped, reusedArticles: result.stats.reused, scrapeFailed: result.stats.scrapeFailed, analysisFailed: result.stats.analysisFailed, sourceStats: result.sourceStats });
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'An error occurred' }, { status: 500 });
    }
}
