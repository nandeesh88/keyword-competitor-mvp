import Groq from 'groq-sdk';

export interface RawKeyword {
  keyword: string;
  frequency: number;
  sources: string[];
  snippets: string[];
}

// N-gram extraction from text
function extractNgrams(text: string, n: number): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter((w) => w.length > 2);
  const stopwords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any',
    'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get',
    'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old',
    'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use', 'her',
    'more', 'also', 'from', 'that', 'this', 'with', 'have', 'will',
    'been', 'into', 'your', 'they', 'were', 'when', 'what', 'which',
    'their', 'there', 'about', 'would', 'other', 'these', 'those',
    'then', 'than', 'some', 'time', 'very', 'just', 'over', 'such',
    'only', 'come', 'make', 'like', 'know', 'take', 'year', 'good',
    'page', 'home', 'need', 'help', 'data',
  ]);

  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n);
    if (n === 1 && stopwords.has(gram[0])) continue;
    if (gram.some((w) => w.length < 2)) continue;
    ngrams.push(gram.join(' '));
  }

  return ngrams;
}

export function extractKeywordsFromPages(
  pages: Array<{
    url: string;
    title: string;
    description: string;
    h1: string;
    h2s: string[];
    heroCopy: string;
    bodyText: string;
  }>
): RawKeyword[] {
  const keywordMap = new Map<string, RawKeyword>();

  for (const page of pages) {
    // Higher weight sources
    const highWeightText = [
      page.title,
      page.h1,
      page.description,
      ...page.h2s,
      page.heroCopy,
    ].join(' ');

    const bodyText = page.bodyText || '';

    const allNgrams = [
      ...extractNgrams(highWeightText, 1).flatMap((k) => Array(3).fill(k)), // 3x weight for headings
      ...extractNgrams(highWeightText, 2).flatMap((k) => Array(3).fill(k)),
      ...extractNgrams(highWeightText, 3).flatMap((k) => Array(2).fill(k)),
      ...extractNgrams(bodyText, 1),
      ...extractNgrams(bodyText, 2),
      ...extractNgrams(bodyText, 3),
    ];

    for (const kw of allNgrams) {
      if (kw.length < 3 || kw.length > 60) continue;
      if (!keywordMap.has(kw)) {
        keywordMap.set(kw, { keyword: kw, frequency: 0, sources: [], snippets: [] });
      }
      const entry = keywordMap.get(kw)!;
      entry.frequency += 1;
      if (!entry.sources.includes(page.url)) {
        entry.sources.push(page.url);
      }
      // Find a snippet
      const idx = bodyText.toLowerCase().indexOf(kw);
      if (idx !== -1 && entry.snippets.length < 2) {
        entry.snippets.push(bodyText.slice(Math.max(0, idx - 50), idx + 100).trim());
      }
    }
  }

  // Filter noise: require freq > 1 for single words
  return Array.from(keywordMap.values())
    .filter((k) => {
      const wordCount = k.keyword.split(' ').length;
      if (wordCount === 1) return k.frequency > 2;
      if (wordCount === 2) return k.frequency > 1;
      return true;
    })
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 500);
}

export interface ScoredKeyword {
  keyword: string;
  intent: 'INFO' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'COMPARISON';
  whyRelevant: string;
  sourceEvidence: { page: string; snippet: string };
  relevanceScore: number;
  opportunityScore: number;
  opportunityNote: string;
}

// Intent detection heuristics
function detectIntent(keyword: string): 'INFO' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'COMPARISON' {
  const kw = keyword.toLowerCase();

  if (
    kw.includes('vs ') || kw.includes(' vs') || kw.includes('compare') ||
    kw.includes('alternative') || kw.includes('competitor')
  ) return 'COMPARISON';

  if (
    kw.includes('buy') || kw.includes('price') || kw.includes('pricing') ||
    kw.includes('cost') || kw.includes('free trial') || kw.includes('sign up') ||
    kw.includes('get started') || kw.includes('download') || kw.includes('subscribe')
  ) return 'TRANSACTIONAL';

  if (
    kw.includes('best') || kw.includes('top') || kw.includes('review') ||
    kw.includes('software') || kw.includes('tool') || kw.includes('platform') ||
    kw.includes('service') || kw.includes('solution')
  ) return 'COMMERCIAL';

  return 'INFO';
}

