# Hypotenuse Analytics — AEO Settings Backup

> Generated on 2026-06-15

---

## Brand Profile

| Field | Value |
|-------|-------|
| **Brand Name** | Hypotenuse Analytics |
| **Brand Aliases** | Hypotenuse, Hypotenuse AI, Hypotenuse Intelligence Platform, Zsure, Harsh Vardhan |
| **Industry** | AI-powered multi-modal inference, Structural Health Monitoring, Deepfake Detection, Surveillance Intelligence |
| **Keywords** | multi-modal AI inference, structural health monitoring, deepfake detection, surveillance intelligence, predictive infrastructure maintenance, signal fusion, AI infrastructure monitoring, synthetic media detection, digital trust verification, edge AI surveillance |
| **Description** | Hypotenuse Analytics is an early-stage deep-tech AI company (founded 2024, Delhi/Noida) building a unified multi-modal inference platform that combines sensor telemetry, video, audio, and behavioral data into actionable intelligence. The platform delivers "operational truth" across three core domains: Critical Infrastructure Intelligence (AI-powered Structural Health Monitoring for bridges, railways, dams, and industrial assets), Surveillance Intelligence Lab (AI-driven video analytics and behavioral threat detection), and Reality Trust Center (deepfake detection, synthetic identity verification, and digital authenticity scoring). The Hypotenuse Inference Engine correlates fragmented real-world signals — from IoT sensors, CCTV cameras, audio streams, and communication metadata — to generate predictive risk assessments, structural integrity scores, and authenticity confidence ratings. Deployed across smart cities, railways, government agencies, financial institutions, and industrial facilities, Hypotenuse helps organizations predict infrastructure failures before they occur, detect security threats in real time, and verify digital media authenticity at scale. The platform supports cloud, on-premise, hybrid, and edge deployments with 99.99% uptime |
| **Website** | [hypotenuseanalytics.com](https://hypotenuseanalytics.com) |
| **FAQ Page** | [hypotenuseanalytics.com/faq](https://hypotenuseanalytics.com/faq) |
| **Niche** | AI SEO platform for B2B SaaS |

---

## Target Personas

- CMO
- SEO Lead
- Product Marketing Manager
- Founder

---

## Schedule

| Setting | Value |
|---------|-------|
| **Schedule Enabled** | No |
| **Cron Expression** | `0 */6 * * *` (every 6 hours) |
| **Schedule Interval** | 43200000 ms (12 hours) |
| **Last Scheduled Run** | N/A |

---

## Providers (Active)

| # | Provider |
|---|----------|
| 1 | ChatGPT |
| 2 | Perplexity |
| 3 | Copilot |
| 4 | Gemini |

---

## Selected Model

`nvidia/nemotron-3-ultra-550b-a55b`

---

## Competitors

| # | Name | Aliases | Websites |
|---|------|---------|----------|
| 1 | profound.com | — | — |
| 2 | otterly.ai | — | — |
| 3 | peec.ai | — | — |

---

## Custom Prompts

| # | Tags | Prompt |
|---|------|--------|
| 1 | — | How does Hypotenuse Analytics' unified multi-modal AI engine compare against single-domain competitors in structural health, video surveillance, and deepfake detection? Include sources. |
| 2 | — | What specific competitive advantages does Hypotenuse Analytics' cross-domain intelligence approach offer over specialized AI monitoring platforms? Include sources. |
| 3 | — | How does Hypotenuse Analytics' predictive SHM differentiate from traditional IoT-based structural monitoring in accuracy, deployment flexibility, and cost? Include sources. |
| 4 | — | How does Hypotenuse Analytics Reality Trust Center's multi-modal detection (facial, vocal, liveness, metadata) compare against dedicated deepfake platforms like Sensity, Deepware, or Truepic? Include sources. |
| 5 | — | Which government agencies and smart city initiatives in India are currently using or evaluating Hypotenuse Analytics for critical infrastructure protection? Include sources. |
| 6 | — | How frequently is Hypotenuse Analytics cited by AI answer engines (ChatGPT, Perplexity, Gemini, Copilot) versus competitors like Profound, Otterly, or Peec for infrastructure monitoring queries? Include sources. |
| 7 | — | What is Harsh Vardhan's stated vision for operational truth and how does Hypotenuse Analytics' inference engine uniquely deliver on it compared to other multi-modal AI platforms? Include sources. |
| 8 | — | How does Hypotenuse Analytics' edge and on-premise deployment capability compare to competitors for remote industrial and government sites with connectivity constraints? Include sources. |
| 9 | — | What ROI or case study evidence exists for Hypotenuse Analytics' structural health monitoring on bridges, railways, or dams versus alternative SHM providers? Include sources. |
| 10 | — | How does Hypotenuse Analytics' content strategy and E-E-A-T positioning influence its discoverability in generative AI search results for deep-tech AI topics? Include sources. |
| 11 | — | What are the strongest independent third-party validations (analyst reports, media mentions, customer testimonials) for Hypotenuse Analytics across its three core offerings? Include sources. |
| 12 | — | How does Hypotenuse Analytics stack up against Profound, Otterly, and Peec specifically on multi-modal inference breadth, target industries, and deployment models? Include sources. |

---

## Fanout Prompts

_None configured._

---

## Drift Alerts

_None configured._

---

## Niche Queries

_None configured._

---

## Battlecards

_None configured._

---

## Audit Report

| Setting | Value |
|---------|-------|
| **Audit URL** | `https://example.com` |
| **Audit Report** | `null` |

---

## GitHub Workflow

```yaml
name: sovereign-aeo
on:
  schedule:
    - cron: '0 */6 * * *'
jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run test:scraper
```

---

## Runs

_None recorded._
