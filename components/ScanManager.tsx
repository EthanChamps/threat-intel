'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    History, 
    Plus, 
    Trash2, 
    Edit3, 
    Check, 
    X, 
    FileText, 
    Clock,
    HardDrive,
    ChevronDown,
    ChevronUp,
    Download,
    AlertCircle
} from 'lucide-react';
import { 
    StoredScan, 
    ScanSummary, 
    getScanSummaries, 
    getScanById, 
    deleteScan, 
    renameScan,
    deleteAllScans,
    formatScanDate,
    getScanStorageSize
} from '@/lib/scans';
import styles from './ScanManager.module.css';

interface ScanManagerProps {
    currentScanId: string | null;
    onLoadScan: (scan: StoredScan) => void;
    onNewScan: () => void;
    onScanDeleted?: () => void;
}

export function ScanManager({ 
    currentScanId, 
    onLoadScan, 
    onNewScan,
    onScanDeleted 
}: ScanManagerProps) {
    const [scans, setScans] = useState<ScanSummary[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [storageSize, setStorageSize] = useState('0 KB');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const refreshScans = useCallback(() => {
        const summaries = getScanSummaries();
        setScans(summaries);
        setStorageSize(getScanStorageSize());
    }, []);

    useEffect(() => {
        refreshScans();
    }, [refreshScans, currentScanId]);

    const handleLoadScan = (scanId: string) => {
        const scan = getScanById(scanId);
        if (scan) {
            onLoadScan(scan);
            setIsExpanded(false);
        }
    };

    const handleStartRename = (scan: ScanSummary) => {
        setEditingId(scan.id);
        setEditName(scan.name);
    };

    const handleSaveRename = () => {
        if (editingId && editName.trim()) {
            renameScan(editingId, editName.trim());
            refreshScans();
        }
        setEditingId(null);
        setEditName('');
    };

    const handleCancelRename = () => {
        setEditingId(null);
        setEditName('');
    };

    const handleDelete = (scanId: string) => {
        if (confirmDelete === scanId) {
            deleteScan(scanId);
            refreshScans();
            setConfirmDelete(null);
            onScanDeleted?.();
        } else {
            setConfirmDelete(scanId);
            setTimeout(() => setConfirmDelete(null), 3000);
        }
    };

    const handleDeleteAll = () => {
        if (confirm('Delete all saved scans? This cannot be undone.')) {
            deleteAllScans();
            refreshScans();
            onScanDeleted?.();
        }
    };

    const handleExportScan = (scanId: string) => {
        const scan = getScanById(scanId);
        if (!scan) return;

        const dataStr = JSON.stringify(scan, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${scan.name.replace(/[^a-z0-9]/gi, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const currentScan = scans.find(s => s.id === currentScanId);

    return (
        <div className={styles.container}>
            <button 
                className={styles.toggleButton}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <History className={styles.icon} />
                <span className={styles.title}>
                    {currentScan ? currentScan.name : 'Scan History'}
                </span>
                <div className={styles.badges}>
                    <span className={styles.countBadge}>
                        {scans.length} saved
                    </span>
                    <span className={styles.sizeBadge}>
                        <HardDrive className={styles.tinyIcon} />
                        {storageSize}
                    </span>
                </div>
                <span className={styles.chevron}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </button>

            {isExpanded && (
                <div className={styles.content}>
                    <div className={styles.actions}>
                        <button 
                            className={styles.newScanButton}
                            onClick={onNewScan}
                        >
                            <Plus className={styles.smallIcon} />
                            New Scan
                        </button>
                        {scans.length > 0 && (
                            <button 
                                className={styles.deleteAllButton}
                                onClick={handleDeleteAll}
                            >
                                <Trash2 className={styles.smallIcon} />
                                Clear All
                            </button>
                        )}
                    </div>

                    {scans.length === 0 ? (
                        <div className={styles.emptyState}>
                            <FileText className={styles.emptyIcon} />
                            <p>No saved scans yet</p>
                            <span>Run an analysis to save your first scan</span>
                        </div>
                    ) : (
                        <div className={styles.scanList}>
                            {scans.map(scan => (
                                <div 
                                    key={scan.id} 
                                    className={`${styles.scanItem} ${scan.id === currentScanId ? styles.active : ''}`}
                                >
                                    <div className={styles.scanInfo}>
                                        {editingId === scan.id ? (
                                            <div className={styles.editRow}>
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className={styles.editInput}
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveRename();
                                                        if (e.key === 'Escape') handleCancelRename();
                                                    }}
                                                />
                                                <button 
                                                    className={styles.editAction}
                                                    onClick={handleSaveRename}
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button 
                                                    className={styles.editAction}
                                                    onClick={handleCancelRename}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className={styles.scanName}>{scan.name}</span>
                                                <div className={styles.scanMeta}>
                                                    <span>
                                                        <Clock className={styles.metaIcon} />
                                                        {formatScanDate(scan.updatedAt)}
                                                    </span>
                                                    <span>
                                                        <FileText className={styles.metaIcon} />
                                                        {scan.articleCount} articles
                                                    </span>
                                                    <span>
                                                        {scan.sourceCount} sources
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {editingId !== scan.id && (
                                        <div className={styles.scanActions}>
                                            {scan.id !== currentScanId && (
                                                <button
                                                    className={styles.loadButton}
                                                    onClick={() => handleLoadScan(scan.id)}
                                                    title="Load this scan"
                                                >
                                                    Load
                                                </button>
                                            )}
                                            {scan.id === currentScanId && (
                                                <span className={styles.currentBadge}>Current</span>
                                            )}
                                            <button
                                                className={styles.iconButton}
                                                onClick={() => handleStartRename(scan)}
                                                title="Rename"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                className={styles.iconButton}
                                                onClick={() => handleExportScan(scan.id)}
                                                title="Export JSON"
                                            >
                                                <Download size={14} />
                                            </button>
                                            <button
                                                className={`${styles.iconButton} ${styles.deleteButton} ${confirmDelete === scan.id ? styles.confirming : ''}`}
                                                onClick={() => handleDelete(scan.id)}
                                                title={confirmDelete === scan.id ? 'Click again to confirm' : 'Delete'}
                                            >
                                                {confirmDelete === scan.id ? (
                                                    <AlertCircle size={14} />
                                                ) : (
                                                    <Trash2 size={14} />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <p className={styles.helpText}>
                        Scans are saved automatically when analysis completes.
                        Click a scan to load its results.
                    </p>
                </div>
            )}
        </div>
    );
}
