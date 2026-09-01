import type { ThreatSource } from '@/lib/sources';
import { runCorpusAnalysis } from '@/lib/corpus-analysis';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* use the previous week */ }
    const encoder = new TextEncoder();
    const formatEvent = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const result = await runCorpusAnalysis({
                    sources: body.sources as ThreatSource[] | undefined,
                    startDate: body.startDate as string | undefined,
                    endDate: body.endDate as string | undefined,
                }, ({ event, data }) => controller.enqueue(encoder.encode(formatEvent(event, data))));
                controller.enqueue(encoder.encode(formatEvent('complete', {
                    success: true, data: result.data,
                    totalArticles: result.stats.eligible, scrapedArticles: result.stats.scraped,
                    uniqueArticles: result.stats.unique, duplicatesRemoved: result.stats.duplicatesRemoved,
                    analyzedArticles: result.stats.analyzed + result.stats.reused,
                    newArticles: result.stats.scraped, reusedArticles: result.stats.reused,
                    scrapeFailed: result.stats.scrapeFailed, analysisFailed: result.stats.analysisFailed,
                    sourceStats: result.sourceStats,
                })));
            } catch (error) {
                controller.enqueue(encoder.encode(formatEvent('error', { message: error instanceof Error ? error.message : 'Unknown error', fatal: true })));
            } finally { controller.close(); }
        },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
