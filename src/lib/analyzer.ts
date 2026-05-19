import { prisma } from './prisma';
import { validateUrl, extractDomain } from './validator';
import { crawlSite } from './crawler';
import {
  generateSerpQueries,
  discoverCompetitors,
} from './serp';
import {
  extractKeywordsFromPages,
  scoreKeywordsWithGroq,
  classifyCompetitorWithGroq,
  analyzeGapOverlap,
} from './keywords';
import { generatePdfReport } from './pdf';
import path from 'path';
import fs from 'fs';

export async function runAnalysis(jobId: string, targetUrl: string) {
  try {
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: 'running' },
    });

    // ── STEP 1: Validate URL ────────────────────────────────
    const validation = await validateUrl(targetUrl);
    if (!validation.valid) {
      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'error', errorMessage: validation.error },
      });
      return;
    }

    const finalUrl = validation.finalUrl || targetUrl;
    const targetDomain = extractDomain(finalUrl);

    // ── STEP 2: Crawl target site ───────────────────────────
    console.log(`[${jobId}] Crawling target site: ${finalUrl}`);
    const targetPages = await crawlSite(finalUrl, 10);

    if (targetPages.length === 0) {
      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'error', errorMessage: 'Could not crawl any pages from the target site' },
      });
      return;
    }

    // Save crawled pages
    await prisma.crawledPage.createMany({
      data: targetPages.map((p) => ({
        jobId,
        url: p.url,
        title: p.title,
        description: p.description,
        h1: p.h1,
        h2s: p.h2s,
        heroCopy: p.heroCopy,
        bodyText: p.bodyText.slice(0, 3000),
        isTarget: true,
        domain: targetDomain,
      })),
    });

    const homePage = targetPages[0];
    const businessContext = `${homePage.title} - ${homePage.description} - ${homePage.h1}`;

    // ── STEP 3: Generate SERP queries ───────────────────────
    console.log(`[${jobId}] Generating SERP queries`);
    const serpQueries = generateSerpQueries({
      title: homePage.title,
      h1: homePage.h1,
      description: homePage.description,
      h2s: homePage.h2s,
      domain: targetDomain,
    });

    // ── STEP 4: Discover competitors ────────────────────────
    console.log(`[${jobId}] Running SERP queries for competitor discovery`);
    const competitorCandidates = await discoverCompetitors(serpQueries, targetDomain);

    // ── STEP 5: Crawl competitors + classify ────────────────
    const competitorKeywordMap = new Map<string, string[]>();

    for (const candidate of competitorCandidates.slice(0, 5)) {
      console.log(`[${jobId}] Crawling competitor: ${candidate.domain}`);
      try {
        const compPages = await crawlSite(`https://${candidate.domain}`, 3);

        await prisma.crawledPage.createMany({
          data: compPages.map((p) => ({
            jobId,
            url: p.url,
            title: p.title,
            description: p.description,
            h1: p.h1,
            h2s: p.h2s,
            heroCopy: p.heroCopy,
            bodyText: p.bodyText.slice(0, 2000),
            isTarget: false,
            domain: candidate.domain,
          })),
        });

        const compKws = extractKeywordsFromPages(compPages);
        competitorKeywordMap.set(candidate.domain, compKws.map((k) => k.keyword));

        const classification = await classifyCompetitorWithGroq(
          candidate.domain,
          businessContext,
          compKws.slice(0, 20).map((k) => k.keyword)
        );

        await prisma.competitor.create({
          data: {
            jobId,
            domain: candidate.domain,
            frequency: candidate.frequency,
            avgPosition: candidate.avgPosition,
            classification,
            similarityScore: candidate.frequency / (serpQueries.length || 1),
            evidence: candidate.evidence,
          },
        });
      } catch (err) {
        console.error(`Failed to process competitor ${candidate.domain}:`, err);
        // Save without crawl
        await prisma.competitor.create({
          data: {
            jobId,
            domain: candidate.domain,
            frequency: candidate.frequency,
            avgPosition: candidate.avgPosition,
            classification: 'OTHER',
            similarityScore: candidate.frequency / (serpQueries.length || 1),
            evidence: candidate.evidence,
          },
        });
      }
    }

    // Save remaining competitors (not crawled)
    for (const candidate of competitorCandidates.slice(5)) {
      await prisma.competitor.create({
        data: {
          jobId,
          domain: candidate.domain,
          frequency: candidate.frequency,
          avgPosition: candidate.avgPosition,
          classification: 'OTHER',
          similarityScore: candidate.frequency / (serpQueries.length || 1),
          evidence: candidate.evidence,
        },
      });
    }

    // ── STEP 6: Extract + score keywords ────────────────────
    console.log(`[${jobId}] Extracting keywords`);
    const allPages = await prisma.crawledPage.findMany({ where: { jobId, isTarget: true } });
    const rawKeywords = extractKeywordsFromPages(
      allPages.map((p) => ({
        url: p.url,
        title: p.title || '',
        description: p.description || '',
        h1: p.h1 || '',
        h2s: p.h2s,
        heroCopy: p.heroCopy || '',
        bodyText: p.bodyText || '',
      }))
    );

    console.log(`[${jobId}] Scoring ${rawKeywords.length} candidate keywords with Groq`);
    const scoredKeywords = await scoreKeywordsWithGroq(rawKeywords, businessContext, targetDomain);

    // ── STEP 7: Gap + overlap analysis ──────────────────────
    const targetKwList = rawKeywords.map((k) => k.keyword);
    const { overlapKeywords, gapKeywords } = analyzeGapOverlap(targetKwList, competitorKeywordMap);

    // Save keywords
    await prisma.keyword.createMany({
      data: scoredKeywords.map((kw, index) => ({
        jobId,
        keyword: kw.keyword,
        intent: kw.intent,
        whyRelevant: kw.whyRelevant,
        sourceEvidence: kw.sourceEvidence,
        relevanceScore: kw.relevanceScore,
        opportunityScore: kw.opportunityScore,
        opportunityNote: kw.opportunityNote,
        isOverlap: overlapKeywords.some((o) => o.keyword === kw.keyword.toLowerCase()),
        isGap: false,
        competitorCount: overlapKeywords.find((o) => o.keyword === kw.keyword.toLowerCase())?.competitorCount || 0,
        rank: index + 1,
      })),
    });

    // ── STEP 8: Build report.json ────────────────────────────
    const competitors = await prisma.competitor.findMany({ where: { jobId } });

    const reportData = {
      targetUrl: finalUrl,
      generatedAt: new Date().toISOString(),
      businessProfile: {
        domain: targetDomain,
        title: homePage.title,
        description: homePage.description,
        h1: homePage.h1,
        h2s: homePage.h2s,
        pagesCrawled: targetPages.length,
      },
      serpQueries,
      competitors: competitors.map((c) => ({
        domain: c.domain,
        classification: c.classification,
        frequency: c.frequency,
        avgPosition: c.avgPosition,
        similarityScore: c.similarityScore,
        evidence: c.evidence,
      })),
      keywords: {
        totalCandidates: rawKeywords.length,
        top50: scoredKeywords.map((kw, i) => ({ rank: i + 1, ...kw })),
      },
      analysis: {
        overlapKeywords,
        gapKeywords,
        competitorRanking: competitors
          .sort((a, b) => b.similarityScore - a.similarityScore)
          .map((c) => ({ domain: c.domain, classification: c.classification, similarityScore: c.similarityScore })),
      },
    };

    // Save JSON report
    const reportsDir = process.env.REPORTS_DIR || './reports';
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, `${jobId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));

    // ── STEP 9: Generate PDF ─────────────────────────────────
    const pdfPath = path.join(reportsDir, `${jobId}.pdf`);
    await generatePdfReport(reportData, pdfPath);

    // Save report record
    await prisma.report.create({
      data: {
        jobId,
        jsonPath,
        pdfPath,
        summary: {
          pagesCrawled: targetPages.length,
          competitorsFound: competitors.length,
          keywordCandidates: rawKeywords.length,
          top50Count: scoredKeywords.length,
          overlapCount: overlapKeywords.length,
          gapCount: gapKeywords.length,
        },
      },
    });

    await prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: 'done' },
    });

    console.log(`[${jobId}] Analysis complete!`);
  } catch (err) {
    console.error(`[${jobId}] Analysis failed:`, err);
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });
  }
}
