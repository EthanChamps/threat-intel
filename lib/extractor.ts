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

Your job is to analyze articles about cyber threats and extract structured information using STIX 2.1 vocabulary standards.

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

6. **ukFinanceRelevance**: Set to TRUE if this article would be particularly relevant to include in a threat report for a UK financial services firm. Consider the following criteria:
   - Directly targets financial services, banking, insurance, or fintech
   - Targets the UK or Europe specifically, or is a global threat
   - Involves supply chain attacks on software/packages used by developers (npm, PyPI, etc.)
   - AI-related threats (AI-powered attacks, AI coding assistants vulnerabilities, LLM exploits)
   - Developer tool vulnerabilities (IDEs, CI/CD pipelines, code repositories)
   - Credential theft, banking trojans, or payment fraud
   - Ransomware targeting enterprise organizations
   - Nation-state actors known to target financial institutions (APT38/Lazarus, FIN groups, etc.)
   - Regulatory compliance implications (GDPR, PCI-DSS, FCA requirements)
   - Cloud security issues affecting enterprise deployments
   - API security vulnerabilities
   - Mobile banking threats
   
7. **relevanceReason**: If ukFinanceRelevance is true, provide a brief explanation of why this is relevant to a UK financial firm. Examples:
   - "NPM package compromise affects developer supply chain"
   - "Banking trojan actively targeting UK customers"
   - "AI-assisted phishing could bypass existing email filters"
   Leave empty string if ukFinanceRelevance is false.

8. **interestingNotes**: A brief 1-2 sentence summary explaining why this threat is notable.

Be concise and accurate. Use lowercase for all vocabulary terms. Only include information that is explicitly stated or strongly implied in the article.`;
