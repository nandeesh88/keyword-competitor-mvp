'use client';
import { useState, useEffect, useRef } from 'react';

type Intent = 'INFO' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'COMPARISON';
type Classification = 'DIRECT' | 'ADJACENT' | 'PUBLISHER' | 'MARKETPLACE' | 'OTHER';

interface JobStatus {
  jobId: string;
  targetUrl: string;
  status: 'pending' | 'running' | 'done' | 'error';
  errorMessage?: string;
  summary?: {
    pagesCrawled: number;
    competitorsFound: number;
    keywordCandidates: number;
    top50Count: number;
    overlapCount: number;
    gapCount: number;
  };
  reportUrls?: { json: string; pdf: string };
  preview?: {
    topCompetitors: Array<{ domain: string; classification: string; frequency: number }>;
    topKeywords: Array<{ rank: number; keyword: string; intent: string; opportunityScore: number }>;
  };
}

interface FullReport {
  targetUrl: string;
  generatedAt: string;
  businessProfile: { domain: string; title: string; description: string; h1: string; pagesCrawled: number };
  serpQueries: string[];
  competitors: Array<{
    domain: string;
    classification: Classification;
    frequency: number;
    avgPosition: number;
    similarityScore: number;
    evidence: Array<{ query: string; position: number; url: string; title: string }>;
  }>;
  keywords: {
    totalCandidates: number;
    top50: Array<{
      rank: number;
      keyword: string;
      intent: Intent;
      whyRelevant: string;
      sourceEvidence: { page: string; snippet: string };
      relevanceScore: number;
      opportunityScore: number;
      opportunityNote: string;
    }>;
  };
  analysis: {
    overlapKeywords: Array<{ keyword: string; competitorCount: number }>;
    gapKeywords: Array<{ keyword: string; competitorCount: number }>;
  };
}

const STEPS = [
  { label: 'Validating URL', icon: '🔐' },
  { label: 'Crawling target site', icon: '🕷️' },
  { label: 'Running SERP queries', icon: '🔍' },
  { label: 'Analyzing competitors', icon: '🏢' },
  { label: 'Mining keywords', icon: '⛏️' },
  { label: 'Scoring with AI', icon: '🤖' },
  { label: 'Generating report', icon: '📊' },
];

function IntentBadge({ intent }: { intent: string }) {
  const cls = `badge badge-${intent.toLowerCase()}`;
  return <span className={cls}>{intent}</span>;
}

