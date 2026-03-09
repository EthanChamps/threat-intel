'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Rss, ExternalLink } from 'lucide-react';
import styles from './FeedManager.module.css';

const DEFAULT_FEEDS = [
    'https://gbhackers.com/feed/',
    'https://feeds.feedburner.com/TheHackersNews',
    'https://www.bleepingcomputer.com/feed/',
    'https://krebsonsecurity.com/feed/',
    'https://feeds.feedburner.com/securityweek',
    'https://threatpost.com/feed/',
    'https://www.cisa.gov/cybersecurity-advisories/all.xml',
];

export function FeedManager() {
    const [feeds, setFeeds] = useState<string[]>([]);
    const [newFeed, setNewFeed] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('threat-intel-feeds');
        if (stored) {
            setFeeds(JSON.parse(stored));
        } else {
            setFeeds(DEFAULT_FEEDS);
            localStorage.setItem('threat-intel-feeds', JSON.stringify(DEFAULT_FEEDS));
        }
    }, []);

    const saveFeedsToStorage = (newFeeds: string[]) => {
        setFeeds(newFeeds);
        localStorage.setItem('threat-intel-feeds', JSON.stringify(newFeeds));
    };

    const addFeed = () => {
        if (!newFeed.trim()) return;

        // Basic URL validation and normalization
        let url = newFeed.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Check for duplicates
        if (feeds.includes(url)) {
            alert('This feed is already in the list');
            return;
        }

        saveFeedsToStorage([...feeds, url]);
        setNewFeed('');
    };

    const removeFeed = (feedToRemove: string) => {
        saveFeedsToStorage(feeds.filter((f) => f !== feedToRemove));
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            addFeed();
        }
    };

    return (
        <div className={styles.container}>
            <button
                className={styles.toggleButton}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Rss className={styles.rssIcon} />
                <span>Feed Sources ({feeds.length})</span>
                <span className={styles.chevron}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
                <div className={styles.content}>
                    <div className={styles.feedList}>
                        {feeds.map((feed) => (
                            <div key={feed} className={styles.feedItem}>
                                <a
                                    href={feed}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.feedLink}
                                >
                                    {feed}
                                    <ExternalLink className={styles.externalIcon} />
                                </a>
                                <button
                                    onClick={() => removeFeed(feed)}
                                    className={styles.removeButton}
                                    title="Remove feed"
                                >
                                    <Trash2 className={styles.trashIcon} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className={styles.addForm}>
                        <input
                            type="text"
                            value={newFeed}
                            onChange={(e) => setNewFeed(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Enter RSS feed URL..."
                            className={styles.input}
                        />
                        <button onClick={addFeed} className={styles.addButton}>
                            <Plus className={styles.plusIcon} />
                            Add
                        </button>
                    </div>

                    <p className={styles.hint}>
                        Tip: Most sites have RSS at <code>/feed/</code> or <code>/rss/</code>
                    </p>
                </div>
            )}
        </div>
    );
}

export function getStoredFeeds(): string[] {
    if (typeof window === 'undefined') return DEFAULT_FEEDS;
    const stored = localStorage.getItem('threat-intel-feeds');
    return stored ? JSON.parse(stored) : DEFAULT_FEEDS;
}
