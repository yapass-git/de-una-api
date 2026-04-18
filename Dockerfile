# Multi-stage build so the runtime image ships only production deps
# and the compiled JS — no TypeScript, no source maps, no tsx.

FROM node:22-alpine AS build
WORKDIR /app

# `npm ci` is faster and more reproducible than `npm install` when a
# lockfile is present. The lockfile is generated the first time you
# run `npm install` locally and should be committed to the repo.
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime image ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/server.js"]
