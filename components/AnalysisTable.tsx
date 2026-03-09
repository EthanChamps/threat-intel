'use client';

import { useState, useMemo } from 'react';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ExternalLink, Download, Star } from 'lucide-react';
import type { ThreatAnalysis } from '@/lib/extractor';
import styles from './AnalysisTable.module.css';

interface AnalysisTableProps {
    data: ThreatAnalysis[];
}

const columnHelper = createColumnHelper<ThreatAnalysis>();

export function AnalysisTable({ data }: AnalysisTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);

    // Count starred articles
    const starredCount = useMemo(() => data.filter(d => d.ukFinanceRelevance).length, [data]);

    const columns = useMemo(
        () => [
            columnHelper.accessor('ukFinanceRelevance', {
                header: ({ column }) => (
                    <button
                        className={styles.sortButton}
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        title="UK Finance Relevance"
                    >
                        <Star className={styles.starHeaderIcon} />
                        <ArrowUpDown className={styles.sortIcon} />
                    </button>
                ),
                cell: (info) => {
                    const isRelevant = info.getValue();
                    const reason = info.row.original.relevanceReason;
                    return isRelevant ? (
                        <div className={styles.starCell} title={reason || 'Relevant to UK Finance'}>
                            <Star className={styles.starIcon} />
                        </div>
                    ) : null;
                },
            }),
            columnHelper.accessor('title', {
                header: ({ column }) => (
                    <button
                        className={styles.sortButton}
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        Title
                        <ArrowUpDown className={styles.sortIcon} />
                    </button>
                ),
                cell: (info) => (
                    <div className={styles.titleCell}>
                        <a
                            href={info.row.original.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.titleLink}
                        >
                            {info.getValue()}
                            <ExternalLink className={styles.externalIcon} />
                        </a>
                    </div>
                ),
            }),
            columnHelper.accessor('targetCountry', {
                header: 'Country',
                cell: (info) => (
                    <span className={styles.tag}>{info.getValue().toUpperCase()}</span>
                ),
            }),
            columnHelper.accessor('targetSector', {
                header: 'Sector',
                cell: (info) => (
                    <span className={styles.tag}>{info.getValue()}</span>
                ),
            }),
            columnHelper.accessor('threatActorType', {
                header: 'Actor Type',
                cell: (info) => {
                    const value = info.getValue();
                    return (
                        <span
                            className={`${styles.tag} ${value !== 'unknown' ? styles.threatActorTag : ''}`}
                        >
                            {value}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('threatActorName', {
                header: 'Actor Name',
                cell: (info) => {
                    const value = info.getValue();
                    return (
                        <span
                            className={`${styles.tag} ${value !== 'unknown' ? styles.actorNameTag : ''}`}
                        >
                            {value}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('attackPattern', {
                header: 'Attack Pattern',
                cell: (info) => (
                    <span className={`${styles.tag} ${styles.attackVectorTag}`}>
                        {info.getValue()}
                    </span>
                ),
            }),
            columnHelper.accessor('relevanceReason', {
                header: 'UK Finance Relevance',
                cell: (info) => {
                    const reason = info.getValue();
                    if (!reason) return <span className={styles.mutedText}>—</span>;
                    return (
                        <div className={styles.relevanceCell}>
                            {reason}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('interestingNotes', {
                header: 'Notes',
                cell: (info) => (
                    <div className={styles.notesCell}>{info.getValue()}</div>
                ),
            }),
        ],
        []
    );

    const table = useReactTable({
        data,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const exportToCSV = () => {
        const headers = [
            'UK Finance Relevant',
            'Title',
            'URL',
            'Target Country',
            'Target Sector (STIX)',
            'Threat Actor Type (STIX)',
            'Threat Actor Name',
            'Attack Pattern',
            'UK Finance Relevance Reason',
            'Notes'
        ];
        const rows = data.map((row) => [
            row.ukFinanceRelevance ? 'YES' : 'NO',
            row.title,
            row.url,
            row.targetCountry,
            row.targetSector,
            row.threatActorType,
            row.threatActorName,
            row.attackPattern,
            row.relevanceReason || '',
            row.interestingNotes,
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map((row) =>
                row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `threat-intel-uk-finance-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h2 className={styles.title}>Threat Analysis Results</h2>
                    {starredCount > 0 && (
                        <span className={styles.starBadge}>
                            <Star className={styles.starBadgeIcon} />
                            {starredCount} relevant to UK Finance
                        </span>
                    )}
                </div>
                <button onClick={exportToCSV} className={styles.exportButton}>
                    <Download className={styles.downloadIcon} />
                    Export CSV
                </button>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className={styles.th}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className={`${styles.tr} ${row.original.ukFinanceRelevance ? styles.starredRow : ''}`}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} className={styles.td}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.length === 0 && (
                <div className={styles.emptyState}>
                    No analysis data yet. Click &quot;Run Analysis&quot; to get started.
                </div>
            )}
        </div>
    );
}
