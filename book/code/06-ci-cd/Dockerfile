# Stage 1: Build — compile TypeScript (pre-built dist/ copied from host)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
# TypeScript must be pre-compiled on the host: `npm run build` before `docker build`
COPY dist ./dist

# Stage 2: Runtime — copy only compiled output + production deps
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Non-root user for least privilege
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 formforge
USER formforge
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]