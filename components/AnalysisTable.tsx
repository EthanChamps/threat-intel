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
import { ArrowUpDown, ExternalLink, Download, Star, Search, FileText } from 'lucide-react';
import type { ThreatAnalysis } from '@/lib/extractor';
import styles from './AnalysisTable.module.css';

interface AnalysisTableProps {
    data: ThreatAnalysis[];
    isRunning?: boolean;
    hasCompleted?: boolean;
}

const columnHelper = createColumnHelper<ThreatAnalysis>();

export function AnalysisTable({ data, isRunning = false, hasCompleted = false }: AnalysisTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);

    const [query, setQuery] = useState('');
    const [financeOnly, setFinanceOnly] = useState(false);
    const filteredData = useMemo(() => {
        const search = query.trim().toLowerCase();
        return data.filter(row => (!financeOnly || row.ukFinanceRelevance) &&
            (!search || [row.title, row.targetCountry, row.targetSector, row.threatActorName, row.threatActorType, row.attackPattern, row.interestingNotes, row.relevanceReason].some(value => value?.toLowerCase().includes(search))));
    }, [data, query, financeOnly]);

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
                    if (!reason) return <span className={styles.mutedText}>â€”</span>;
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
        data: filteredData,
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
        const rows = table.getRowModel().rows.map(({ original: row }) => [
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
        URL.revokeObjectURL(link.href);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h2 className={styles.title}>Intelligence brief</h2>
                    {starredCount > 0 && (
                        <span className={styles.starBadge}>
                            <Star className={styles.starBadgeIcon} />
                            {starredCount} relevant to UK Finance
                        </span>
                    )}
                </div>
                <button onClick={exportToCSV} disabled={filteredData.length === 0} className={styles.exportButton}>
                    <Download className={styles.downloadIcon} />
                    Export CSV
                </button>
            </div>

            <div className={styles.toolbar}>
                <label className={styles.search}>
                    <Search size={16} aria-hidden="true" />
                    <input aria-label="Search intelligence" placeholder="Search articles, actors or sectors…" value={query} onChange={event => setQuery(event.target.value)} />
                </label>
                <button className={styles.filterButton} aria-pressed={financeOnly} onClick={() => setFinanceOnly(!financeOnly)}>UK finance only</button>
                <span className={styles.resultCount} role="status">{filteredData.length} of {data.length} articles</span>
            </div>
            {filteredData.length > 0 && <div className={styles.tableWrapper} tabIndex={0} role="region" aria-label="Intelligence results; scroll horizontally for more columns">

                <table className={styles.table}>
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className={styles.th} aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
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
            </div>}

            {filteredData.length === 0 && (
                <div className={styles.emptyState}>
                    <FileText size={28} aria-hidden="true" />
                    <h3>{data.length > 0 ? 'No matching articles' : isRunning ? 'Building your intelligence brief' : hasCompleted ? 'No articles in this collection' : 'Your next brief starts here'}</h3>
                    <p>{data.length > 0 ? 'Try another search or remove the UK finance filter.' : isRunning ? 'Results will appear here as articles are analysed.' : hasCompleted ? 'Try a wider date range or different sources. Check the activity log for details.' : 'Choose a date range and sources above, then run analysis to review the reporting.'}</p>
                    {data.length > 0 && <button className={styles.filterButton} onClick={() => { setQuery(''); setFinanceOnly(false); }}>Clear filters</button>}
                </div>
            )}
        </div>
    );
}
