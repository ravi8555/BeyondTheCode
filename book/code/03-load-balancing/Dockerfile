FROM node:22-alpine
WORKDIR /app

# Runtime-only deps + dev toolchain for the build layer: copy everything,
# install all deps, compile, then prune dev deps so the final image only
# ships production node_modules + compiled dist/.
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --no-fund --no-audit

COPY src ./src
RUN npx tsc && npm prune --omit=dev --no-fund --no-audit

EXPOSE 3001 3002 3003
# Plain Node on built JS - no tsx needed at runtime.
CMD ["node", "dist/server.js"]

