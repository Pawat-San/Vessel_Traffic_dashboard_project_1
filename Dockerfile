# Multi-stage build base
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Final production build stage
FROM base AS production
COPY src/ ./src/
COPY public/ ./public/
COPY docs/ ./docs/
RUN mkdir -p ./data ./logs
EXPOSE 3000

# Endpoint status monitor
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
