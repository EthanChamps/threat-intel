'use client';

import { useState, useEffect } from 'react';
import { Rss, Globe, Check, X, RotateCcw, Play, Loader2, ArrowLeftRight, Square, CheckSquare } from 'lucide-react';
import { ThreatSource, DEFAULT_SOURCES, getStoredSources, saveSources, resetToDefaults, switchSourceMode } from '@/lib/sources';
import type { DateRange } from './DateRangeFilter';
import styles from './SourceManager.module.css';

interface SourceManagerProps {
    onSourcesChange?: () => void;
    onSelectedSourcesChange?: (sources: ThreatSource[]) => void;
    dateRange?: DateRange;
}

interface SourceStats {
    [sourceId: string]: {
        count: number;
        loading: boolean;
        error?: string;
    };
}

export function SourceManager({ onSourcesChange, onSelectedSourcesChange, dateRange }: SourceManagerProps) {
    const [sources, setSources] = useState<ThreatSource[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isExpanded, setIsExpanded] = useState(false);
    const [sourceStats, setSourceStats] = useState<SourceStats>({});

    useEffect(() => {
        const stored = getStoredSources();
        setSources(stored);
        const enabledIds = new Set(stored.filter(s => s.enabled).map(s => s.id));
        setSelectedIds(enabledIds);
    }, []);

    useEffect(() => {
        const selectedSources = sources.filter(s => selectedIds.has(s.id));
        onSelectedSourcesChange?.(selectedSources);
    }, [selectedIds, sources, onSelectedSourcesChange]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        const enabledIds = sources.filter(s => s.enabled).map(s => s.id);
        setSelectedIds(new Set(enabledIds));
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const toggleSource = (id: string) => {
        const source = sources.find(s => s.id === id);
        const willBeEnabled = source ? !source.enabled : false;
        
        const updated = sources.map(s =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
        );
        setSources(updated);
        saveSources(updated);
        
        if (!willBeEnabled) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        } else {
            setSelectedIds(prev => new Set([...prev, id]));
        }
        
        onSourcesChange?.();
    };

    const toggleSourceMode = (id: string) => {
        const updated = sources.map(s =>
            s.id === id ? switchSourceMode(s) : s
        );
        setSources(updated);
        saveSources(updated);
        // Clear stats for this source since mode changed
        setSourceStats(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        onSourcesChange?.();
    };

    const handleReset = () => {
        resetToDefaults();
        setSources(DEFAULT_SOURCES);
        setSourceStats({});
        onSourcesChange?.();
    };

    const testSource = async (source: ThreatSource) => {
        setSourceStats(prev => ({
            ...prev,
            [source.id]: { count: 0, loading: true },
        }));

        try {
            const response = await fetch('/api/test-source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source,
                    startDate: dateRange?.startDate,
                    endDate: dateRange?.endDate,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setSourceStats(prev => ({
                    ...prev,
                    [source.id]: { count: data.articleCount, loading: false },
                }));
            } else {
                setSourceStats(prev => ({
                    ...prev,
                    [source.id]: { count: 0, loading: false, error: data.error },
                }));
            }
        } catch (error) {
            setSourceStats(prev => ({
                ...prev,
                [source.id]: {
                    count: 0,
                    loading: false,
                    error: error instanceof Error ? error.message : 'Failed to test source',
                },
            }));
        }
    };

    const testAllSources = async () => {
        const selectedSources = sources.filter(s => selectedIds.has(s.id));
        for (const source of selectedSources) {
            await testSource(source);
        }
    };

    const enabledCount = sources.filter(s => s.enabled).length;
    const selectedCount = selectedIds.size;
    const rssCount = sources.filter(s => s.type === 'rss' && s.enabled).length;
    const scrapeCount = sources.filter(s => s.type === 'scrape' && s.enabled).length;
    const totalArticles = Object.values(sourceStats).reduce((sum, s) => sum + (s.count || 0), 0);
    const allEnabledSelected = sources.filter(s => s.enabled).every(s => selectedIds.has(s.id));

    return (
        <div className={styles.container}>
            <button
                className={styles.toggleButton}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Globe className={styles.icon} />
                <span>Threat Intel Sources ({selectedCount} selected for analysis)</span>
                <span className={styles.badges}>
                    <span className={styles.rssBadge}>{rssCount} RSS</span>
                    <span className={styles.scrapeBadge}>{scrapeCount} Scrape</span>
                    {totalArticles > 0 && (
                        <span className={styles.articlesBadge}>{totalArticles} articles</span>
                    )}
                </span>
                <span className={styles.chevron}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
                <div className={styles.content}>
                    <div className={styles.actions}>
                        <button 
                            onClick={allEnabledSelected ? deselectAll : selectAll} 
                            className={styles.selectAllButton}
                        >
                            {allEnabledSelected ? (
                                <><Square className={styles.smallIcon} /> Deselect All</>
                            ) : (
                                <><CheckSquare className={styles.smallIcon} /> Select All</>
                            )}
                        </button>
                        <button onClick={testAllSources} className={styles.testAllButton}>
                            <Play className={styles.smallIcon} />
                            Test Selected
                        </button>
                        <button onClick={handleReset} className={styles.resetButton}>
                            <RotateCcw className={styles.smallIcon} />
                            Reset to Defaults
                        </button>
                    </div>

                    <div className={styles.sourceList}>
                        {sources.map((source) => {
                            const stats = sourceStats[source.id];
                            return (
                                <div
                                    key={source.id}
                                    className={`${styles.sourceItem} ${source.enabled ? styles.enabled : styles.disabled} ${selectedIds.has(source.id) ? styles.selected : ''}`}
                                >
                                    <button
                                        onClick={() => source.enabled && toggleSelection(source.id)}
                                        className={styles.selectionButton}
                                        disabled={!source.enabled}
                                        title={source.enabled ? 'Select for analysis' : 'Enable source first'}
                                    >
                                        {selectedIds.has(source.id) ? (
                                            <CheckSquare className={styles.checkSquareIcon} />
                                        ) : (
                                            <Square className={styles.squareIcon} />
                                        )}
                                    </button>
                                    
                                    <button
                                        onClick={() => toggleSource(source.id)}
                                        className={styles.toggleSourceButton}
                                        title={source.enabled ? 'Disable source' : 'Enable source'}
                                    >
                                        {source.enabled ? (
                                            <Check className={styles.checkIcon} />
                                        ) : (
                                            <X className={styles.xIcon} />
                                        )}
                                    </button>

                                    <div className={styles.sourceInfo}>
                                        <span className={styles.sourceName}>{source.name}</span>
                                        <div className={styles.sourceTypeRow}>
                                            <span className={`${styles.sourceType} ${source.type === 'rss' ? styles.rssType : styles.scrapeType}`}>
                                                {source.type === 'rss' ? (
                                                    <><Rss className={styles.tinyIcon} /> RSS</>
                                                ) : (
                                                    <><Globe className={styles.tinyIcon} /> Scrape</>
                                                )}
                                            </span>
                                            {source.canSwitchMode && (
                                                <button
                                                    onClick={() => toggleSourceMode(source.id)}
                                                    className={styles.switchModeButton}
                                                    title={`Switch to ${source.type === 'rss' ? 'scrape' : 'RSS'} mode`}
                                                >
                                                    <ArrowLeftRight className={styles.tinyIcon} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.statsSection}>
                                        {stats?.loading ? (
                                            <span className={styles.loadingStats}>
                                                <Loader2 className={styles.spinnerSmall} />
                                            </span>
                                        ) : stats?.error ? (
                                            <span className={styles.errorStats} title={stats.error}>Error</span>
                                        ) : stats?.count !== undefined ? (
                                            <span className={styles.articleCount}>
                                                {stats.count} articles
                                            </span>
                                        ) : null}
                                    </div>

                                    <button
                                        onClick={() => testSource(source)}
                                        className={styles.testButton}
                                        disabled={stats?.loading}
                                        title="Test this source"
                                    >
                                        {stats?.loading ? (
                                            <Loader2 className={styles.spinnerSmall} />
                                        ) : (
                                            <Play className={styles.playIcon} />
                                        )}
                                    </button>

                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.sourceUrl}
                                        title={source.url}
                                    >
                                        {new URL(source.url).hostname}
                                    </a>
                                </div>
                            );
                        })}
                    </div>

                    <p className={styles.hint}>
                        Click <Play className={styles.inlineIcon} /> to test a source. Click <ArrowLeftRight className={styles.inlineIcon} /> to switch between RSS and scrape modes—use scrape if RSS returns too few articles.
                    </p>
                </div>
            )}
        </div>
    );
}

export { getStoredSources } from '@/lib/sources';
