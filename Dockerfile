# Cloud Run image for Arbitalis.AI (Express + built Vite frontend).
# Node >= 22.18 runs server.ts directly (native TypeScript type stripping).
FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# GEMINI_API_KEY is injected at runtime by Cloud Run (Secret Manager). It is never baked into the image.
CMD ["node", "server.ts"]
