#  KeywordSpy — Keyword + Competitor Discovery MVP

> AI-powered SEO tool that crawls a website, discovers competitors via SERP data, mines business-relevant keywords, and outputs a structured JSON + PDF report.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend + API | Next.js 14 (App Router) |
| Crawling | Playwright (headless Chromium) |
| Database | PostgreSQL + Prisma |
| SERP | Google Custom Search JSON API (free: 100/day) |
| AI Scoring | Groq API — Llama 3 (free tier) |
| Containerization | Docker + docker-compose |
| PDF | PDFKit |

## Demo video-https://drive.google.com/file/d/1ehxt8uYfzRTfH4Gdous-FZ8082E6xtC5/view?usp=drive_link

---

## Prerequisites

- Docker + Docker Compose
- Google Custom Search API key + Search Engine ID (CX)
- Groq API key (free at console.groq.com)

---

## Quick Start

### 1. Clone + configure

```bash
git clone https://github.com/nandeesh88/keyword-competitor-mvp
cd keyword-competitor-mvp
cp .env.example .env
```

Edit `.env`:
```env
GOOGLE_CSE_API_KEY=your_google_api_key
GOOGLE_CSE_CX=your_search_engine_id
GROQ_API_KEY=your_groq_api_key
```

### 2. Run with Docker

```bash
docker-compose up --build
```

Open http://localhost:3000

### 3. Local development (without Docker)

```bash
# Start Postgres separately
docker-compose up postgres -d

# Install deps
npm install
npx playwright install chromium

# Setup DB
npx prisma db push

# Run dev server
npm run dev
```

---

## How to Get API Keys (Free)

### Google Custom Search API
1. Go to https://console.cloud.google.com → Create project
2. Enable "Custom Search API"
3. Create API key under Credentials
4. Go to https://programmablesearchengine.google.com
5. Create search engine → Enable "Search the entire web"
6. Copy the **Search Engine ID (cx)**

### Groq API
1. Go to https://console.groq.com
2. Sign up (free, no credit card)
3. Create API key

---

## Usage

### Web UI
- Open http://localhost:3000
- Enter a HTTPS URL → click "Run Analysis"
- Watch the progress steps
- View results in tabs: Competitors / Keywords / Overlap / Gaps
- Download report.json or PDF

### REST API

**Start analysis:**
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"targetUrl": "https://notion.so"}'
# Returns: { "jobId": "...", "statusUrl": "/api/status/..." }
```

**Poll status:**
```bash
curl http://localhost:3000/api/status/{jobId}
```

**Download reports:**
```bash
curl http://localhost:3000/api/report/{jobId}?type=json -o report.json
curl http://localhost:3000/api/report/{jobId}?type=pdf -o report.pdf
```

---

## Output Files

Reports are saved to `./reports/`:
- `{jobId}.json` — full structured report
- `{jobId}.pdf` — human-readable PDF

### report.json structure
```json
{
  "targetUrl": "https://...",
  "generatedAt": "...",
  "businessProfile": { "domain": "...", "title": "...", ... },
  "serpQueries": ["notion software", "notion alternatives", ...],
  "competitors": [
    {
      "domain": "competitor.com",
      "classification": "DIRECT",
      "frequency": 6,
      "avgPosition": 2.3,
      "evidence": [{ "query": "...", "position": 2, "url": "...", "title": "..." }]
    }
  ],
  "keywords": {
    "totalCandidates": 342,
    "top50": [
      {
        "rank": 1,
        "keyword": "project management",
        "intent": "COMMERCIAL",
        "relevanceScore": 0.95,
        "opportunityScore": 87,
        "whyRelevant": "Core offering term used across 8 pages",
        "sourceEvidence": { "page": "https://...", "snippet": "..." }
      }
    ]
  },
  "analysis": {
    "overlapKeywords": [{ "keyword": "...", "competitorCount": 4 }],
    "gapKeywords": [{ "keyword": "...", "competitorCount": 3 }]
  }
}
```

---

## What It Does (Step by Step)

1. **Validate** — checks HTTPS, follows redirects (max 5), fails on 4xx/5xx, checks robots.txt
2. **Crawl** — visits up to 10 pages (prioritizes features, pricing, about)
3. **SERP queries** — generates 6–10 queries from your site's title/H1/description
4. **Competitor discovery** — runs queries via Google CSE, extracts domains, filters Wikipedia/Reddit/etc., ranks by frequency
5. **Competitor crawling** — crawls top 5 competitors (3 pages each)
6. **Keyword mining** — n-gram extraction (1–3 word phrases) from all pages, weighted by position (headings > body)
7. **AI scoring** — Groq Llama 3 scores relevance, opportunity, intent for top 100 candidates
8. **Gap/overlap analysis** — compares target keywords vs competitor keywords
9. **Report generation** — saves report.json + PDF to ./reports/

---

## Health Check

```bash
curl http://localhost:3000/api/health
```

---

## Notes

- Google CSE free tier: 100 searches/day (8 queries per analysis = ~12 analyses/day)
- Groq free tier: ~14,400 requests/day (very generous)
- Analysis takes 3–10 minutes depending on site size
- robots.txt is enforced; pages blocked by it are skipped
