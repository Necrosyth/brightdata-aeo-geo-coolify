# ─── Build Stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (pg, sharp if used)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including devDependencies needed for build)
RUN npm ci

# Copy all source files
COPY . .

# Build the Next.js app
RUN npm run build

# ─── Production Stage ────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy scheduler worker and startup script
COPY scripts/scheduler-worker.mjs ./scripts/scheduler-worker.mjs
COPY start.sh ./start.sh

# Make start.sh executable
RUN chmod +x start.sh

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3040

ENV PORT=3040
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

# Health check (probes the Next.js server, not the worker)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3040/ || exit 1

# Start both Next.js server and scheduler worker
CMD ["/bin/sh", "start.sh"]
