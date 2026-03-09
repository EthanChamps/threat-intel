'use client';

import { useRef } from 'react';
import { X, Circle, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import styles from './StatusLog.module.css';

export interface LogEntry {
    id: string;
    timestamp: Date;
    message: string;
    type: 'info' | 'success' | 'error' | 'progress';
    phase?: string;
}

interface StatusLogProps {
    logs: LogEntry[];
    isRunning: boolean;
    onStop: () => void;
}

export function StatusLog({ logs, isRunning, onStop }: StatusLogProps) {
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new logs come in
    const scrollToBottom = () => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    };

    // Call scrollToBottom after render
    if (logs.length > 0) {
        setTimeout(scrollToBottom, 10);
    }

    const getIcon = (type: LogEntry['type']) => {
        switch (type) {
            case 'success':
                return <CheckCircle className={styles.iconSuccess} />;
            case 'error':
                return <AlertCircle className={styles.iconError} />;
            case 'progress':
                return <Loader2 className={styles.iconProgress} />;
            default:
                return <Circle className={styles.iconInfo} />;
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    if (logs.length === 0 && !isRunning) {
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    {isRunning && <Loader2 className={styles.spinner} />}
                    <span className={styles.headerTitle}>
                        {isRunning ? 'Analysis in Progress' : 'Analysis Log'}
                    </span>
                </div>
                {isRunning && (
                    <button onClick={onStop} className={styles.stopButton}>
                        <X className={styles.stopIcon} />
                        Stop Analysis
                    </button>
                )}
            </div>

            <div ref={logContainerRef} className={styles.logContainer}>
                {logs.map((log) => (
                    <div key={log.id} className={`${styles.logEntry} ${styles[log.type]}`}>
                        <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
                        {getIcon(log.type)}
                        <span className={styles.logMessage}>{log.message}</span>
                        {log.phase && <span className={styles.logPhase}>{log.phase}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}
