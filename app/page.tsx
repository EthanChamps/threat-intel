'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Shield, AlertTriangle, ArrowRight, StopCircle } from 'lucide-react';
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
  newArticles?: number;
  reusedArticles?: number;
  scrapeFailed?: number;
  analysisFailed?: number;
  preFiltered?: number;
  triageSkipped?: number;
  belowBar?: number;
}

export default function Home() {
  const [analyses, setAnalyses] = useState<ThreatAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedSources, setSelectedSources] = useState<ThreatSource[]>([]);
  const [currentScanId, setCurrentScanIdState] = useState<string | null>(null);
  const currentScanRef = useRef<StoredScan | null>(null);

  const logsRef = useRef<LogEntry[]>([]);
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
          newArticles: mostRecent.stats.newArticles,
          reusedArticles: mostRecent.stats.reusedArticles,
          scrapeFailed: mostRecent.stats.scrapeFailed,
          analysisFailed: mostRecent.stats.analysisFailed,
          preFiltered: mostRecent.stats.preFiltered,
          triageSkipped: mostRecent.stats.triageSkipped,
          belowBar: mostRecent.stats.belowBar,
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
    logsRef.current = [...logsRef.current, entry];
    setLogs(logsRef.current);
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
          newArticles: scan.stats.newArticles,
          reusedArticles: scan.stats.reusedArticles,
          scrapeFailed: scan.stats.scrapeFailed,
          analysisFailed: scan.stats.analysisFailed,
          preFiltered: scan.stats.preFiltered,
          triageSkipped: scan.stats.triageSkipped,
          belowBar: scan.stats.belowBar,
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
    logsRef.current = [];
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
      let currentEvent = '';
      let currentData = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer


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
            newArticles: data.newArticles as number,
            reusedArticles: data.reusedArticles as number,
            scrapeFailed: data.scrapeFailed as number,
            analysisFailed: data.analysisFailed as number,
            preFiltered: data.preFiltered as number | undefined,
            triageSkipped: data.triageSkipped as number | undefined,
            belowBar: data.belowBar as number | undefined,
          };
          setAnalyses(finalAnalyses);
          setStats(finalStats);
          
          if (currentScanRef.current) {
            currentScanRef.current.analyses = finalAnalyses;
            currentScanRef.current.stats = {
              totalArticles: finalStats.total,
              analyzedArticles: finalStats.analyzed,
              sourceStats: finalStats.sourceStats,
              newArticles: finalStats.newArticles,
              reusedArticles: finalStats.reusedArticles,
              scrapeFailed: finalStats.scrapeFailed,
              analysisFailed: finalStats.analysisFailed,
              preFiltered: finalStats.preFiltered,
              triageSkipped: finalStats.triageSkipped,
              belowBar: finalStats.belowBar,
            };
            currentScanRef.current.logs = logsRef.current;
            saveScan(currentScanRef.current);
          }
        }
        break;
    }
  };

  const invalidRange = !dateRange.startDate || !dateRange.endDate || dateRange.startDate > dateRange.endDate;

  return (
    <div className={styles.container}>
      <a href="#workspace" className={styles.skipLink}>Skip to workspace</a>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Shield className={styles.logoIcon} aria-hidden="true" />
          <span className={styles.title}>Threat Intel<span className={styles.brandDivider}>/</span>Analyst</span>
        </div>
        <span className={styles.subtitle}>Research workspace</span>
      </header>

      <main id="workspace" className={styles.main}>
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>COLLECT · REVIEW · INVESTIGATE</p>
            <h1>Threat intelligence</h1>
            <p className={styles.intro}>Turn security reporting into a focused intelligence brief.</p>
          </div>
          <span className={styles.workspaceStatus} role="status">{loading ? 'Analysis in progress' : 'Manual collection'}</span>
        </div>

        <fieldset className={styles.setup} disabled={loading}>
          <legend className={styles.sectionLabel}>01 / Collection setup</legend>
          <DateRangeFilter onChange={setDateRange} />
          <SourceManager dateRange={dateRange} onSelectedSourcesChange={setSelectedSources} />
        </fieldset>

        <section className={styles.controlPanel} aria-label="Run collection">
          <div className={styles.panelContent}>
            <div className={styles.panelInfo}>
              <h2 className={styles.panelTitle}>{selectedSources.length} sources selected</h2>
              <p className={styles.panelDescription}>
                {invalidRange ? 'Choose a valid date range. The start must be on or before the end.' : selectedSources.length === 0 ? 'Expand Sources and select at least one to continue.' : 'Collect articles in this period and analyse their relevance to UK finance.'}
              </p>
            </div>
            {loading ? (
              <button onClick={stopAnalysis} className={styles.stopButton}>
                <StopCircle className={styles.buttonIcon} aria-hidden="true" /> Stop analysis
              </button>
            ) : (
              <button onClick={runAnalysis} disabled={selectedSources.length === 0 || invalidRange} className={styles.analyzeButton}>
                Run analysis <ArrowRight className={styles.buttonIcon} aria-hidden="true" />
              </button>
            )}
          </div>
          {stats && (
            <div className={styles.statsBar}>
              <span className={styles.stat}>
                <strong>{stats.total}</strong> articles fetched
              </span>
              <span className={styles.statDivider}>&middot;</span>
              <span className={styles.stat}>
                <strong>{stats.analyzed}</strong> successfully analyzed
              </span>
              {stats.sourceStats && Object.keys(stats.sourceStats).length > 0 && (
                <>
                  <span className={styles.statDivider}>&middot;</span>
                  <span className={styles.stat}>
                    from <strong>{Object.keys(stats.sourceStats).length}</strong> sources
                  </span>
                </>
              )}
              {stats.newArticles !== undefined && (
                <>
                  <span className={styles.statDivider}>&middot;</span>
                  <span className={styles.stat}><strong>{stats.newArticles}</strong> newly scraped</span>
                  <span className={styles.statDivider}>&middot;</span>
                  <span className={styles.stat}><strong>{stats.reusedArticles || 0}</strong> reused</span>
                </>
              )}
              {((stats.preFiltered || 0) + (stats.triageSkipped || 0) + (stats.belowBar || 0)) > 0 && (
                <>
                  <span className={styles.statDivider}>&middot;</span>
                  <span className={styles.stat}><strong>{(stats.preFiltered || 0) + (stats.triageSkipped || 0) + (stats.belowBar || 0)}</strong> filtered as not client-worthy</span>
                </>
              )}
            </div>
          )}
        </section>

        <StatusLog logs={logs} isRunning={loading} onStop={stopAnalysis} />

        <fieldset className={styles.history} disabled={loading}>
          <ScanManager
            key={loading ? 'running' : 'idle'}
            currentScanId={currentScanId}
            onLoadScan={handleLoadScan}
            onNewScan={handleNewScan}
            onScanDeleted={handleScanDeleted}
          />
        </fieldset>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle className={styles.errorIcon} />
            <span>{error}</span>
          </div>
        )}

        <section className={styles.resultsSection}>
          <AnalysisTable data={analyses} isRunning={loading} hasCompleted={stats !== null} />
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          STIX 2.1 vocabulary · Review findings against the original reporting.
        </p>
      </footer>
    </div>
  );
}
