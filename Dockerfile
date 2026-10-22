# Multi-stage build base
FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Final production build stage
FROM base AS production
COPY knexfile.js ./
COPY src/ ./src/
COPY public/ ./public/
COPY docs/ ./docs/
RUN mkdir -p ./data ./logs && chown -R node:node /app
EXPOSE 3000

# Run as the non-root `node` user already provided by the base image
USER node

# Endpoint status monitor
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
