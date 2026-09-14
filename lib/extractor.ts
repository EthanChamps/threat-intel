import { z } from 'zod';

// STIX 2.1 Industry Sector Vocabulary (identity-class-ov)
// https://docs.oasis-open.org/cti/stix/v2.1/cs02/stix-v2.1-cs02.html#_oogrswk3onck
export const STIX_INDUSTRY_SECTORS = [
    'agriculture',
    'aerospace',
    'automotive',
    'chemical',
    'commercial',
    'communications',
    'construction',
    'defense',
    'education',
    'energy',
    'entertainment',
    'financial-services',
    'government',
    'healthcare',
    'hospitality-leisure',
    'infrastructure',
    'insurance',
    'manufacturing',
    'mining',
    'non-profit',
    'pharmaceuticals',
    'retail',
    'technology',
    'telecommunications',
    'transportation',
    'utilities',
    'unknown',
] as const;

// STIX 2.1 Threat Actor Type Vocabulary (threat-actor-type-ov)
// https://docs.oasis-open.org/cti/stix/v2.1/cs02/stix-v2.1-cs02.html#_kj78xrhzc5ir
export const STIX_THREAT_ACTOR_TYPES = [
    'activist',
    'competitor',
    'crime-syndicate',
    'criminal',
    'hacker',
    'insider-accidental',
    'insider-disgruntled',
    'nation-state',
    'sensationalist',
    'spy',
    'terrorist',
    'unknown',
] as const;

// STIX 2.1 Attack Pattern / Attack Motivation categories
export const STIX_ATTACK_PATTERNS = [
    'malware',
    'phishing',
    'ransomware',
    'exploit',
    'denial-of-service',
    'man-in-the-middle',
    'supply-chain-compromise',
    'credential-access',
    'social-engineering',
    'zero-day',
    'backdoor',
    'botnet',
    'data-exfiltration',
    'web-application-attack',
    'unknown',
] as const;

export const SEVERITY_LEVELS = [
    'critical',
    'high',
    'medium',
    'low',
] as const;

export type SeverityLevel = typeof SEVERITY_LEVELS[number];

export const ThreatAnalysisSchema = z.object({
    url: z.string().describe('The original article URL'),
    title: z.string().describe('The article title'),
    targetCountry: z.string().describe('The targeted country or region using ISO 3166-1 alpha-2 codes (e.g., "US", "GB", "CN") or "global" for worldwide, "unknown" if not specified'),
    targetSector: z.string().describe(`The targeted industry sector using STIX 2.1 industry-sector-ov vocabulary. Must be one of: ${STIX_INDUSTRY_SECTORS.join(', ')}`),
    threatActorType: z.string().describe(`The type of threat actor using STIX 2.1 threat-actor-type-ov vocabulary. Must be one of: ${STIX_THREAT_ACTOR_TYPES.join(', ')}`),
    threatActorName: z.string().describe('The specific threat actor name/alias if mentioned (e.g., "APT29", "Lazarus Group", "FIN7"). Use "unknown" if not specified'),
    attackPattern: z.string().describe(`The attack pattern/technique using STIX-aligned terminology. Should be one of: ${STIX_ATTACK_PATTERNS.join(', ')}`),
    ukFinanceRelevance: z.boolean().describe('Whether this article is particularly relevant to a UK financial services firm. Set to true if relevant.'),
    relevanceReason: z.string().describe('If ukFinanceRelevance is true, briefly explain why this is relevant to a UK financial firm. Leave empty if not relevant.'),
    interestingNotes: z.string().describe('A brief 1-2 sentence summary of why this threat is notable or interesting'),
    reportWorthy: z.boolean().describe('Whether this article clears the strict client-reporting bar: novel, impactful, or actionable enough to brief a UK financial services client. False for routine, minor, duplicative, or non-actionable items.'),
    severity: z.enum(SEVERITY_LEVELS).describe('Client-facing severity: critical (active exploitation of widely deployed software, major financial-sector incident), high (exploited vuln, ransomware, banking trojan, supply-chain compromise), medium (notable TTP or vuln without confirmed exploitation), low (minor or informational).'),
});

export const ThreatAnalysisArraySchema = z.array(ThreatAnalysisSchema);

export type ThreatAnalysis = z.infer<typeof ThreatAnalysisSchema>;

