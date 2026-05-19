import fs from 'fs';
import path from 'path';

export async function generatePdfReport(
  reportData: Record<string, unknown>,
  outputPath: string
): Promise<string> {
  // Dynamic import for pdfkit
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const data = reportData as {
      targetUrl?: string;
      generatedAt?: string;
      businessProfile?: { title?: string; description?: string; domain?: string };
      competitors?: Array<{
        domain?: string;
        classification?: string;
        frequency?: number;
        avgPosition?: number;
        evidence?: Array<{ query: string; position: number; url?: string }>;
      }>;
      keywords?: {
        totalCandidates?: number;
        top50?: Array<{
          rank?: number;
          keyword?: string;
          intent?: string;
          relevanceScore?: number;
          opportunityScore?: number;
          whyRelevant?: string;
          sourceEvidence?: { page?: string; snippet?: string };
        }>;
      };
      analysis?: {
        overlapKeywords?: Array<{ keyword?: string; competitorCount?: number }>;
        gapKeywords?: Array<{ keyword?: string; competitorCount?: number }>;
      };
    };

    // Colors
    const PRIMARY = '#1a1a2e';
    const ACCENT = '#e94560';
    const LIGHT = '#f5f5f5';

    // ── COVER PAGE ──────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 200).fill(PRIMARY);
    doc
      .fillColor('white')
      .fontSize(28)
      .font('Helvetica-Bold')
      .text('Keyword + Competitor', 50, 60)
      .text('Discovery Report', 50, 95);

    doc
      .fillColor(ACCENT)
      .fontSize(12)
      .text(`Target: ${data.targetUrl || ''}`, 50, 145)
      .text(`Generated: ${new Date(data.generatedAt || Date.now()).toLocaleDateString()}`, 50, 165);

    doc.fillColor('#333').fontSize(10).moveDown(8);

    // ── BUSINESS PROFILE ─────────────────────────────────────
    addSection(doc, 'Business Profile', PRIMARY, ACCENT);
    const bp = data.businessProfile || {};
    addRow(doc, 'Domain', bp.domain || '');
    addRow(doc, 'Title', bp.title || '');
    addRow(doc, 'Description', bp.description || '');
    doc.moveDown();

    // ── COMPETITORS ───────────────────────────────────────────
    addSection(doc, 'Top Competitors', PRIMARY, ACCENT);
    const competitors = data.competitors || [];
    for (const comp of competitors.slice(0, 10)) {
      doc
        .fillColor(PRIMARY)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`${comp.domain}`, { continued: true })
        .fillColor(ACCENT)
        .font('Helvetica')
        .fontSize(9)
        .text(`  [${comp.classification || 'OTHER'}]`);

      doc
        .fillColor('#555')
        .fontSize(9)
        .font('Helvetica')
        .text(
          `Frequency: ${comp.frequency} queries | Avg Position: ${(comp.avgPosition || 0).toFixed(1)}`
        );

      const evidence = (comp.evidence || []).slice(0, 2);
      for (const e of evidence) {
        doc.fillColor('#777').text(`  • "${e.query}" — position ${e.position}`);
      }
      doc.moveDown(0.5);
    }

    // ── TOP 50 KEYWORDS ───────────────────────────────────────
    doc.addPage();
    addSection(doc, 'Top 50 Keywords', PRIMARY, ACCENT);

    const top50 = data.keywords?.top50 || [];
    let y = doc.y;

    for (const kw of top50) {
      if (doc.y > 720) {
        doc.addPage();
        y = 50;
        doc.y = y;
      }

      doc
        .fillColor(PRIMARY)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`${kw.rank}. ${kw.keyword}`, { continued: true })
        .fillColor('#888')
        .font('Helvetica')
        .fontSize(8)
        .text(`  [${kw.intent}]`);

      doc.fillColor('#555').fontSize(8).text(
        `Relevance: ${((kw.relevanceScore || 0) * 100).toFixed(0)}% | Opportunity: ${kw.opportunityScore}/100`
      );
      doc.fillColor('#666').text(kw.whyRelevant || '');
      if (kw.sourceEvidence?.snippet) {
        doc
          .fillColor('#999')
          .fontSize(7)
          .text(`Evidence: ${kw.sourceEvidence.snippet.slice(0, 100)}...`);
      }
      doc.moveDown(0.4);
    }

    // ── GAP + OVERLAP ─────────────────────────────────────────
    doc.addPage();
    addSection(doc, 'Keyword Overlap (Top 30)', PRIMARY, ACCENT);
    const overlap = data.analysis?.overlapKeywords || [];
    doc.fillColor('#333').fontSize(9);
    for (const kw of overlap) {
      doc.text(`• ${kw.keyword}  (${kw.competitorCount} competitors)`);
    }

    doc.moveDown(2);
    addSection(doc, 'Keyword Gaps — Opportunities (Top 30)', PRIMARY, ACCENT);
    const gaps = data.analysis?.gapKeywords || [];
    doc.fillColor('#333').fontSize(9);
    for (const kw of gaps) {
      doc.text(`• ${kw.keyword}  (${kw.competitorCount} competitors use this)`);
    }

    // ── FOOTER ────────────────────────────────────────────────
    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

function addSection(
  doc: InstanceType<typeof import('pdfkit')>,
  title: string,
  primary: string,
  accent: string
) {
  doc
    .moveDown()
    .fillColor(primary)
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(title);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(accent).lineWidth(2).stroke();
  doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#333');
}

function addRow(
  doc: InstanceType<typeof import('pdfkit')>,
  label: string,
  value: string
) {
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#555')
    .text(`${label}: `, { continued: true })
    .font('Helvetica')
    .fillColor('#333')
    .text(value || '—');
}
