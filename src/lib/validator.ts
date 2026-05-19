import robotsParser from 'robots-parser';
import axios from 'axios';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  finalUrl?: string;
  statusCode?: number;
}

export async function validateUrl(inputUrl: string): Promise<ValidationResult> {
  // Must be HTTPS
  if (!inputUrl.startsWith('https://')) {
    return { valid: false, error: 'URL must use HTTPS' };
  }

  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Follow redirects (max 5), check final status
  try {
    const response = await axios.get(inputUrl, {
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'KeywordDiscoveryBot/1.0 (+https://github.com/your-repo)',
      },
    });

    if (response.status >= 400) {
      return {
        valid: false,
        error: `Site returned ${response.status} status`,
        statusCode: response.status,
      };
    }

    return {
      valid: true,
      finalUrl: response.request?.res?.responseUrl || inputUrl,
      statusCode: response.status,
    };
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'ENOTFOUND') {
      return { valid: false, error: 'DNS resolution failed — domain not found' };
    }
    if (error.code === 'ETIMEDOUT') {
      return { valid: false, error: 'Connection timed out' };
    }
    return { valid: false, error: `Connection failed: ${error.message}` };
  }
}

export async function checkRobotsTxt(
  siteUrl: string,
  pageUrl: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const base = new URL(siteUrl);
    const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;

    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      // No robots.txt = allow everything
      return { allowed: true };
    }

    const robots = robotsParser(robotsUrl, response.data);
    const allowed = robots.isAllowed(pageUrl, 'KeywordDiscoveryBot') ?? true;

    return {
      allowed,
      reason: allowed ? undefined : 'Blocked by robots.txt',
    };
  } catch {
    return { allowed: true };
  }
}

export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const NON_COMPETITOR_DOMAINS = [
  'wikipedia.org', 'reddit.com', 'youtube.com', 'facebook.com',
  'twitter.com', 'instagram.com', 'linkedin.com', 'pinterest.com',
  'amazon.com', 'ebay.com', 'etsy.com', 'quora.com', 'medium.com',
  'github.com', 'stackoverflow.com', 'yelp.com', 'trustpilot.com',
  'g2.com', 'capterra.com', 'getapp.com', 'techcrunch.com',
  'forbes.com', 'bloomberg.com', 'wsj.com', 'nytimes.com',
  'inc.com', 'entrepreneur.com', 'glassdoor.com', 'indeed.com',
  'crunchbase.com', 'producthunt.com', 'appsumo.com',
];

export function isNonCompetitor(domain: string): boolean {
  return NON_COMPETITOR_DOMAINS.some(
    (blocked) => domain === blocked || domain.endsWith(`.${blocked}`)
  );
}
