import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;
  const type = req.nextUrl.searchParams.get('type') || 'json';

  const report = await prisma.report.findUnique({ where: { jobId } });

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  if (type === 'pdf') {
    if (!report.pdfPath || !fs.existsSync(report.pdfPath)) {
      return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
    }
    const buffer = fs.readFileSync(report.pdfPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${jobId}.pdf"`,
      },
    });
  }

  // JSON
  if (!report.jsonPath || !fs.existsSync(report.jsonPath)) {
    return NextResponse.json({ error: 'JSON report not found' }, { status: 404 });
  }
  const content = fs.readFileSync(report.jsonPath, 'utf-8');
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="report-${jobId}.json"`,
    },
  });
}
