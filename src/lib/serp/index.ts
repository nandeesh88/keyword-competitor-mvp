import axios from 'axios';
import { extractDomain, isNonCompetitor } from '../validator';

export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  domain: string;
}

export interface SerpQueryResult {
  query: string;
  results: SerpResult[];
}

export async function searchGoogle(query: string): Promise<SerpResult[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) {
    throw new Error('Google CSE API key or CX not configured');
  }

  try {
    const response = await axios.get(
      'https://www.googleapis.com/customsearch/v1',
      {
        params: {
          key: apiKey,
          cx,
          q: query,
          num: 10,
        },
        timeout: 10000,
      }
    );

    const items = response.data.items || [];
    return items.map((item: { title: string; link: string; snippet: string }, index: number) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      position: index + 1,
      domain: extractDomain(item.link),
    }));
  } catch (err: unknown) {
    const error = err as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(`SERP search failed for "${query}":`, error.response?.data || error.message);
    return [];
  }
}

export function generateSerpQueries(
  businessSignals: {
    title: string;
    h1: string;
    description: string;
    h2s: string[];
    domain: string;
  }
): string[] {
  const { title, h1, description, domain } = businessSignals;

  // Extract service name from domain or title
  const domainName = domain.split('.')[0];
  const serviceName = h1 || title || domainName;
  const cleanService = serviceName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40);

  // Extract key topic from description
  const descWords = description.split(' ').slice(0, 5).join(' ');

  const queries = [
    `${cleanService} software`,
    `${cleanService} alternatives`,
    `best ${cleanService}`,
    `${cleanService} competitors`,
    `${cleanService} pricing`,
    `top ${descWords} tools`,
    `${cleanService} vs`,
    `${domainName} alternative`,
  ];

  return [...new Set(queries)].slice(0, 8);
}

export interface CompetitorCandidate {
  domain: string;
  frequency: number;
  avgPosition: number;
  evidence: Array<{
    query: string;
    position: number;
    url: string;
    title: string;
  }>;
}

export async function discoverCompetitors(
  queries: string[],
  targetDomain: string
): Promise<CompetitorCandidate[]> {
  const domainMap = new Map<string, CompetitorCandidate>();

  for (const query of queries) {
    console.log(`SERP query: "${query}"`);
    const results = await searchGoogle(query);

    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 500));

    for (const result of results) {
      const { domain } = result;

      // Skip target and non-competitors
      if (domain === targetDomain || isNonCompetitor(domain)) continue;

      if (!domainMap.has(domain)) {
        domainMap.set(domain, {
          domain,
          frequency: 0,
          avgPosition: 0,
          evidence: [],
        });
      }

      const candidate = domainMap.get(domain)!;
      candidate.frequency += 1;
      candidate.avgPosition =
        (candidate.avgPosition * (candidate.evidence.length) + result.position) /
        (candidate.evidence.length + 1);
      candidate.evidence.push({
        query,
        position: result.position,
        url: result.link,
        title: result.title,
      });
    }
  }

  // Sort by frequency, then avg position as tiebreaker
  return Array.from(domainMap.values())
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.avgPosition - b.avgPosition;
    })
    .slice(0, 10);
}
