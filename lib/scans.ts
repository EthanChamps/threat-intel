import type { ThreatAnalysisWithDuplicates } from './extractor';
import type { LogEntry } from '@/components/StatusLog';

export interface ScanStats {
    totalArticles: number;
    analyzedArticles: number;
    scrapedArticles?: number;
    uniqueArticles?: number;
    duplicatesRemoved?: number;
    sourceStats?: Record<string, number>;
}

export interface StoredScan {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    dateRange: {
        startDate: string;
        endDate: string;
    };
    analyses: ThreatAnalysisWithDuplicates[];
    stats: ScanStats | null;
    logs: LogEntry[];
    sourcesUsed: string[];
}

export interface ScanSummary {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    articleCount: number;
    sourceCount: number;
}

const STORAGE_KEY = 'threat-intel-scans';
const CURRENT_SCAN_KEY = 'threat-intel-current-scan';

function generateScanId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateScanName(dateRange: { startDate: string; endDate: string }): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `Scan ${dateStr} ${timeStr}`;
}

export function getStoredScans(): StoredScan[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const scans = JSON.parse(stored) as StoredScan[];
            return scans.sort((a, b) => 
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
        } catch {
            return [];
        }
    }
    return [];
}

export function getScanSummaries(): ScanSummary[] {
    const scans = getStoredScans();
    return scans.map(scan => ({
        id: scan.id,
        name: scan.name,
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt,
        articleCount: scan.analyses.length,
        sourceCount: scan.sourcesUsed.length,
    }));
}

export function getScanById(id: string): StoredScan | null {
    const scans = getStoredScans();
    return scans.find(s => s.id === id) || null;
}

export function createScan(
    dateRange: { startDate: string; endDate: string },
    sourcesUsed: string[]
): StoredScan {
    const now = new Date().toISOString();
    const scan: StoredScan = {
        id: generateScanId(),
        name: generateScanName(dateRange),
        createdAt: now,
        updatedAt: now,
        dateRange,
        analyses: [],
        stats: null,
        logs: [],
        sourcesUsed,
    };
    return scan;
}

export function saveScan(scan: StoredScan): void {
    if (typeof window === 'undefined') return;

    const scans = getStoredScans();
    const existingIndex = scans.findIndex(s => s.id === scan.id);
    
    scan.updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
        scans[existingIndex] = scan;
    } else {
        scans.unshift(scan);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
}

export function updateScanResults(
    scanId: string,
    analyses: ThreatAnalysisWithDuplicates[],
    stats: ScanStats | null,
    logs: LogEntry[]
): StoredScan | null {
    const scan = getScanById(scanId);
    if (!scan) return null;

    scan.analyses = analyses;
    scan.stats = stats;
    scan.logs = logs;
    scan.updatedAt = new Date().toISOString();

    saveScan(scan);
    return scan;
}

export function renameScan(scanId: string, newName: string): boolean {
    if (typeof window === 'undefined') return false;

    const scans = getStoredScans();
    const scan = scans.find(s => s.id === scanId);
    
    if (!scan) return false;

    scan.name = newName.trim() || scan.name;
    scan.updatedAt = new Date().toISOString();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
    return true;
}

export function deleteScan(scanId: string): boolean {
    if (typeof window === 'undefined') return false;

    const scans = getStoredScans();
    const filtered = scans.filter(s => s.id !== scanId);
    
    if (filtered.length === scans.length) return false;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    
    if (getCurrentScanId() === scanId) {
        clearCurrentScanId();
    }
    
    return true;
}

export function deleteAllScans(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    clearCurrentScanId();
}

export function getCurrentScanId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CURRENT_SCAN_KEY);
}

export function setCurrentScanId(scanId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CURRENT_SCAN_KEY, scanId);
}

export function clearCurrentScanId(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(CURRENT_SCAN_KEY);
}

export function getMostRecentScan(): StoredScan | null {
    const scans = getStoredScans();
    return scans.length > 0 ? scans[0] : null;
}

export function formatScanDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function getScanStorageSize(): string {
    if (typeof window === 'undefined') return '0 KB';
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return '0 KB';
    
    const bytes = new Blob([stored]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
