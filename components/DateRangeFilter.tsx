'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import styles from './DateRangeFilter.module.css';

export interface DateRange {
    startDate: string;
    endDate: string;
}

interface DateRangeFilterProps {
    onChange: (range: DateRange) => void;
}

export function DateRangeFilter({ onChange }: DateRangeFilterProps) {
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [startDate, setStartDate] = useState(formatDate(oneWeekAgo));
    const [endDate, setEndDate] = useState(formatDate(today));

    const handleStartChange = (value: string) => {
        setStartDate(value);
        onChange({ startDate: value, endDate });
    };

    const handleEndChange = (value: string) => {
        setEndDate(value);
        onChange({ startDate, endDate: value });
    };

    const setPreset = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);

        const newStart = formatDate(start);
        const newEnd = formatDate(end);

        setStartDate(newStart);
        setEndDate(newEnd);
        onChange({ startDate: newStart, endDate: newEnd });
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Calendar className={styles.calendarIcon} />
                <span className={styles.label}>Date Range</span>
            </div>

            <div className={styles.content}>
                <div className={styles.presets}>
                    <button aria-pressed={endDate === formatDate(today) && startDate === formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7))} onClick={() => setPreset(7)} className={styles.presetButton}>
                        Last 7 days
                    </button>
                    <button aria-pressed={endDate === formatDate(today) && startDate === formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14))} onClick={() => setPreset(14)} className={styles.presetButton}>
                        Last 2 weeks
                    </button>
                    <button aria-pressed={endDate === formatDate(today) && startDate === formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30))} onClick={() => setPreset(30)} className={styles.presetButton}>
                        Last month
                    </button>
                    <button aria-pressed={endDate === formatDate(today) && startDate === formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 90))} onClick={() => setPreset(90)} className={styles.presetButton}>
                        Last 3 months
                    </button>
                </div>

                <div className={styles.customRange}>
                    <div className={styles.dateField}>
                        <label htmlFor="start-date" className={styles.dateLabel}>From</label>
                        <input
                            type="date"
                            id="start-date"
                            max={endDate}
                            value={startDate}
                            onChange={(e) => handleStartChange(e.target.value)}
                            className={styles.dateInput}
                        />
                    </div>
                    <span className={styles.rangeSeparator}>→</span>
                    <div className={styles.dateField}>
                        <label htmlFor="end-date" className={styles.dateLabel}>To</label>
                        <input
                            type="date"
                            id="end-date"
                            min={startDate}
                            value={endDate}
                            onChange={(e) => handleEndChange(e.target.value)}
                            className={styles.dateInput}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getDefaultDateRange(): DateRange {
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return {
        startDate: formatDate(oneWeekAgo),
        endDate: formatDate(today),
    };
}