export async function scoreKeywordsWithGroq(
  keywords: RawKeyword[],
  businessContext: string,
  targetDomain: string
): Promise<ScoredKeyword[]> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const top100 = keywords.slice(0, 100);
  const chunks = [];
  for (let i = 0; i < top100.length; i += 25) {
    chunks.push(top100.slice(i, i + 25));
  }

  const scored: ScoredKeyword[] = [];

  for (const chunk of chunks) {
    const kwList = chunk.map((k) => k.keyword).join('\n');
    const prompt = `You are an SEO expert. Given this business context: "${businessContext}"
And domain: ${targetDomain}

Score each keyword below on:
- relevanceScore (0-1): how relevant to the business offerings/audience
- opportunityScore (0-100): estimated SEO opportunity (higher = better chance to rank + business value)
- whyRelevant: 1 line explanation
- opportunityNote: brief reason for opportunity score

Keywords:
${kwList}

Return ONLY valid JSON array, no markdown:
[{"keyword":"...","relevanceScore":0.9,"opportunityScore":75,"whyRelevant":"...","opportunityNote":"..."}]`;

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const text = completion.choices[0]?.message?.content || '[]';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean) as Array<{
        keyword: string;
        relevanceScore: number;
        opportunityScore: number;
        whyRelevant: string;
        opportunityNote: string;
      }>;

      for (const item of parsed) {
        const raw = chunk.find((k) => k.keyword === item.keyword);
        if (!raw) continue;

        scored.push({
          keyword: item.keyword,
          intent: detectIntent(item.keyword),
          whyRelevant: item.whyRelevant || 'Appears in target/competitor content',
          sourceEvidence: {
            page: raw.sources[0] || targetDomain,
            snippet: raw.snippets[0] || '',
          },
          relevanceScore: Math.min(1, Math.max(0, item.relevanceScore || 0.5)),
          opportunityScore: Math.min(100, Math.max(0, item.opportunityScore || 50)),
          opportunityNote: item.opportunityNote || '',
        });
      }
    } catch (err) {
      console.error('Groq scoring error:', err);
      // Fallback: score without AI
      for (const raw of chunk) {
        scored.push({
          keyword: raw.keyword,
          intent: detectIntent(raw.keyword),
          whyRelevant: 'Extracted from target/competitor pages',
          sourceEvidence: {
            page: raw.sources[0] || targetDomain,
            snippet: raw.snippets[0] || '',
          },
          relevanceScore: Math.min(1, raw.frequency / 20),
          opportunityScore: Math.min(100, raw.frequency * 5),
          opportunityNote: `Appears ${raw.frequency} times across crawled pages`,
        });
      }
    }

    // Rate limit pause
    await new Promise((r) => setTimeout(r, 1000));
  }

  return scored
    .sort((a, b) => b.relevanceScore * b.opportunityScore - a.relevanceScore * a.opportunityScore)
    .slice(0, 50);
}

export async function classifyCompetitorWithGroq(
  competitorDomain: string,
  targetContext: string,
  competitorKeywords: string[]
): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const prompt = `Target business: ${targetContext}
Competitor domain: ${competitorDomain}
Competitor keywords sample: ${competitorKeywords.slice(0, 10).join(', ')}

Classify this competitor as exactly one of:
DIRECT - same product/service, same audience
ADJACENT - related space, overlapping audience
PUBLISHER - media/blog/review site
MARKETPLACE - marketplace or directory
OTHER - unrelated

Reply with ONLY the classification word, nothing else.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 10,
    });

    const result = completion.choices[0]?.message?.content?.trim().toUpperCase() || 'OTHER';
    const valid = ['DIRECT', 'ADJACENT', 'PUBLISHER', 'MARKETPLACE', 'OTHER'];
    return valid.includes(result) ? result : 'OTHER';
  } catch {
    return 'OTHER';
  }
}

export function analyzeGapOverlap(
  targetKeywords: string[],
  competitorKeywordMap: Map<string, string[]> // domain -> keywords
): {
  overlapKeywords: Array<{ keyword: string; competitorCount: number }>;
  gapKeywords: Array<{ keyword: string; competitorCount: number }>;
} {
  const targetSet = new Set(targetKeywords.map((k) => k.toLowerCase()));
  const allCompetitorKeywords = new Map<string, number>(); // keyword -> count

  for (const keywords of competitorKeywordMap.values()) {
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      allCompetitorKeywords.set(lower, (allCompetitorKeywords.get(lower) || 0) + 1);
    }
  }

  const overlapKeywords: Array<{ keyword: string; competitorCount: number }> = [];
  const gapKeywords: Array<{ keyword: string; competitorCount: number }> = [];

  for (const [kw, count] of allCompetitorKeywords.entries()) {
    if (targetSet.has(kw)) {
      overlapKeywords.push({ keyword: kw, competitorCount: count });
    } else {
      gapKeywords.push({ keyword: kw, competitorCount: count });
    }
  }

  return {
    overlapKeywords: overlapKeywords
      .sort((a, b) => b.competitorCount - a.competitorCount)
      .slice(0, 30),
    gapKeywords: gapKeywords
      .sort((a, b) => b.competitorCount - a.competitorCount)
      .slice(0, 30),
  };
}
