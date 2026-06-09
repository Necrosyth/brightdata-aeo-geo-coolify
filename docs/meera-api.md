# Meera API — External Agent Integration

Base URL: `https://your-domain.com/api/meera`

All endpoints are **read-only GET** requests. Data is served from the Neon PostgreSQL database. If cloud storage is not configured, endpoints return `501`.

---

## Authentication

The `/api/meera` endpoints respect the dashboard authentication. If `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` are configured, you must include the session cookie from a logged-in dashboard session.

For agent-to-agent integration, pass the workspace cookie or use the `workspace` query parameter.

---

## Endpoints

### 1. `GET /api/meera/summary`

Compact snapshot of brand visibility — designed for quick ingestion by external agents.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace` | string | `default` | Workspace ID for multi-brand setups |

**Response**

```json
{
  "workspace": "default",
  "brand": {
    "name": "Your Brand",
    "industry": "SaaS",
    "websites": ["https://example.com"],
    "description": "Brand description"
  },
  "visibility": {
    "overallScore": 72,
    "providerScores": {
      "chatgpt": 81,
      "perplexity": 65,
      "gemini": 70,
      "copilot": 78,
      "google_ai": 68,
      "grok": 72
    },
    "totalRuns": 48,
    "activeDriftAlerts": 2
  },
  "audit": {
    "url": "https://example.com",
    "score": 64
  },
  "lastUpdated": "2026-02-14T09:00:00.000Z"
}
```

---

### 2. `GET /api/meera/analytics`

Full visibility analytics data — all scrape runs, scores, drift alerts, and competitor battlecards.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace` | string | `default` | Workspace ID for multi-brand setups |

**Response**

```json
{
  "workspace": "default",
  "brand": { ... },
  "summary": {
    "totalRuns": 48,
    "totalDriftAlerts": 2,
    "overallAvgScore": 68,
    "providerAverages": {
      "chatgpt": 74,
      "perplexity": 62
    }
  },
  "latestRuns": {
    "chatgpt": {
      "provider": "chatgpt",
      "prompt": "What are the best AI visibility tracking tools?",
      "visibilityScore": 81,
      "sentiment": "positive",
      "brandMentions": ["Your Brand"],
      "competitorMentions": ["Competitor A", "Competitor B"],
      "createdAt": "2026-02-14T09:00:00.000Z"
    }
  },
  "runs": [
    {
      "provider": "chatgpt",
      "prompt": "...",
      "visibilityScore": 81,
      "sentiment": "positive",
      "brandMentions": [],
      "competitorMentions": [],
      "createdAt": "2026-02-14T09:00:00.000Z"
    }
  ],
  "driftAlerts": [
    {
      "id": "drift-1",
      "prompt": "...",
      "provider": "chatgpt",
      "oldScore": 62,
      "newScore": 81,
      "delta": 19,
      "createdAt": "2026-02-13T08:00:00.000Z",
      "dismissed": false
    }
  ],
  "battlecards": [
    {
      "competitor": "Competitor A",
      "sentiment": "neutral",
      "summary": "Competitor summary text"
    }
  ]
}
```

---

### 3. `GET /api/meera/aeo`

AEO audit reports and SRO (Search Result Optimization) analysis data.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace` | string | `default` | Workspace ID for multi-brand setups |

**Response**

```json
{
  "workspace": "default",
  "brand": { ... },
  "audit": {
    "url": "https://example.com",
    "report": {
      "url": "https://example.com",
      "score": 64,
      "checks": [
        {
          "id": "llms-txt",
          "label": "llms.txt present",
          "category": "discovery",
          "pass": true,
          "value": "Found",
          "detail": "/llms.txt is accessible"
        }
      ],
      "llmsTxtPresent": true,
      "schemaMentions": 3,
      "blufDensity": 0.42,
      "pass": {
        "llmsTxt": true,
        "schema": true,
        "bluf": false
      }
    }
  },
  "sro": { /* SRO analysis results if available */ },
  "citationOpportunities": [ /* citation gap analysis */ ]
}
```

---

## Error Responses

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `404` | No data found for the given workspace |
| `501` | Cloud storage (Neon) not configured on this deployment |
| `500` | Internal server error |

Error bodies follow this shape:

```json
{
  "error": "No data found for this workspace."
}
```

---

## Integration Example (Python)

```python
import requests

BASE_URL = "https://your-domain.com/api/meera"

# Get summary for your chief of staff agent
summary = requests.get(f"{BASE_URL}/summary", params={"workspace": "default"})
data = summary.json()

print(f"Brand: {data['brand']['name']}")
print(f"Overall Visibility Score: {data['visibility']['overallScore']}")
print(f"Active Drift Alerts: {data['visibility']['activeDriftAlerts']}")
print(f"AEO Audit Score: {data['audit']['score']}")
```

## Integration Example (cURL)

```bash
# Summary
curl "https://your-domain.com/api/meera/summary?workspace=default"

# Analytics
curl "https://your-domain.com/api/meera/analytics?workspace=default"

# AEO + SRO
curl "https://your-domain.com/api/meera/aeo?workspace=default"
```
