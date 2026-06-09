/**
 * Server-side scoring utilities for visibility analysis, sentiment detection,
 * and brand/competitor mention extraction.
 *
 * Ported from the client-side dashboard functions so the cron runner
 * can produce identical results without a browser.
 */

export function getBrandTerms(brand: {
  brandName?: string;
  brandAliases?: string;
}): string[] {
  const terms: string[] = [];
  if (brand.brandName?.trim()) terms.push(brand.brandName.trim());
  if (brand.brandAliases?.trim()) {
    brand.brandAliases.split(",").forEach((a) => {
      const t = a.trim();
      if (t) terms.push(t);
    });
  }
  return terms;
}

export function getCompetitorTerms(
  competitors: { name: string; aliases: string[] }[],
): string[] {
  return competitors.flatMap((c) => [c.name, ...c.aliases]).filter(Boolean);
}

/** Find which terms appear in text (case-insensitive) */
export function findMentions(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}

/** Detect basic sentiment toward brand in answer */
export function detectSentiment(
  answer: string,
  brandTerms: string[],
): "positive" | "neutral" | "negative" | "not-mentioned" {
  if (brandTerms.length === 0) return "not-mentioned";
  const lower = answer.toLowerCase();
  const mentioned = brandTerms.some((t) => lower.includes(t.toLowerCase()));
  if (!mentioned) return "not-mentioned";

  const positiveWords = [
    "best", "leading", "top", "excellent", "recommend", "great",
    "outstanding", "innovative", "trusted", "powerful", "superior",
    "preferred", "popular", "reliable", "impressive", "standout",
    "strong", "ideal",
  ];
  const negativeWords = [
    "worst", "poor", "bad", "avoid", "lacking", "weak", "inferior",
    "disappointing", "overpriced", "limited", "outdated", "risky",
    "problematic", "concern", "drawback", "downside",
  ];

  let posScore = 0;
  let negScore = 0;
  positiveWords.forEach((w) => { if (lower.includes(w)) posScore++; });
  negativeWords.forEach((w) => { if (lower.includes(w)) negScore++; });

  if (posScore > negScore + 1) return "positive";
  if (negScore > posScore + 1) return "negative";
  return "neutral";
}

/** Calculate 0-100 visibility score */
export function calcVisibilityScore(
  answer: string,
  sources: string[],
  brandTerms: string[],
  websiteDomains: string[],
): number {
  if (brandTerms.length === 0) return 0;
  const lower = answer.toLowerCase();
  let score = 0;

  // Brand mentioned at all? +30
  const mentioned = brandTerms.some((t) => lower.includes(t.toLowerCase()));
  if (!mentioned) return 0;
  score += 30;

  // Mentioned in first 200 chars (prominent position)? +20
  const first200 = lower.slice(0, 200);
  if (brandTerms.some((t) => first200.includes(t.toLowerCase()))) score += 20;

  // Multiple mentions? +15
  const mentionCount = brandTerms.reduce((acc, t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    return acc + (lower.match(re)?.length ?? 0);
  }, 0);
  if (mentionCount >= 3) score += 15;
  else if (mentionCount >= 2) score += 8;

  // Brand website in sources? +20
  if (
    websiteDomains.length > 0 &&
    sources.some((s) => {
      const sl = s.toLowerCase();
      return websiteDomains.some((d) => sl.includes(d));
    })
  ) {
    score += 20;
  }

  // Positive sentiment bonus +15
  const sent = detectSentiment(answer, brandTerms);
  if (sent === "positive") score += 15;
  else if (sent === "neutral") score += 5;

  return Math.min(100, score);
}

/** Detect drift between new runs and existing runs */
export function detectDrift(
  newRuns: { prompt: string; provider: string; visibilityScore?: number }[],
  existingRuns: { prompt: string; provider: string; visibilityScore?: number }[],
): {
  id: string;
  prompt: string;
  provider: string;
  oldScore: number;
  newScore: number;
  delta: number;
  createdAt: string;
  dismissed: boolean;
}[] {
  const DRIFT_THRESHOLD = 10;
  const alerts: ReturnType<typeof detectDrift> = [];

  newRuns.forEach((newRun) => {
    const prev = existingRuns.find(
      (r) => r.prompt === newRun.prompt && r.provider === newRun.provider,
    );
    if (!prev) return;
    const delta = (newRun.visibilityScore ?? 0) - (prev.visibilityScore ?? 0);
    if (Math.abs(delta) >= DRIFT_THRESHOLD) {
      alerts.push({
        id: `drift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        prompt: newRun.prompt,
        provider: newRun.provider,
        oldScore: prev.visibilityScore ?? 0,
        newScore: newRun.visibilityScore ?? 0,
        delta,
        createdAt: new Date().toISOString(),
        dismissed: false,
      });
    }
  });

  return alerts;
}