export interface DuplicateInfo {
    url: string;
    title: string;
    source: string;
}

export interface ThreatAnalysisWithDuplicates extends ThreatAnalysis {
    duplicates?: DuplicateInfo[];
}

export const EXTRACTION_SYSTEM_PROMPT = `You are a cybersecurity threat intelligence analyst specializing in STIX 2.1 structured threat information, working for a UK financial services firm.

Your job is to analyze articles about cyber threats and extract structured information using STIX 2.1 vocabulary standards. You are writing a CLIENT brief, not an internal feed dump: be selective. Most routine items must be marked reportWorthy=false.

REPORT an article (reportWorthy=true) only if at least one of these holds:
- Active exploitation in the wild (zero-day, KEV-listed CVE, vendor confirms exploitation)
- Direct impact on financial services, banking, insurance, fintech, payment systems, or banking trojans/fraud targeting customers
- UK or European targeting, or a global threat that clearly affects UK enterprise (widely deployed software, cloud, identity)
- Supply chain compromise of developer tooling (npm, PyPI, RubyGems, GitHub, CI/CD, code repos, build artifacts)
- Ransomware or data extortion against enterprises with named victims, new TTPs, or financial-sector targeting
- Nation-state or organized-crime actor with new campaign, new malware, or new infrastructure (not a rehash of old reporting)
- AI-powered attack, LLM/agent exploit, or phishing/MFA-bypass kit with demonstrated effectiveness
- Critical vulnerability (CVSS 9+) in widely deployed enterprise software WITH a realistic exploitation path
- Actionable defensive outcome: patch now, hunt for specific IOCs/TTPs, change a control

DO NOT REPORT (reportWorthy=false) for:
- Routine CVE disclosures or patch-roundup entries with no exploitation and CVSS < 9
- Vendor product launches, partnerships, marketing, webinars, surveys, opinion pieces
- Legal follow-ups (sentencing, charges, indictments) unless they reveal new TTPs or IOCs
- Minor malware variants, PoCs, or researcher claims with no confirmed victims
- Single-org incidents in non-financial sectors with no transferable lesson
- Rehashed/duplicate coverage of an already-reported story without new facts
- How-to/defensive guides with no new threat information

For each article provided, extract the following information:

1. **targetCountry**: The country or region being targeted.
   - Use ISO 3166-1 alpha-2 country codes (e.g., "US", "GB", "DE", "CN", "RU")
   - Use "global" if it affects multiple regions worldwide
   - Use "unknown" if not specified

2. **targetSector**: The targeted industry sector using STIX 2.1 industry-sector-ov vocabulary.
   Must be one of: agriculture, aerospace, automotive, chemical, commercial, communications, construction, defense, education, energy, entertainment, financial-services, government, healthcare, hospitality-leisure, infrastructure, insurance, manufacturing, mining, non-profit, pharmaceuticals, retail, technology, telecommunications, transportation, utilities, unknown

3. **threatActorType**: The type of threat actor using STIX 2.1 threat-actor-type-ov vocabulary.
   Must be one of: activist, competitor, crime-syndicate, criminal, hacker, insider-accidental, insider-disgruntled, nation-state, sensationalist, spy, terrorist, unknown

4. **threatActorName**: The specific name or alias of the threat actor if mentioned (e.g., "APT29", "Lazarus Group", "FIN7", "Scattered Spider"). Use "unknown" if not specified.

5. **attackPattern**: The attack technique or pattern using STIX-aligned terminology.
   Should be one of: malware, phishing, ransomware, exploit, denial-of-service, man-in-the-middle, supply-chain-compromise, credential-access, social-engineering, zero-day, backdoor, botnet, data-exfiltration, web-application-attack, unknown

6. **ukFinanceRelevance**: Set to TRUE only if a UK financial firm should care (financial targeting, UK/EU impact, widely deployed enterprise tech, supply chain, AI threats, ransomware, credential theft, regulatory impact). Default to FALSE for routine or non-transferable items.

7. **relevanceReason**: If ukFinanceRelevance is true, provide a brief explanation of why this is relevant to a UK financial firm. Examples:
   - "NPM package compromise affects developer supply chain"
   - "Banking trojan actively targeting UK customers"
   - "AI-assisted phishing could bypass existing email filters"
   Leave empty string if ukFinanceRelevance is false.

8. **interestingNotes**: A brief 1-2 sentence summary explaining why this threat is notable. If reportWorthy is false, state plainly why it was excluded (e.g., "Routine CVE without exploitation; no action beyond normal patching.").

9. **reportWorthy**: Strict client-reporting bar per the REPORT / DO NOT REPORT rules above. When in doubt about novelty or impact, set false.

10. **severity**: critical (active exploitation of widely deployed software or major financial incident), high (exploited vuln, ransomware, banking trojan, supply chain), medium (notable but unexploited), low (minor/informational).

Be concise and accurate. Use lowercase for all vocabulary terms except severity levels which are lowercase already. Only include information that is explicitly stated or strongly implied in the article.`;

