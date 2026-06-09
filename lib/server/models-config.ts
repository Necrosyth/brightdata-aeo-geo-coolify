export interface ModelConfig {
  id: string;
  name: string;
  provider: "opencode-zen" | "nvidia";
  description: string;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  // ── NVIDIA NIM ──────────────────────────────────────────
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    name: "Nemotron 3 Ultra 550B",
    provider: "nvidia",
    description: "NVIDIA's flagship thinking model with high reasoning budget",
  },
  {
    id: "google/gemma-4-31b-it",
    name: "Gemma 4 31B IT",
    provider: "nvidia",
    description:
      "Google Gemma 4 served via NVIDIA NIM, strong on instruction following",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1",
    name: "Llama 3.3 Nemotron Super 49B",
    provider: "nvidia",
    description: "Llama 3.3 optimized by NVIDIA for superior reasoning",
  },
  // ── OpenCode Zen (Free models) ──────────────────────────
  {
    id: "deepseek-v4-flash-free",
    name: "DeepSeek V4 Flash Free",
    provider: "opencode-zen",
    description: "Free DeepSeek V4 Flash via OpenCode Zen",
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "opencode-zen",
    description: "Z.AI GLM 5.1 via OpenCode Zen",
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "opencode-zen",
    description: "Moonshot AI Kimi K2.5 via OpenCode Zen",
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "opencode-zen",
    description: "Moonshot AI Kimi K2.6 via OpenCode Zen",
  },
  {
    id: "qwen3.6-plus-free",
    name: "Qwen3.6 Plus Free",
    provider: "opencode-zen",
    description: "Alibaba Qwen 3.6 Plus free tier via OpenCode Zen",
  },
  {
    id: "minimax-m3-free",
    name: "MiniMax M3 Free",
    provider: "opencode-zen",
    description: "MiniMax M3 free tier via OpenCode Zen",
  },
  {
    id: "mimo-v2.5-free",
    name: "MiMo V2.5 Free",
    provider: "opencode-zen",
    description: "Xiaomi MiMo V2.5 free tier via OpenCode Zen",
  },
  {
    id: "nemotron-3-super-free",
    name: "Nemotron 3 Super Free",
    provider: "opencode-zen",
    description: "NVIDIA Nemotron 3 Super free tier via OpenCode Zen",
  },
  {
    id: "nemotron-3-ultra-free",
    name: "Nemotron 3 Ultra Free",
    provider: "opencode-zen",
    description: "NVIDIA Nemotron 3 Ultra free tier via OpenCode Zen",
  },
  {
    id: "big-pickle-stealth",
    name: "Big Pickle Stealth",
    provider: "opencode-zen",
    description: "Big Pickle Stealth model via OpenCode Zen",
  },
];

export function getModelConfig(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

export function isThinkingModel(id: string): boolean {
  return (
    id.includes("nemotron") || id.includes("thinking") || id.includes("stealth")
  );
}
