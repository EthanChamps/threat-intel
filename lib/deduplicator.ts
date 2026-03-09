import { ScrapedArticle } from './scraper';

export interface ArticleGroup {
    primary: ScrapedArticle;
    duplicates: ScrapedArticle[];
}

function normalizeText(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);
}

function getSignificantWords(words: string[]): Set<string> {
    const stopWords = new Set([
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
        'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'they',
        'this', 'that', 'with', 'from', 'will', 'what', 'when', 'where', 'which',
        'their', 'about', 'would', 'there', 'could', 'other', 'into', 'more',
        'some', 'than', 'them', 'these', 'then', 'only', 'its', 'also', 'after',
        'new', 'says', 'said', 'how', 'may', 'over', 'such', 'any', 'most',
    ]);
    
    return new Set(words.filter(word => !stopWords.has(word)));
}

function calculateSimilarity(title1: string, title2: string): number {
    const words1 = getSignificantWords(normalizeText(title1));
    const words2 = getSignificantWords(normalizeText(title2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    let intersection = 0;
    for (const word of words1) {
        if (words2.has(word)) intersection++;
    }
    
    const union = words1.size + words2.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function extractKeyTerms(title: string): string[] {
    const words = normalizeText(title);
    const significant = getSignificantWords(words);
    
    const keyPatterns = [
        /\b(cve-\d{4}-\d+)\b/i,
        /\b(apt\d+|apt-\d+)\b/i,
        /\b(lazarus|fin\d+|cozy\s*bear|fancy\s*bear|scattered\s*spider)\b/i,
        /\b(ransomware|malware|trojan|botnet)\b/i,
        /\b(microsoft|google|apple|amazon|meta|facebook)\b/i,
        /\b(windows|linux|android|ios|macos)\b/i,
    ];
    
    const lowerTitle = title.toLowerCase();
    const extracted: string[] = [];
    
    for (const pattern of keyPatterns) {
        const match = lowerTitle.match(pattern);
        if (match) extracted.push(match[1].toLowerCase());
    }
    
    return [...extracted, ...Array.from(significant).slice(0, 5)];
}

function areSimilarArticles(article1: ScrapedArticle, article2: ScrapedArticle, threshold = 0.4): boolean {
    const titleSimilarity = calculateSimilarity(article1.title, article2.title);
    if (titleSimilarity >= threshold) return true;
    
    const keys1 = extractKeyTerms(article1.title);
    const keys2 = extractKeyTerms(article2.title);
    
    const keyOverlap = keys1.filter(k => keys2.includes(k)).length;
    const minKeys = Math.min(keys1.length, keys2.length);
    
    if (minKeys > 0 && keyOverlap / minKeys >= 0.5) return true;
    
    if (article1.content && article2.content) {
        const contentSnippet1 = article1.content.slice(0, 500);
        const contentSnippet2 = article2.content.slice(0, 500);
        const contentSimilarity = calculateSimilarity(contentSnippet1, contentSnippet2);
        if (contentSimilarity >= 0.5) return true;
    }
    
    return false;
}

function selectPrimaryArticle(articles: ScrapedArticle[]): ScrapedArticle {
    return articles.reduce((best, current) => {
        const currentScore = (current.content?.length || 0) + (current.title?.length || 0) * 10;
        const bestScore = (best.content?.length || 0) + (best.title?.length || 0) * 10;
        return currentScore > bestScore ? current : best;
    });
}

export function deduplicateArticles(articles: ScrapedArticle[], similarityThreshold = 0.4): ArticleGroup[] {
    if (articles.length === 0) return [];
    
    const groups: ArticleGroup[] = [];
    const assigned = new Set<number>();
    
    for (let i = 0; i < articles.length; i++) {
        if (assigned.has(i)) continue;
        
        const group: ScrapedArticle[] = [articles[i]];
        assigned.add(i);
        
        for (let j = i + 1; j < articles.length; j++) {
            if (assigned.has(j)) continue;
            
            const isSimilar = group.some(groupArticle => 
                areSimilarArticles(groupArticle, articles[j], similarityThreshold)
            );
            
            if (isSimilar) {
                group.push(articles[j]);
                assigned.add(j);
            }
        }
        
        const primary = selectPrimaryArticle(group);
        const duplicates = group.filter(a => a !== primary);
        
        groups.push({ primary, duplicates });
    }
    
    return groups;
}

export interface DeduplicationStats {
    originalCount: number;
    uniqueCount: number;
    duplicatesRemoved: number;
    groups: Array<{
        primaryTitle: string;
        primaryUrl: string;
        duplicateCount: number;
        duplicateSources: string[];
    }>;
}

export function getDeduplicationStats(groups: ArticleGroup[]): DeduplicationStats {
    const originalCount = groups.reduce((sum, g) => sum + 1 + g.duplicates.length, 0);
    const uniqueCount = groups.length;
    
    return {
        originalCount,
        uniqueCount,
        duplicatesRemoved: originalCount - uniqueCount,
        groups: groups
            .filter(g => g.duplicates.length > 0)
            .map(g => ({
                primaryTitle: g.primary.title,
                primaryUrl: g.primary.url,
                duplicateCount: g.duplicates.length,
                duplicateSources: g.duplicates.map(d => {
                    try {
                        return new URL(d.url).hostname;
                    } catch {
                        return d.url;
                    }
                }),
            })),
    };
}