function ClassBadge({ cls }: { cls: string }) {
  const c = `badge badge-${cls.toLowerCase()}`;
  return <span className={c}>{cls}</span>;
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="score-bar">
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-val">{max === 1 ? `${Math.round(value * 100)}%` : value}</span>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [report, setReport] = useState<FullReport | null>(null);
  const [activeTab, setActiveTab] = useState('competitors');
  const [stepIdx, setStepIdx] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Animate steps while running
  useEffect(() => {
    if (status?.status === 'running') {
      const t = setInterval(() => setStepIdx((i) => (i + 1) % STEPS.length), 3500);
      return () => clearInterval(t);
    }
  }, [status?.status]);

  // Poll for status
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data: JobStatus = await res.json();
        setStatus(data);
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRef.current!);
          setLoading(false);
          if (data.status === 'done' && data.reportUrls) {
            // Fetch full report JSON
            const rRes = await fetch(data.reportUrls.json);
            const rData: FullReport = await rRes.json();
            setReport(rData);
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);
    return () => clearInterval(pollRef.current!);
  }, [jobId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus(null);
    setReport(null);
    setStepIdx(0);

    if (!url.startsWith('https://')) {
      setError('URL must start with https://');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start analysis'); setLoading(false); return; }
      setJobId(data.jobId);
    } catch {
      setError('Failed to connect to server');
      setLoading(false);
    }
  }

  const isDone = status?.status === 'done';
  const isRunning = status?.status === 'running' || status?.status === 'pending';
  const isError = status?.status === 'error';

  return (
    <div className="noise" style={{ minHeight: '100vh' }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(233,69,96,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(233,69,96,0.03) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER */}
        <header style={{
          borderBottom: '1px solid var(--border)',
          background: 'rgba(10,10,15,0.9)',
          backdropFilter: 'blur(12px)',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>🎯</div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
                  KeywordSpy
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)', letterSpacing: '0.06em' }}>
                  COMPETITOR · KEYWORD · DISCOVERY
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isDone && status?.reportUrls && (
                <>
                  <a href={status.reportUrls.json} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>
                    ↓ JSON
                  </a>
                  <a href={status.reportUrls.pdf} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>
                    ↓ PDF Report
                  </a>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="container" style={{ paddingTop: 60, paddingBottom: 80 }}>
          {/* HERO */}
          {!status && (
            <div className="animate-fadeIn" style={{ textAlign: 'center', marginBottom: 64 }}>
              <div style={{
                display: 'inline-block',
                background: 'rgba(233,69,96,0.1)',
                border: '1px solid rgba(233,69,96,0.2)',
                borderRadius: 100,
                padding: '6px 16px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: 'var(--accent)',
                letterSpacing: '0.08em',
                marginBottom: 24,
              }}>
                ✦ POWERED BY GOOGLE CSE + GROQ AI
              </div>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                marginBottom: 20,
              }}>
                Discover Keywords<br />
                <span style={{ color: 'var(--accent)' }}>Your Competitors</span> Rank For
              </h1>
              <p style={{ color: 'var(--text2)', fontSize: '1.1rem', maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.7 }}>
                Enter any website URL. We crawl it, find competitors via SERP data,
                extract business-relevant keywords, and show you the gaps.
              </p>
            </div>
          )}

          {/* INPUT FORM */}
          <div className={`card animate-fadeIn ${!status ? 'card--glow' : ''}`}
            style={{ maxWidth: 720, margin: '0 auto 40px', animationDelay: '0.1s' }}>
            <form onSubmit={handleSubmit}>
              <label style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text2)', letterSpacing: '0.06em', marginBottom: 10 }}>
                TARGET WEBSITE URL
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <input
                  className="input"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" type="submit" disabled={loading || !url}>
                  {loading ? (
                    <><div className="spinner" style={{ width: 16, height: 16 }} /> Analyzing</>
                  ) : (
                    <> Run Analysis →</>
                  )}
                </button>
              </div>
              {error && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: 'var(--error)', fontSize: '0.85rem' }}>
                  ⚠ {error}
                </div>
              )}
            </form>
          </div>

          {/* RUNNING STATE */}
          {isRunning && (
            <div className="card animate-fadeIn" style={{ maxWidth: 720, margin: '0 auto 40px' }}>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div className="animate-pulse" style={{ fontSize: '3rem', marginBottom: 12 }}>
                  {STEPS[stepIdx].icon}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: 6 }}>
                  {STEPS[stepIdx].label}...
                </div>
                <div style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>
                  Job ID: <code style={{ color: 'var(--accent)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>{jobId}</code>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {STEPS.map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8,
                    background: i === stepIdx ? 'rgba(233,69,96,0.08)' : 'transparent',
                    border: i === stepIdx ? '1px solid rgba(233,69,96,0.2)' : '1px solid transparent',
                    transition: 'all 0.3s',
                  }}>
                    <span style={{ fontSize: '1rem', opacity: i > stepIdx ? 0.3 : 1 }}>{step.icon}</span>
                    <span style={{
                      fontSize: '0.88rem',
                      color: i < stepIdx ? 'var(--success)' : i === stepIdx ? 'var(--text)' : 'var(--text3)',
                      fontWeight: i === stepIdx ? 500 : 300,
                    }}>
                      {i < stepIdx ? '✓ ' : ''}{step.label}
                    </span>
                    {i === stepIdx && <div className="spinner" style={{ marginLeft: 'auto', width: 14, height: 14 }} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {isError && (
            <div className="card animate-fadeIn" style={{ maxWidth: 720, margin: '0 auto 40px', borderColor: 'rgba(239,68,68,0.3)' }}>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⚠️</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--error)', marginBottom: 8 }}>Analysis Failed</div>
                <div style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>{status?.errorMessage}</div>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {isDone && report && (
            <div className="animate-fadeIn">
              {/* Stats */}
              <div className="stat-grid" style={{ marginBottom: 32 }}>
                {[
                  { num: report.businessProfile.pagesCrawled, label: 'Pages Crawled' },
                  { num: report.competitors.length, label: 'Competitors Found' },
                  { num: report.keywords.totalCandidates, label: 'Keywords Mined' },
                  { num: report.keywords.top50.length, label: 'Top Keywords' },
                  { num: report.analysis.overlapKeywords.length, label: 'Overlap Keywords' },
                  { num: report.analysis.gapKeywords.length, label: 'Gap Opportunities' },
                ].map((s, i) => (
                  <div className={`stat-card animate-fadeIn delay-${Math.min(i + 1, 5)}`} key={i}>
                    <div className="stat-num">{s.num}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Business Profile */}
              <div className="card animate-slideIn" style={{ marginBottom: 24 }}>
                <div className="section-title">Business Profile</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', letterSpacing: '0.05em', marginBottom: 4 }}>DOMAIN</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent)' }}>{report.businessProfile.domain}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', letterSpacing: '0.05em', marginBottom: 4 }}>TITLE</div>
                    <div style={{ fontSize: '0.9rem' }}>{report.businessProfile.title}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', letterSpacing: '0.05em', marginBottom: 4 }}>SERP QUERIES USED</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {report.serpQueries.map((q, i) => (
                        <span key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 100, padding: '2px 10px', fontSize: '0.75rem', color: 'var(--text2)' }}>
                          {q}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="tabs">
                {['competitors', 'keywords', 'overlap', 'gaps'].map((tab) => (
                  <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                    {tab === 'competitors' && `🏢 Competitors (${report.competitors.length})`}
                    {tab === 'keywords' && `🔑 Top 50 Keywords`}
                    {tab === 'overlap' && `🔄 Overlap (${report.analysis.overlapKeywords.length})`}
                    {tab === 'gaps' && `⚡ Gaps (${report.analysis.gapKeywords.length})`}
                  </button>
                ))}
              </div>

              {/* Competitors Tab */}
              {activeTab === 'competitors' && (
                <div className="card animate-fadeIn">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Domain</th>
                          <th>Type</th>
                          <th>Frequency</th>
                          <th>Avg Position</th>
                          <th>Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.competitors.map((c, i) => (
                          <tr key={c.domain}>
                            <td style={{ color: 'var(--text3)', fontFamily: 'monospace' }}>{String(i + 1).padStart(2, '0')}</td>
                            <td>
                              <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'none', fontFamily: 'var(--font-display)' }}>
                                {c.domain}
                              </a>
                            </td>
                            <td><ClassBadge cls={c.classification} /></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 40, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${(c.frequency / 8) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: '0.85rem' }}>{c.frequency}</span>
                              </div>
                            </td>
                            <td style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{c.avgPosition.toFixed(1)}</td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                              {(c.evidence as Array<{query: string; position: number}>).slice(0, 2).map((e, j) => (
                                <div key={j}>"{e.query}" #{e.position}</div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Keywords Tab */}
              {activeTab === 'keywords' && (
                <div className="card animate-fadeIn">
                  <div style={{ marginBottom: 16, color: 'var(--text2)', fontSize: '0.85rem' }}>
                    Showing top 50 of <strong style={{ color: 'var(--text)' }}>{report.keywords.totalCandidates}</strong> candidate keywords
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Keyword</th>
                          <th>Intent</th>
                          <th>Relevance</th>
                          <th>Opportunity</th>
                          <th>Why Relevant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.keywords.top50.map((kw) => (
                          <tr key={kw.rank}>
                            <td style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{kw.rank}</td>
                            <td style={{ fontWeight: 500, maxWidth: 200 }}>{kw.keyword}</td>
                            <td><IntentBadge intent={kw.intent} /></td>
                            <td><ScoreBar value={kw.relevanceScore} max={1} color="var(--accent4)" /></td>
                            <td><ScoreBar value={kw.opportunityScore} max={100} color="var(--accent3)" /></td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text2)', maxWidth: 250 }}>{kw.whyRelevant}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Overlap Tab */}
              {activeTab === 'overlap' && (
                <div className="card animate-fadeIn">
                  <div className="section-title">Keywords Target + Competitors Both Use</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {report.analysis.overlapKeywords.map((kw, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8,
                        border: '1px solid var(--border)',
                      }}>
                        <span style={{ fontSize: '0.88rem' }}>{kw.keyword}</span>
                        <span style={{
                          background: 'rgba(124,106,247,0.15)', color: 'var(--accent4)',
                          borderRadius: 100, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600,
                        }}>
                          {kw.competitorCount} competitors
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps Tab */}
              {activeTab === 'gaps' && (
                <div className="card animate-fadeIn">
                  <div className="section-title">Gap Opportunities — Competitors Have, You Don't</div>
                  <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 20 }}>
                    These keywords appear in competitor content but not yours — high-value opportunities.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {report.analysis.gapKeywords.map((kw, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8,
                        border: '1px solid rgba(233,69,96,0.15)',
                      }}>
                        <span style={{ fontSize: '0.88rem' }}>{kw.keyword}</span>
                        <span style={{
                          background: 'rgba(233,69,96,0.15)', color: 'var(--accent)',
                          borderRadius: 100, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600,
                        }}>
                          {kw.competitorCount} use this
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Download buttons */}
              {status?.reportUrls && (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
                  <a href={status.reportUrls.json} className="btn btn-secondary">↓ Download report.json</a>
                  <a href={status.reportUrls.pdf} className="btn btn-primary">↓ Download PDF Report</a>
                </div>
              )}
            </div>
          )}

          {/* FEATURES (shown when no job running) */}
          {!status && !loading && (
            <div style={{ maxWidth: 900, margin: '60px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              {[
                { icon: '🕷️', title: 'Smart Crawling', desc: 'Crawls up to 10 pages, respects robots.txt, extracts titles, H1s, H2s, hero copy and body text.' },
                { icon: '🏢', title: 'Competitor Discovery', desc: 'Auto-generates SERP queries from your content, finds top 10 competitors ranked by frequency.' },
                { icon: '⛏️', title: 'Keyword Mining', desc: '100–500 candidate keywords from n-gram extraction, ranked and filtered for business relevance.' },
                { icon: '🤖', title: 'AI Scoring', desc: 'Groq AI scores relevance, opportunity, and intent for each keyword with evidence.' },
                { icon: '⚡', title: 'Gap Analysis', desc: 'Identifies keywords competitors use that you don\'t — your highest-opportunity targets.' },
                { icon: '📊', title: 'PDF + JSON Report', desc: 'Generates structured report.json and a clean PDF with full evidence and scores.' },
              ].map((f, i) => (
                <div className={`card animate-fadeIn delay-${Math.min(i + 1, 5)}`} key={i}
                  style={{ transition: 'transform 0.2s, border-color 0.2s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.borderColor = ''; }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: 12 }}>{f.icon}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 8, fontSize: '0.95rem' }}>{f.title}</div>
                  <div style={{ color: 'var(--text2)', fontSize: '0.85rem', lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          )}
        </main>

        <footer style={{ borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.8rem' }}>
          KeywordSpy MVP · Built with Next.js · Google CSE · Groq · Playwright · Prisma
        </footer>
      </div>
    </div>
  );
}
