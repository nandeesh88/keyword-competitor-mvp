import { checkRobotsTxt } from '../validator';

export interface CrawledPageData {
  url: string;
  title: string;
  description: string;
  h1: string;
  h2s: string[];
  heroCopy: string;
  bodyText: string;
  internalLinks: string[];
  domain: string;
}

async function getBrowser() {
  const { chromium } = await import('playwright');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

export async function crawlPage(url: string): Promise<CrawledPageData | null> {
  let browser;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'KeywordDiscoveryBot/1.0',
      timeout: 15000,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const data = await page.evaluate(() => {
      const title = document.title || '';
      const descEl = document.querySelector('meta[name="description"]');
      const description = descEl ? (descEl as HTMLMetaElement).content : '';
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      const h2s = Array.from(document.querySelectorAll('h2'))
        .map((el) => el.textContent?.trim() || '')
        .filter(Boolean)
        .slice(0, 10);

      // Hero copy: first significant paragraph or section
      const heroSelectors = [
        'section:first-of-type p',
        '.hero p',
        '.banner p',
        'main > p:first-of-type',
        'header + * p',
      ];
      let heroCopy = '';
      for (const sel of heroSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 50) {
          heroCopy = el.textContent.trim().slice(0, 500);
          break;
        }
      }

      // Body text (clean)
      const removeEls = document.querySelectorAll(
        'script, style, nav, footer, header, .cookie-banner, .popup'
      );
      removeEls.forEach((el) => el.remove());
      const bodyText = document.body?.innerText?.slice(0, 5000) || '';

      // Internal links
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith('http'));

      return { title, description, h1, h2s, heroCopy, bodyText, links };
    });

    const domain = new URL(url).hostname.replace(/^www\./, '');
    const internalLinks = data.links.filter((l) => {
      try { return new URL(l).hostname.replace(/^www\./, '') === domain; }
      catch { return false; }
    });

    await browser.close();
    return {
      url,
      title: data.title,
      description: data.description,
      h1: data.h1,
      h2s: data.h2s,
      heroCopy: data.heroCopy,
      bodyText: data.bodyText,
      internalLinks: [...new Set(internalLinks)].slice(0, 20),
      domain,
    };
  } catch (err) {
    console.error(`Failed to crawl ${url}:`, err);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

export async function crawlSite(
  startUrl: string,
  maxPages = 10
): Promise<CrawledPageData[]> {
  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const results: CrawledPageData[] = [];
  const baseDomain = new URL(startUrl).hostname.replace(/^www\./, '');

  while (queue.length > 0 && results.length < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    // Check robots.txt
    const robotsCheck = await checkRobotsTxt(startUrl, url);
    if (!robotsCheck.allowed) {
      console.log(`Skipping ${url}: ${robotsCheck.reason}`);
      continue;
    }

    console.log(`Crawling: ${url}`);
    const pageData = await crawlPage(url);
    if (!pageData) continue;

    results.push(pageData);

    // Prioritize key pages
    const priorityKeywords = [
      'features', 'pricing', 'about', 'product', 'solutions',
      'services', 'how-it-works', 'use-cases', 'customers',
    ];

    const newLinks = pageData.internalLinks
      .filter((link) => {
        try {
          const domain = new URL(link).hostname.replace(/^www\./, '');
          return domain === baseDomain && !visited.has(link);
        } catch { return false; }
      })
      .sort((a, b) => {
        const aScore = priorityKeywords.some((k) => a.includes(k)) ? 1 : 0;
        const bScore = priorityKeywords.some((k) => b.includes(k)) ? 1 : 0;
        return bScore - aScore;
      });

    queue.push(...newLinks.slice(0, 5));
  }

  return results;
}

export async function crawlCompetitorPage(
  url: string
): Promise<CrawledPageData | null> {
  return crawlPage(url);
}
