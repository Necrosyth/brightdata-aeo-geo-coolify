# GEO/AEO Tracker

AI visibility intelligence dashboard — tracks your brand's presence across 6 AI models (ChatGPT, Perplexity, Gemini, Copilot, Google AI, Grok) with visibility scoring, AEO auditing, SRO analysis, and automated monitoring.

## Features

- **Multi-model tracking** — monitor brand mentions across 6 AI platforms simultaneously
- **Visibility scoring** (0–100) — brand mentions, position, frequency, citations, sentiment
- **AEO Audit** — site readiness checks: llms.txt, Schema.org, BLUF density, heading structure
- **SRO Analysis** — 6-stage deep pipeline with grounding, cross-platform citations, SERP data, page scraping, and LLM recommendations
- **Drift alerts** — automatic notifications when scores change significantly
- **Automated scheduling** — configurable interval-based batch scraping
- **Prompt Hub** — manage tracking prompts with `{brand}` injection
- **Competitor Battlecards** — AI-generated competitor analysis
- **Citation Opportunities** — URLs where competitors are cited but your brand isn't
- **Dark/light/system theme** with responsive mobile layout

## Quick Start

### Prerequisites

- Node.js 18+
- [Bright Data](https://brightdata.com/) API key + AI Scraper dataset IDs
- At least one LLM API key (OpenCode Zen, NVIDIA NIM, or Gemini)

### Deploy with Docker

```bash
docker compose up -d
```

The app will be available at `http://localhost:3040`.

### Environment Variables

Set these in your deployment environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `BRIGHT_DATA_KEY` | Yes | Bright Data API key |
| `BRIGHT_DATA_DATASET_CHATGPT` | Yes | Dataset ID for ChatGPT scaper |
| `BRIGHT_DATA_DATASET_PERPLEXITY` | Yes | Dataset ID for Perplexity scraper |
| `BRIGHT_DATA_DATASET_COPILOT` | Yes | Dataset ID for Copilot scraper |
| `BRIGHT_DATA_DATASET_GEMINI` | Yes | Dataset ID for Gemini scraper |
| `BRIGHT_DATA_DATASET_GOOGLE_AI` | Yes | Dataset ID for Google AI scraper |
| `BRIGHT_DATA_DATASET_GROK` | Yes | Dataset ID for Grok scraper |
| `OPENCODE_ZEN_API_KEY` | No* | LLM analysis via OpenCode Zen |
| `NVIDIA_API_KEY` | No* | LLM analysis via NVIDIA NIM |
| `GEMINI_API_KEY` | No* | Gemini Grounding in SRO pipeline |
| `DATABASE_URL` | No | Neon PostgreSQL connection string (enables cloud persistence) |
| `DASHBOARD_USERNAME` | No | Login username (default: admin) |
| `DASHBOARD_PASSWORD` | No | Login password (default: admin) |
| `AUTH_SECRET` | No | Session secret |

*At least one LLM API key is required for analysis features.

## API Endpoints

The app exposes a set of read-only API endpoints under `/api/meera` for integrating with external agents and tools.

See [`docs/meera-api.md`](docs/meera-api.md) for full documentation.

| Endpoint | Description |
|----------|-------------|
| `GET /api/meera/summary?workspace=default` | Compact brand visibility snapshot |
| `GET /api/meera/analytics?workspace=default` | Full analytics with runs, scores, alerts, battlecards |
| `GET /api/meera/aeo?workspace=default` | AEO audit report and SRO analysis results |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + Turbopack |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Storage | Neon PostgreSQL (server) / IndexedDB (client fallback) |
| AI Scraping | Bright Data Web Scraper API |
| LLM Inference | OpenCode Zen / NVIDIA NIM |
| Containerization | Docker |
