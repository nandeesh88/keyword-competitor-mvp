import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateUrl } from '@/lib/validator';
import { runAnalysis } from '@/lib/analyzer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetUrl } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: 'targetUrl is required' }, { status: 400 });
    }

    // Quick HTTPS check before DB
    if (!targetUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'URL must start with https://' }, { status: 400 });
    }

    // Validate URL
    const validation = await validateUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 422 });
    }

    // Create job
    const job = await prisma.analysisJob.create({
      data: { targetUrl, status: 'pending' },
    });

    // Run async (fire and forget)
    runAnalysis(job.id, targetUrl).catch(console.error);

    return NextResponse.json({
      jobId: job.id,
      status: 'pending',
      message: 'Analysis started. Poll /api/status/${jobId} for updates.',
      statusUrl: `/api/status/${job.id}`,
    });
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
