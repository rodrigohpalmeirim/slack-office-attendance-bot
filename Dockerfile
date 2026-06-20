FROM oven/bun:1-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tsconfig.json ./

# SQLite database lives in a separate volume-mountable directory
RUN mkdir -p /data && chown bun:bun /data

ENV DATABASE_PATH=/data/attendance.db
ENV NODE_ENV=production

# Companion web server port (when web env vars are configured)
EXPOSE 3000

USER bun

CMD ["bun", "src/app.ts"]
