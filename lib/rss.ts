import Parser from 'rss-parser';

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
}

const parser = new Parser();

const DEFAULT_FEED_URLS = [
  'https://gbhackers.com/feed/',
  'https://feeds.feedburner.com/TheHackersNews',
  'https://www.bleepingcomputer.com/feed/',
  'https://krebsonsecurity.com/feed/',
  'https://feeds.feedburner.com/securityweek',
  'https://threatpost.com/feed/',
  'https://www.cisa.gov/cybersecurity-advisories/all.xml',
];

export async function fetchAllFeeds(feedUrls?: string[]): Promise<FeedItem[]> {
  const urls = feedUrls && feedUrls.length > 0 ? feedUrls : DEFAULT_FEED_URLS;
  const allItems: FeedItem[] = [];

  for (const url of urls) {
    try {
      console.log(`Fetching feed: ${url}`);
      const feed = await parser.parseURL(url);
      const items = feed.items.map((item) => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        pubDate: item.pubDate || '',
        contentSnippet: item.contentSnippet || '',
      }));
      allItems.push(...items);
      console.log(`Found ${items.length} articles from ${url}`);
    } catch (error) {
      console.error(`Failed to fetch feed from ${url}:`, error);
    }
  }

  // Sort by date, newest first
  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return allItems;
}

export async function fetchFeedByDateRange(
  feedUrls?: string[],
  startDate?: string,
  endDate?: string
): Promise<FeedItem[]> {
  const allItems = await fetchAllFeeds(feedUrls);

  // Default to last 7 days if no dates provided
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999); // End of day

  const start = startDate ? new Date(startDate) : new Date(end);
  if (!startDate) {
    start.setDate(start.getDate() - 7);
  }
  start.setHours(0, 0, 0, 0); // Start of day

  console.log(`Filtering articles from ${start.toISOString()} to ${end.toISOString()}`);

  const filtered = allItems.filter((item) => {
    const itemDate = new Date(item.pubDate);
    return itemDate >= start && itemDate <= end;
  });

  console.log(`Found ${filtered.length} articles in date range`);
  return filtered;
}

// Keep for backwards compatibility
export async function fetchFeedFromLastWeek(feedUrls?: string[]): Promise<FeedItem[]> {
  return fetchFeedByDateRange(feedUrls);
}
