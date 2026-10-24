FROM node:22-alpine
WORKDIR /app

# Full install → compile → prune: tsc must exist at build time, but the
# final image ships production node_modules + compiled dist/ only.
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --no-fund --no-audit

COPY src ./src
RUN npx tsc && npm prune --omit=dev --no-fund --no-audit

EXPOSE 3001
# Plain Node on built JS - no tsx needed at runtime.
CMD ["node", "dist/server.js"]
