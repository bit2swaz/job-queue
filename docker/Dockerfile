# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for compilation)
COPY package*.json ./
RUN npm ci

# Copy source and compile
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Run as non-root user
USER node

WORKDIR /app

# Copy production dependency manifest and install production-only packages
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
