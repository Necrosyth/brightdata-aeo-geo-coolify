# Implementation Plan - OpenCode Zen & Nvidia NIM Migration with Authentication and Coolify Readiness

This plan outlines the steps to replace OpenRouter with OpenCode Zen & NVIDIA NIM APIs, add support for selected model dropdown options in the settings, enable direct database synchronization to Neon PostgreSQL, add username/password login security, and make the project ready for seamless Coolify deployment.

## User Review Required

> [!IMPORTANT]
> - **Environment Variables change**: We will transition from `OPENROUTER_KEY` to two new optional keys: `OPENCODE_ZEN_API_KEY` (for OpenCode Zen models) and `NVIDIA_API_KEY` (for NVIDIA NIM models).
> - **Auth Environment Variables**: To secure the dashboard, we will add `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD`. They will default to `admin` / `admin` for easy initial setup, but should be customized in production.
> - **Automatic Table Initialization**: When the server boots up or a query is ran, we will automatically run table creation queries (`CREATE TABLE IF NOT EXISTS`) on Neon. This eliminates the need to run manual migrations on Supabase/Neon before deploying to Coolify.

## Proposed Changes

### Configuration & Database

#### [MODIFY] [.env](file:///e:/geo-aeo-tracker/.env)
- Document the new variables: `OPENCODE_ZEN_API_KEY`, `NVIDIA_API_KEY`, `DASHBOARD_USERNAME`, and `DASHBOARD_PASSWORD`.
- Note that `OPENROUTER_KEY` is replaced.

#### [MODIFY] [lib/server/neon.ts](file:///e:/geo-aeo-tracker/lib/server/neon.ts)
- Implement `ensureTablesExist()` to check and create `public.kv_store` and `public.website_data` tables automatically if they do not exist.
- Call `ensureTablesExist()` in the main query execution path to make the app self-initializing and 100% plug-and-play.

#### [MODIFY] [lib/client/cloud-mode.ts](file:///e:/geo-aeo-tracker/lib/client/cloud-mode.ts)
- Update `isCloudAvailable()` to return `true` so cloud-first mode (syncing to Neon DB) is active by default.
- If no database is configured on the server, the `/api/state` endpoint will return 501, which is gracefully handled as a local storage fallback.

### API Routes & LLM Clients

#### [NEW] [lib/server/models-config.ts](file:///e:/geo-aeo-tracker/lib/server/models-config.ts)
- Define the `ModelConfig` type and the list of supported free models for both OpenCode Zen and NVIDIA NIM APIs.

#### [MODIFY] [lib/server/openrouter-sro.ts](file:///e:/geo-aeo-tracker/lib/server/openrouter-sro.ts)
- Replace direct OpenRouter API fetch calls with a unified `callLLM()` helper that supports both OpenCode Zen and NVIDIA NIM APIs based on `selectedModel`.
- Support thinking models such as `nvidia/nemotron-3-ultra-550b-a55b` and `google/gemma-4-31b-it` with their required payload structures (`chat_template_kwargs`, `reasoning_budget`).

#### [MODIFY] [app/api/analyze/route.ts](file:///e:/geo-aeo-tracker/app/api/analyze/route.ts)
- Update validation schema to accept `selectedModel`.
- Call `callLLM()` using the selected model.

#### [MODIFY] [app/api/site-context/route.ts](file:///e:/geo-aeo-tracker/app/api/site-context/route.ts)
- Update validation schema to accept `selectedModel`.
- Call `callLLM()` using the selected model.

#### [MODIFY] [app/api/sro-analyze/route.ts](file:///e:/geo-aeo-tracker/app/api/sro-analyze/route.ts)
- Update validation schema to accept `selectedModel`.
- Pass `selectedModel` into `analyzeSRO()`.

#### [MODIFY] [app/api/bulk-sro/route.ts](file:///e:/geo-aeo-tracker/app/api/bulk-sro/route.ts)
- Update schema to support `selectedModel` and pass it to `analyzeSRO()`.

#### [MODIFY] [app/api/state/route.ts](file:///e:/geo-aeo-tracker/app/api/state/route.ts)
- Fix compilation error: import `isCloudStorageConfigured` from `@/lib/server/cloud-config` instead of non-existent `supabase`.

### Authentication Middleware

#### [NEW] [middleware.ts](file:///e:/geo-aeo-tracker/middleware.ts)
- Implement cookie-based Edge middleware to check for an authenticated token on `/` and `/api/*` endpoints.
- Redirect unauthenticated users to `/login` and authenticated users away from `/login`.

#### [NEW] [app/api/auth/login/route.ts](file:///e:/geo-aeo-tracker/app/api/auth/login/route.ts)
- Handle POST requests with `{ username, password }`, compare credentials with environment variables, and set the encrypted `auth_token` session cookie.

#### [NEW] [app/api/auth/logout/route.ts](file:///e:/geo-aeo-tracker/app/api/auth/logout/route.ts)
- Handle POST requests to delete the `auth_token` cookie.

### Frontend Dashboard & Views

#### [NEW] [app/login/page.tsx](file:///e:/geo-aeo-tracker/app/login/page.tsx)
- Create a stunning login interface using premium design styles: deep navy/indigo dark mode theme gradients, glassmorphism card structure, glowing input fields, micro-interactions, and responsive layout.

#### [MODIFY] [components/dashboard/types.ts](file:///e:/geo-aeo-tracker/components/dashboard/types.ts)
- Add `selectedModel?: string` to `AppState`.

#### [MODIFY] [components/sovereign-dashboard.tsx](file:///e:/geo-aeo-tracker/components/sovereign-dashboard.tsx)
- Remove footer link of "Built by Daniel Shashko".
- Handle `selectedModel` state and pass it to settings and SRO tabs.
- Render the `Logout` button in the header toolbar.

#### [MODIFY] [components/dashboard/tabs/project-settings-tab.tsx](file:///e:/geo-aeo-tracker/components/dashboard/tabs/project-settings-tab.tsx)
- Add model selection dropdown configuration grouped by provider.
- Update description of cloud sync to point to "Neon Database" instead of "Supabase".

#### [MODIFY] [components/dashboard/tabs/sro-analysis-tab.tsx](file:///e:/geo-aeo-tracker/components/dashboard/tabs/sro-analysis-tab.tsx)
- Pass `selectedModel` down from the parent dashboard, and send it in API requests to context and analyze.

#### [MODIFY] [components/dashboard/tabs/documentation-tab.tsx](file:///e:/geo-aeo-tracker/components/dashboard/tabs/documentation-tab.tsx)
- Update documented environment variables to list `OPENCODE_ZEN_API_KEY` and `NVIDIA_API_KEY` instead of `OPENROUTER_KEY`.

## Verification Plan

### Automated Tests
- Validate TypeScript compilation and build: `npm run build`

### Manual Verification
- Test login with valid and invalid credentials.
- Verify redirect from `/` to `/login` when unauthenticated.
- Verify redirect from `/login` to `/` when authenticated.
- Test changing models in settings, running SRO and competitor audit, and ensuring the selected model gets invoked on the server.
- Test database syncing: verify that settings are saved to `public.kv_store` in the Neon DB automatically.
