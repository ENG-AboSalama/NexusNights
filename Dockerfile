# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci --omit=dev && \
    cd server && npm ci --omit=dev && \
    cd ../client && npm ci

# Copy source code
COPY server/ ./server/
COPY client/ ./client/

# Build client
WORKDIR /app/client
RUN npm run build

# Build server
WORKDIR /app/server
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    ffprobe \
    wget \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built artifacts
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/server/package.json ./server/
COPY --from=builder --chown=nodejs:nodejs /app/client/dist ./client/dist

# Create data directories
RUN mkdir -p /app/data /app/media && \
    chown -R nodejs:nodejs /app/data

# Set Chromium path for Playwright
ENV CHROME_BIN=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server/dist/index.js"]
