export interface ThreatSource {
    id: string;
    name: string;
    type: 'rss' | 'scrape';
    url: string;
    enabled: boolean;
    // For scraping sources
    articleSelector?: string;
    titleSelector?: string;
    linkSelector?: string;
    dateSelector?: string;
    loadMoreSelector?: string;
    maxScrolls?: number;
    maxPages?: number;          // Max pages to scrape (e.g., /page/2/, /page/3/)
    paginationPattern?: string; // URL pattern for pagination (default: /page/{n}/)
    // For sources that support both RSS and scrape
    rssUrl?: string;
    scrapeUrl?: string;
    canSwitchMode?: boolean;
}

export const DEFAULT_SOURCES: ThreatSource[] = [
    // RSS Sources (with scrape fallback configurations)
    {
        id: 'gbhackers',
        name: 'GBHackers',
        type: 'scrape',
        url: 'https://gbhackers.com/',
        enabled: true,
        canSwitchMode: false,
        articleSelector: '.td_module_wrap',
        titleSelector: '.entry-title a, h3 a',
        linkSelector: 'a',
        dateSelector: 'time, .td-post-date',
        loadMoreSelector: '.td_ajax_load_more',
    },
    {
        id: 'hackernews',
        name: 'The Hacker News',
        type: 'rss',
        url: 'https://feeds.feedburner.com/TheHackersNews',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://feeds.feedburner.com/TheHackersNews',
        scrapeUrl: 'https://thehackernews.com/',
        articleSelector: '.body-post, article',
        titleSelector: 'h2, .home-title',
        linkSelector: 'a',
        dateSelector: '.h-datetime, time',
    },
    {
        id: 'talos',
        name: 'Cisco Talos',
        type: 'rss',
        url: 'http://feeds.feedburner.com/feedburner/Talos',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'http://feeds.feedburner.com/feedburner/Talos',
        scrapeUrl: 'https://blog.talosintelligence.com/',
        articleSelector: 'article, .post',
        titleSelector: 'h2, h3, .entry-title',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'eset',
        name: 'ESET WeLiveSecurity',
        type: 'rss',
        url: 'https://www.welivesecurity.com/en/feed/',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://www.welivesecurity.com/en/feed/',
        scrapeUrl: 'https://www.welivesecurity.com/en/',
        articleSelector: 'article, .post-card',
        titleSelector: 'h2, h3, .post-title',
        linkSelector: 'a',
        dateSelector: 'time, .post-date',
    },

    {
        id: 'flashpoint',
        name: 'Flashpoint',
        type: 'rss',
        url: 'https://www.flashpoint.io/blog/feed',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://www.flashpoint.io/blog/feed',
        scrapeUrl: 'https://www.flashpoint.io/blog/',
        articleSelector: 'article, .blog-post',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'cloudflare',
        name: 'Cloudflare Security',
        type: 'rss',
        url: 'https://blog.cloudflare.com/tag/security/rss',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://blog.cloudflare.com/tag/security/rss',
        scrapeUrl: 'https://blog.cloudflare.com/tag/security/',
        articleSelector: 'article, .post-card',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'microsoft',
        name: 'Microsoft Security',
        type: 'rss',
        url: 'https://api.msrc.microsoft.com/update-guide/rss',
        enabled: true,
        canSwitchMode: false, // API-based RSS, no scrape alternative
    },
    {
        id: 'bleeping',
        name: 'BleepingComputer',
        type: 'rss',
        url: 'https://www.bleepingcomputer.com/feed/',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://www.bleepingcomputer.com/feed/',
        scrapeUrl: 'https://www.bleepingcomputer.com/',
        articleSelector: 'article, .bc_latest_news_text',
        titleSelector: 'h2, h4, .bc_latest_news_title',
        linkSelector: 'a',
        dateSelector: 'time, .bc_news_date',
    },
    {
        id: 'securityweek',
        name: 'SecurityWeek',
        type: 'rss',
        url: 'https://feeds.feedburner.com/securityweek',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://feeds.feedburner.com/securityweek',
        scrapeUrl: 'https://www.securityweek.com/',
        articleSelector: 'article, .post',
        titleSelector: 'h2, h3, .entry-title',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'sentinelone',
        name: 'SentinelOne',
        type: 'rss',
        url: 'https://www.sentinelone.com/blog/feed/',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://www.sentinelone.com/blog/feed/',
        scrapeUrl: 'https://www.sentinelone.com/blog/',
        articleSelector: 'article, .blog-post',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'krebs',
        name: 'Krebs on Security',
        type: 'rss',
        url: 'https://krebsonsecurity.com/feed/',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://krebsonsecurity.com/feed/',
        scrapeUrl: 'https://krebsonsecurity.com/',
        articleSelector: 'article, .post',
        titleSelector: 'h2, .entry-title',
        linkSelector: 'a',
        dateSelector: 'time, .entry-date',
    },
    {
        id: 'cisa',
        name: 'CISA Alerts',
        type: 'rss',
        url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
        scrapeUrl: 'https://www.cisa.gov/news-events/cybersecurity-advisories',
        articleSelector: '.c-teaser, article',
        titleSelector: 'h2, h3, .c-teaser__title',
        linkSelector: 'a',
        dateSelector: 'time, .c-teaser__date',
    },
    {
        id: 'computerweekly',
        name: 'Computer Weekly Security',
        type: 'rss',
        url: 'https://www.computerweekly.com/rss/IT-security.xml',
        enabled: true,
        canSwitchMode: true,
        rssUrl: 'https://www.computerweekly.com/rss/IT-security.xml',
        scrapeUrl: 'https://www.computerweekly.com/resources/IT-security',
        articleSelector: 'article, .search-result, .asset-item',
        titleSelector: 'h3, h2, .title a',
        linkSelector: 'a',
        dateSelector: 'time, .date, .published',
    },
    // Scraping Sources
    {
        id: 'cyware',
        name: 'Cyware Threat Briefings',
        type: 'scrape',
        url: 'https://www.cyware.com/resources/threat-briefings',
        enabled: true,
        articleSelector: '.briefing-card, .resource-card, article',
        titleSelector: 'h2, h3, .title',
        linkSelector: 'a',
        dateSelector: '.date, time, .published',
    },
    {
        id: 'trendmicro',
        name: 'Trend Micro Research',
        type: 'scrape',
        url: 'https://www.trendmicro.com/en_gb/research.html',
        enabled: true,
        articleSelector: '.research-card, article, .post-item',
        titleSelector: 'h2, h3, .title',
        linkSelector: 'a',
        dateSelector: '.date, time',
    },
    {
        id: 'google-ti',
        name: 'Google Cloud Threat Intel',
        type: 'scrape',
        url: 'https://cloud.google.com/blog/topics/threat-intelligence',
        enabled: true,
        articleSelector: 'article, .post-card',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'darktrace',
        name: 'Darktrace',
        type: 'scrape',
        url: 'https://darktrace.com/blog',
        enabled: true,
        articleSelector: 'article, .blog-post, .post-item',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
    {
        id: 'cloudsek',
        name: 'CloudSEK',
        type: 'scrape',
        url: 'https://cloudsek.com/blog/',
        enabled: true,
        articleSelector: 'article, .blog-post',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        dateSelector: 'time, .date',
    },
];

// Storage key for localStorage
const STORAGE_KEY = 'threat-intel-sources';

export function getStoredSources(): ThreatSource[] {
    if (typeof window === 'undefined') return DEFAULT_SOURCES;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return DEFAULT_SOURCES;
        }
    }
    return DEFAULT_SOURCES;
}

export function saveSources(sources: ThreatSource[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

export function resetToDefaults(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
}

export function getEnabledSources(): ThreatSource[] {
    return getStoredSources().filter(s => s.enabled);
}

export function getRssSources(): ThreatSource[] {
    return getEnabledSources().filter(s => s.type === 'rss');
}

export function getScrapeSources(): ThreatSource[] {
    return getEnabledSources().filter(s => s.type === 'scrape');
}

export function switchSourceMode(source: ThreatSource): ThreatSource {
    if (!source.canSwitchMode) return source;

    if (source.type === 'rss' && source.scrapeUrl) {
        return {
            ...source,
            type: 'scrape',
            url: source.scrapeUrl,
        };
    } else if (source.type === 'scrape' && source.rssUrl) {
        return {
            ...source,
            type: 'rss',
            url: source.rssUrl,
        };
    }

    return source;
}
