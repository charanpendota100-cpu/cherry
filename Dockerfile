FROM node:18-alpine

WORKDIR /app

# Install Chromium dependencies for whatsapp-web.js Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy backend dependencies and install
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy pre-built frontend (build locally first with `npm run build`)
COPY dist/ ./dist/

# Create necessary directories
RUN mkdir -p wa-sessions uploads logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "backend/server.cjs"]
