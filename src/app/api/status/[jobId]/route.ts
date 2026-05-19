import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  const job = await prisma.analysisJob.findUnique({
    where: { id: jobId },
    include: {
      report: true,
      competitors: { take: 10, orderBy: { frequency: 'desc' } },
      keywords: { where: { rank: { lte: 10 } }, orderBy: { rank: 'asc' } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    targetUrl: job.targetUrl,
    status: job.status,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    summary: job.report?.summary || null,
    reportUrls: job.report
      ? {
          json: `/api/report/${jobId}?type=json`,
          pdf: `/api/report/${jobId}?type=pdf`,
        }
      : null,
    preview: {
      topCompetitors: job.competitors.map((c) => ({
        domain: c.domain,
        classification: c.classification,
        frequency: c.frequency,
      })),
      topKeywords: job.keywords.map((k) => ({
        rank: k.rank,
        keyword: k.keyword,
        intent: k.intent,
        opportunityScore: k.opportunityScore,
      })),
    },
  });
}