// Cheap pre-LLM gate: title/snippet only. Fail OPEN on uncertainty —
// the strict extraction prompt above is the final arbiter, not this triage.
export const TRIAGE_SYSTEM_PROMPT = `You triage cybersecurity article headlines for a UK financial services threat brief. Decide REPORT (worth scraping + deep analysis) or SKIP.

REPORT if the headline/snippet suggests any of: active exploitation, zero-day, ransomware, banking trojan/fraud, financial-sector targeting, UK/EU targeting, supply-chain compromise (npm/PyPI/GitHub/CI-CD), critical vuln (CVSS 9+) in enterprise software, nation-state campaign with new activity, AI-powered attack, MFA/phishing bypass kit, cloud/identity compromise.

SKIP only when clearly low-value: routine CVE without exploitation, product launch/marketing/partnership/webinar/survey, legal sentencing/charges with no new TTPs, minor variant with no victims, single non-financial org incident, opinion piece with no new facts.

When uncertain, REPORT. Vendor research blogs and news headlines usually deserve a full read. Only SKIP obvious noise.`;

export const TriageDecisionSchema = z.object({
    url: z.string().describe('The original article URL'),
    reportWorthy: z.boolean().describe('True to keep for scraping and deep analysis, false to skip. Fail open on uncertainty.'),
    reason: z.string().describe('One short clause explaining the decision'),
    severityGuess: z.enum(SEVERITY_LEVELS).describe('Rough severity guess from headline alone'),
});

export const TriageDecisionArraySchema = z.array(TriageDecisionSchema);

export type TriageDecision = z.infer<typeof TriageDecisionSchema>;

// Deterministic pre-filter: drops obvious noise before any LLM call.
// Deliberately narrow so legitimate stories are never dropped here.
const MSRC_CVE_TITLE = /^cve-\d{4}-\d+/i;
const LOW_VALUE_TITLE_PATTERNS: RegExp[] = [
    /\bsentenced\b/i,
    /\bprison term\b/i,
    /\bwebinar\b/i,
    /\bpartner(?:ship|ed)? announcement\b/i,
    /\bproduct launch(?:es|ed)?\b/i,
    /\bintroduces new\b.*\b(platform|solution|feature)\b/i,
    /\bsurvey (?:shows|finds|reveals)\b/i,
    /\bweekly recap\b/i,
    /\bmonth in review\b/i,
];

export interface PreFilterResult {
    keep: boolean;
    reason: string;
}

export function preFilterArticle(title: string, sourceName: string, snippet?: string): PreFilterResult {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || cleanTitle.toLowerCase() === 'untitled') {
        return { keep: false, reason: 'missing title' };
    }
    // Microsoft MSRC update-guide feed emits one entry per CVE: pure noise
    // unless the entry itself signals exploitation or critical severity.
    if (sourceName === 'Microsoft Security' && MSRC_CVE_TITLE.test(cleanTitle)) {
        const text = `${cleanTitle} ${snippet || ''}`.toLowerCase();
        const signalsExploit = text.includes('exploit') || text.includes('zero-day') || text.includes('zero day') || text.includes('in the wild') || text.includes('kev');
        if (!signalsExploit) return { keep: false, reason: 'MSRC CVE without exploitation signal' };
    }
    for (const pattern of LOW_VALUE_TITLE_PATTERNS) {
        if (pattern.test(cleanTitle)) return { keep: false, reason: `low-value title pattern: ${pattern.source}` };
    }
    return { keep: true, reason: '' };
}
