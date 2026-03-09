'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Shield, Loader2, AlertTriangle, Zap, StopCircle } from 'lucide-react';
import { AnalysisTable } from '@/components/AnalysisTable';
import { SourceManager } from '@/components/SourceManager';
import { ScanManager } from '@/components/ScanManager';
import { DateRangeFilter, getDefaultDateRange, type DateRange } from '@/components/DateRangeFilter';
import { StatusLog, type LogEntry } from '@/components/StatusLog';
import type { ThreatSource } from '@/lib/sources';
import type { ThreatAnalysis } from '@/lib/extractor';
import { 
    StoredScan, 
    createScan, 
    saveScan, 
    getCurrentScanId, 
    setCurrentScanId, 
    clearCurrentScanId,
    getMostRecentScan 
} from '@/lib/scans';
import styles from './page.module.css';

interface Stats {
  total: number;
  analyzed: number;
  sourceStats?: Record<string, number>;
}

export default function Home() {
  const [analyses, setAnalyses] = useState<ThreatAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [articleLimit, setArticleLimit] = useState(25);
  const [selectedSources, setSelectedSources] = useState<ThreatSource[]>([]);
  const [currentScanId, setCurrentScanIdState] = useState<string | null>(null);
  const currentScanRef = useRef<StoredScan | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedScanId = getCurrentScanId();
    if (storedScanId) {
      setCurrentScanIdState(storedScanId);
    }
    
    const mostRecent = getMostRecentScan();
    if (mostRecent && mostRecent.analyses.length > 0) {
      setAnalyses(mostRecent.analyses);
      if (mostRecent.stats) {
        setStats({
          total: mostRecent.stats.totalArticles,
          analyzed: mostRecent.stats.analyzedArticles,
          sourceStats: mostRecent.stats.sourceStats,
        });
      }
      setLogs(mostRecent.logs);
      setCurrentScanIdState(mostRecent.id);
      setCurrentScanId(mostRecent.id);
      currentScanRef.current = mostRecent;
    }
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', phase?: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      message,
      type,
      phase,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  const stopAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog('Analysis stopped by user', 'error');
      setLoading(false);
    }
  }, [addLog]);

  const handleLoadScan = useCallback((scan: StoredScan) => {
    setAnalyses(scan.analyses);
    if (scan.stats) {
      setStats({
        total: scan.stats.totalArticles,
        analyzed: scan.stats.analyzedArticles,
        sourceStats: scan.stats.sourceStats,
      });
    } else {
      setStats(null);
    }
    setLogs(scan.logs);
    setCurrentScanIdState(scan.id);
    setCurrentScanId(scan.id);
    currentScanRef.current = scan;
    setError(null);
  }, []);

  const handleNewScan = useCallback(() => {
    setAnalyses([]);
    setStats(null);
    setLogs([]);
    setError(null);
    setCurrentScanIdState(null);
    clearCurrentScanId();
    currentScanRef.current = null;
  }, []);

  const handleScanDeleted = useCallback(() => {
    const deleted = currentScanRef.current;
    if (deleted && deleted.id === currentScanId) {
      handleNewScan();
    }
  }, [currentScanId, handleNewScan]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setLogs([]);
    setAnalyses([]);
    setStats(null);

    abortControllerRef.current = new AbortController();

    const newScan = createScan(
      { startDate: dateRange.startDate, endDate: dateRange.endDate },
      selectedSources.map(s => s.name)
    );
    currentScanRef.current = newScan;
    setCurrentScanIdState(newScan.id);
    setCurrentScanId(newScan.id);

    try {
      if (selectedSources.length === 0) {
        setError('No sources selected for analysis');
        addLog('No sources selected', 'error');
        setLoading(false);
        return;
      }
      addLog(`Starting analysis with ${selectedSources.length} selected sources`, 'info', 'init');

      const response = await fetch('/api/analyze-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: articleLimit,
          sources: selectedSources,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);

            if (currentEvent && currentData) {
              try {
                const data = JSON.parse(currentData);
                handleEvent(currentEvent, data);
              } catch {
                // Ignore parse errors
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled - already handled
      } else {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        addLog(message, 'error');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleEvent = (event: string, data: Record<string, unknown>) => {
    switch (event) {
      case 'status':
        addLog(data.message as string, 'info', data.phase as string);
        break;

      case 'progress':
        addLog(data.message as string, 'progress', data.phase as string);
        // Add partial results as they come in
        if (data.results && Array.isArray(data.results)) {
          setAnalyses(prev => [...prev, ...(data.results as ThreatAnalysis[])]);
        }
        break;

      case 'error':
        addLog(data.message as string, 'error', data.phase as string);
        if (data.fatal) {
          setError(data.message as string);
        }
        break;

      case 'complete':
        if (data.success) {
          addLog(`Analysis complete: ${data.analyzedArticles} articles analyzed`, 'success');
          const finalAnalyses = data.data as ThreatAnalysis[];
          const finalStats = {
            total: data.totalArticles as number,
            analyzed: data.analyzedArticles as number,
            sourceStats: data.sourceStats as Record<string, number>,
          };
          setAnalyses(finalAnalyses);
          setStats(finalStats);
          
          if (currentScanRef.current) {
            currentScanRef.current.analyses = finalAnalyses;
            currentScanRef.current.stats = {
              totalArticles: finalStats.total,
              analyzedArticles: finalStats.analyzed,
              sourceStats: finalStats.sourceStats,
            };
            currentScanRef.current.logs = logs;
            saveScan(currentScanRef.current);
          }
        }
        break;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Shield className={styles.logoIcon} />
          <h1 className={styles.title}>Threat Intel Analyst</h1>
        </div>
        <p className={styles.subtitle}>
          AI-powered cyber threat intelligence extraction (STIX 2.1)
        </p>
      </header>

      <main className={styles.main}>
        <section className={styles.controlPanel}>
          <div className={styles.panelContent}>
            <div className={styles.panelInfo}>
              <h2 className={styles.panelTitle}>Threat Analysis</h2>
              <p className={styles.panelDescription}>
                Aggregate and analyze articles from multiple threat intel sources.
                Results use STIX 2.1 vocabulary for sectors and threat actor types.
              </p>
            </div>

            {loading ? (
              <button onClick={stopAnalysis} className={styles.stopButton}>
                <StopCircle className={styles.buttonIcon} />
                Stop Analysis
              </button>
            ) : (
              <button onClick={runAnalysis} className={styles.analyzeButton}>
                <Zap className={styles.buttonIcon} />
                Run Analysis
              </button>
            )}
          </div>

          {stats && (
            <div className={styles.statsBar}>
              <span className={styles.stat}>
                <strong>{stats.total}</strong> articles fetched
              </span>
              <span className={styles.statDivider}>•</span>
              <span className={styles.stat}>
                <strong>{stats.analyzed}</strong> successfully analyzed
              </span>
              {stats.sourceStats && Object.keys(stats.sourceStats).length > 0 && (
                <>
                  <span className={styles.statDivider}>•</span>
                  <span className={styles.stat}>
                    from <strong>{Object.keys(stats.sourceStats).length}</strong> sources
                  </span>
                </>
              )}
            </div>
          )}
        </section>

        <StatusLog logs={logs} isRunning={loading} onStop={stopAnalysis} />

        <ScanManager 
          currentScanId={currentScanId}
          onLoadScan={handleLoadScan}
          onNewScan={handleNewScan}
          onScanDeleted={handleScanDeleted}
        />

        <SourceManager dateRange={dateRange} onSelectedSourcesChange={setSelectedSources} />

        <DateRangeFilter onChange={setDateRange} />

        <section className={styles.limitSection}>
          <label className={styles.limitLabel}>
            <span>Article Limit</span>
            <div className={styles.limitControls}>
              {[25, 50, 100, 200].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setArticleLimit(preset)}
                  className={`${styles.limitPreset} ${articleLimit === preset ? styles.limitPresetActive : ''}`}
                  disabled={loading}
                >
                  {preset}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="500"
                value={articleLimit}
                onChange={(e) => setArticleLimit(Math.max(1, Math.min(500, parseInt(e.target.value) || 25)))}
                className={styles.limitInput}
                disabled={loading}
              />
            </div>
          </label>
        </section>

        {error && (
          <div className={styles.errorBanner}>
            <AlertTriangle className={styles.errorIcon} />
            <span>{error}</span>
          </div>
        )}

        <section className={styles.resultsSection}>
          <AnalysisTable data={analyses} />
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Powered by <strong>Vercel AI SDK</strong> + <strong>Google Gemini</strong>
        </p>
      </footer>
    </div>
  );
}
