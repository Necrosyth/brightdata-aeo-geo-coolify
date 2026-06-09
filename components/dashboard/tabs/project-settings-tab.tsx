import { useState } from "react";
import type { BrandConfig } from "@/components/dashboard/types";
import { isCloudAvailable } from "@/lib/client/cloud-mode";
import { AVAILABLE_MODELS } from "@/lib/server/models-config";

type ProjectSettingsTabProps = {
  brand: BrandConfig;
  onBrandChange: (patch: Partial<BrandConfig>) => void;
  onReset?: () => void;
  selectedModel?: string;
  onSelectedModelChange?: (model: string) => void;
};

export function ProjectSettingsTab({
  brand,
  onBrandChange,
  onReset,
  selectedModel,
  onSelectedModelChange,
}: ProjectSettingsTabProps) {
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Group models by provider
  const nvidiaModels = AVAILABLE_MODELS.filter((m) => m.provider === "nvidia");
  const opencodeModels = AVAILABLE_MODELS.filter(
    (m) => m.provider === "opencode-zen",
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3 text-base font-semibold text-th-text">
          Brand & Website
        </div>
        <p className="mb-4 text-sm leading-relaxed text-th-text-muted">
          Configure your brand so every prompt, audit, and analysis is
          contextualized for your website. Data is stored locally in your
          browser — or in Neon Database if cloud sync is enabled below.
        </p>
      </div>

      {/* Model Selection */}
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
          Analysis Model
        </label>
        <p className="mb-2 text-sm text-th-text-muted">
          Choose which LLM to use for SRO analysis and site context extraction.
        </p>
        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="bd-input flex w-full items-center justify-between rounded-lg p-2.5 text-sm"
          >
            <span>
              {selectedModel
                ? (AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name ??
                  selectedModel)
                : "Default model (NVIDIA Llama 3.3 Nemotron)"}
            </span>
            <span className="text-th-text-muted">
              {showModelPicker ? "▲" : "▼"}
            </span>
          </button>

          {showModelPicker && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-th-border bg-th-card p-2 shadow-lg max-h-72 overflow-y-auto">
              {/* NVIDIA Models */}
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-th-text-muted">
                NVIDIA NIM
              </div>
              {nvidiaModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelectedModelChange?.(model.id);
                    setShowModelPicker(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    selectedModel === model.id
                      ? "bg-th-accent-soft text-th-text-accent font-medium"
                      : "text-th-text-secondary hover:bg-th-card-hover"
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{model.name}</div>
                    <div className="text-xs text-th-text-muted">
                      {model.description}
                    </div>
                  </div>
                  {selectedModel === model.id && (
                    <span className="text-th-accent">✓</span>
                  )}
                </button>
              ))}

              {/* OpenCode Zen Models */}
              <div className="mt-2 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-th-text-muted">
                OpenCode Zen
              </div>
              {opencodeModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelectedModelChange?.(model.id);
                    setShowModelPicker(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    selectedModel === model.id
                      ? "bg-th-accent-soft text-th-text-accent font-medium"
                      : "text-th-text-secondary hover:bg-th-card-hover"
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{model.name}</div>
                    <div className="text-xs text-th-text-muted">
                      {model.description}
                    </div>
                  </div>
                  {selectedModel === model.id && (
                    <span className="text-th-accent">✓</span>
                  )}
                </button>
              ))}

              {/* Default option */}
              <div className="mt-2 border-t border-th-border pt-2">
                <button
                  onClick={() => {
                    onSelectedModelChange?.("");
                    setShowModelPicker(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    !selectedModel
                      ? "bg-th-accent-soft text-th-text-accent font-medium"
                      : "text-th-text-secondary hover:bg-th-card-hover"
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">Default</div>
                    <div className="text-xs text-th-text-muted">
                      NVIDIA Llama 3.3 Nemotron Super 49B
                    </div>
                  </div>
                  {!selectedModel && <span className="text-th-accent">✓</span>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Field
          label="Brand / Company Name"
          placeholder="Acme Corp"
          value={brand.brandName}
          onChange={(v) => onBrandChange({ brandName: v })}
        />
        <Field
          label="Brand Aliases (comma-separated)"
          placeholder="ACME, Acme Inc, acme.com"
          value={brand.brandAliases}
          onChange={(v) => onBrandChange({ brandAliases: v })}
        />
        <div className="xl:col-span-2">
          <WebsiteListField
            websites={brand.websites}
            onChange={(websites) => onBrandChange({ websites })}
          />
        </div>
        <Field
          label="Industry / Vertical"
          placeholder="B2B SaaS, E-commerce, Healthcare…"
          value={brand.industry}
          onChange={(v) => onBrandChange({ industry: v })}
        />
        <Field
          label="Target Keywords (comma-separated)"
          placeholder="AI analytics, answer engine optimization, GEO tools"
          value={brand.keywords}
          onChange={(v) => onBrandChange({ keywords: v })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
          Brand Description
        </label>
        <textarea
          value={brand.description}
          onChange={(e) => onBrandChange({ description: e.target.value })}
          placeholder="Brief description of your product/service so AI models can assess relevance…"
          className="bd-input h-28 w-full rounded-lg p-2.5 text-sm"
        />
      </div>

      {/* Quick status */}
      <div className="grid gap-2 sm:grid-cols-3">
        <StatusChip label="Brand Name" ok={brand.brandName.trim().length > 0} />
        <StatusChip
          label="Website"
          ok={
            brand.websites.length > 0 &&
            brand.websites.some((w) => w.trim().length > 0)
          }
        />
        <StatusChip label="Keywords" ok={brand.keywords.trim().length > 0} />
      </div>

      <CloudSyncCard />

      {/* Danger zone */}
      {onReset && (
        <div className="rounded-lg border border-th-danger/30 bg-th-danger-soft p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-th-danger">
            Danger Zone
          </div>
          <p className="mb-3 text-sm text-th-danger/70">
            Delete all saved data including runs, prompts, settings, and audit
            results. This cannot be undone.
          </p>
          <button
            onClick={onReset}
            className="rounded-lg border border-th-danger/40 bg-th-danger-soft px-4 py-2 text-sm font-medium text-th-danger hover:bg-th-danger/20"
          >
            Reset All Data
          </button>
        </div>
      )}
    </div>
  );
}

function CloudSyncCard() {
  const available = isCloudAvailable();

  return (
    <div className="rounded-lg border border-th-border bg-th-surface p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-th-text-muted">
        Database
      </div>
      <p className="text-sm leading-relaxed text-th-text-muted">
        {available
          ? "Neon database is connected. All data is stored in PostgreSQL and persists across restarts and redeploys."
          : "Neon database not configured. Set DATABASE_URL in your deployment environment to enable persistence."}
      </p>
      {available && (
        <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Connected
        </span>
      )}
    </div>
  );
}

function WebsiteListField({
  websites,
  onChange,
}: {
  websites: string[];
  onChange: (websites: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addUrl() {
    const url = draft.trim();
    if (!url) return;
    onChange([...websites, url]);
    setDraft("");
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
        Website URLs
      </label>
      {websites.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {websites.map((url, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-th-card-alt border border-th-border px-3 py-1 text-sm text-th-text"
            >
              {url.replace(/^https?:\/\//, "")}
              <button
                onClick={() => onChange(websites.filter((_, j) => j !== i))}
                className="rounded-full p-0.5 hover:bg-th-danger-soft hover:text-th-danger"
                title="Remove"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          placeholder="https://acme.com"
          className="bd-input flex-1 rounded-lg p-2.5 text-sm"
        />
        <button
          onClick={addUrl}
          disabled={!draft.trim()}
          className="rounded-lg bg-th-accent px-4 py-2 text-sm font-medium text-white hover:bg-th-accent-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bd-input w-full rounded-lg p-2.5 text-sm"
      />
    </div>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-th-border bg-th-card-alt px-3 py-2.5">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-th-success" : "bg-th-text-muted"}`}
      />
      <span className="text-sm text-th-text-secondary">{label}</span>
      <span
        className={`ml-auto text-xs font-medium ${ok ? "text-th-success" : "text-th-text-muted"}`}
      >
        {ok ? "Set" : "Missing"}
      </span>
    </div>
  );
}
