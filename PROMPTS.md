# PROMPTS.md — AI Prompts Used in This Project

> This file documents all major prompts used during development, as required by the assignment.
> Tool used: **Claude (claude.ai)** for full-stack code generation.

---

## Prompt 1 — Project Architecture

**Used for:** Designing the overall system architecture, tech stack decisions, and file structure.

**Tool:** Claude

**Prompt:**
```
I need to build a Keyword + Competitor Discovery MVP with this spec:
- Next.js App Router
- Playwright for crawling
- PostgreSQL + Prisma
- Google Custom Search API (free tier)
- Groq API for AI scoring (free tier)
- Takes a HTTPS URL, crawls up to 10 pages, discovers competitors via SERP,
  extracts 100-500 keywords, scores top 50, shows gap/overlap analysis
- Outputs report.json + PDF

Design the full project structure and key modules needed.
```

---

## Prompt 2 — Prisma Schema

**Used for:** Database schema design for jobs, pages, competitors, keywords, reports.

**Tool:** Claude

**Prompt:**
```
Design a Prisma schema for a keyword/competitor analysis tool with these models:
- AnalysisJob (id, targetUrl, status, errorMessage, timestamps)
- CrawledPage (jobId, url, title, description, h1, h2s, heroCopy, bodyText, isTarget, domain)
- Competitor (jobId, domain, frequency, avgPosition, classification, similarityScore, evidence JSON)
- Keyword (jobId, keyword, intent, whyRelevant, sourceEvidence, relevanceScore, opportunityScore, 
  opportunityNote, isOverlap, isGap, competitorCount, rank)
- Report (jobId, jsonPath, pdfPath, summary)
Using PostgreSQL.
```

---

## Prompt 3 — Playwright Crawler

**Used for:** Building the site crawler that respects robots.txt and prioritizes key pages.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript Playwright crawler that:
1. Accepts a start URL and max pages (default 10)
2. Extracts: title, meta description, H1, top H2s, hero copy (first significant paragraph), body text
3. Follows internal links, prioritizing pages with keywords: features, pricing, about, solutions
4. Checks robots.txt before visiting each page using robots-parser
5. Returns array of CrawledPageData objects
6. Uses headless Chromium, works inside Docker
```

---

## Prompt 4 — SERP Competitor Discovery

**Used for:** Building the Google Custom Search integration and competitor ranking logic.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript module for competitor discovery:
1. Generate 6-10 SERP queries from a site's title, H1, description, domain
   (e.g. "{service} software", "{service} alternatives", "best {service}")
2. Search Google Custom Search API for each query (axios GET)
3. Extract domains from results, filter out: wikipedia, reddit, youtube, facebook, 
   twitter, linkedin, amazon, g2, capterra, medium, github, stackoverflow, etc.
4. Rank remaining domains by frequency across queries, avg position as tiebreaker
5. Return top 10 with evidence: [{query, position, url, title}]
```

---

## Prompt 5 — Keyword Extraction (N-gram Mining)

**Used for:** Extracting candidate keywords from crawled pages using NLP techniques.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript keyword extractor using n-gram mining:
1. Extract 1-gram, 2-gram, 3-gram phrases from page content
2. Apply stopword filtering for single words
3. Give 3x weight to keywords from title/H1/H2/description vs body text
4. Count frequency and track source pages
5. Filter noise: single words need freq > 2, bigrams need freq > 1
6. Return up to 500 candidates sorted by frequency
7. No paid NLP libraries — just string manipulation
```

---

## Prompt 6 — Groq AI Keyword Scoring

**Used for:** Scoring keyword relevance and opportunity using Llama 3 via Groq API.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript function that uses Groq API (llama3-8b-8192) to score keywords:
Input: array of raw keywords + business context string + target domain
For each keyword, score:
- relevanceScore (0-1): how relevant to the business
- opportunityScore (0-100): SEO opportunity estimate
- whyRelevant: 1-line explanation
- opportunityNote: brief reason for score

Send in batches of 25 keywords. Prompt the model to return only valid JSON array.
Fallback to heuristic scoring if Groq fails.
Also detect intent: INFO/COMMERCIAL/TRANSACTIONAL/COMPARISON using keyword heuristics.
```

---

## Prompt 7 — Competitor Classification

**Used for:** Classifying each competitor as DIRECT/ADJACENT/PUBLISHER/MARKETPLACE/OTHER.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript function using Groq API to classify a competitor domain as:
DIRECT - same product, same audience
ADJACENT - related space, overlapping audience  
PUBLISHER - media/blog/review site
MARKETPLACE - marketplace or directory
OTHER - unrelated

Input: competitor domain, target business context, sample competitor keywords.
Return only the classification word. Temperature 0 for determinism.
```

---

## Prompt 8 — Gap + Overlap Analysis

**Used for:** Computing keyword overlap and gaps between target and competitors.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript function for gap/overlap analysis:
Input: 
- targetKeywords: string[] (all keywords found on target site)
- competitorKeywordMap: Map<domain, keywords[]>

Compute:
- overlapKeywords: keywords both target AND competitors use, ranked by competitor count, top 30
- gapKeywords: keywords competitors use but target DOESN'T, ranked by competitor count, top 30

Return both arrays with keyword + competitorCount.
```

---

## Prompt 9 — PDF Report Generation

**Used for:** Generating a structured PDF report using PDFKit.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript PDF generator using PDFKit that creates a report with:
1. Cover page with title, target URL, date
2. Business Profile section
3. Top Competitors table with evidence
4. Top 50 Keywords with scores and evidence
5. Overlap keywords list
6. Gap opportunities list
Use a dark professional color scheme: primary #1a1a2e, accent #e94560.
Export to a file path. Return a Promise<string>.
```

---

## Prompt 10 — Next.js UI

**Used for:** Building the frontend dashboard with dark aesthetic.

**Tool:** Claude

**Prompt:**
```
Build a Next.js App Router page.tsx with a dark industrial aesthetic UI for a keyword/competitor 
analysis tool. Include:
1. URL input form with validation
2. Animated progress steps while job is running (polling /api/status/{jobId} every 3s)
3. Results dashboard with tabs: Competitors | Keywords | Overlap | Gaps
4. Stat cards showing key metrics
5. Tables with score bars, intent badges, competitor classification badges
6. Download buttons for JSON and PDF reports
7. Feature cards on landing state

Colors: dark bg #0a0a0f, accent red #e94560, green #00d4aa, purple #7c6af7
Fonts: Syne (display), DM Sans (body)
```

---

## Prompt 11 — Main Orchestrator

**Used for:** Building the main analysis pipeline that coordinates all modules.

**Tool:** Claude

**Prompt:**
```
Write a TypeScript analyzer.ts that orchestrates the full pipeline:
1. Update job status to 'running' in Prisma
2. Validate URL
3. Crawl target site (up to 10 pages), save CrawledPage records
4. Generate SERP queries from homepage signals
5. Discover competitors via SERP, crawl top 5 competitors (3 pages each)
6. Classify competitors with Groq, save Competitor records
7. Extract keywords from target pages, score top 100 with Groq
8. Run gap/overlap analysis
9. Save keywords to DB
10. Build reportData object, save as report.json
11. Generate PDF from reportData
12. Save Report record, update job status to 'done'
Handle errors: catch all throws, update job status to 'error' with message.
```

---

## Notes on AI Usage

- All code was generated using AI (Claude) as required by the assignment
- Prompts were iteratively refined based on output quality
- Business logic (competitor filtering rules, intent heuristics, scoring weights) was designed manually and encoded into prompts
- No AI-invented keyword lists are used — all keywords come from actual crawled content
