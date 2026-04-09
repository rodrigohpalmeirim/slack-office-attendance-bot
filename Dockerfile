FROM oven/bun:1-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# SQLite database lives in a separate volume-mountable directory
RUN mkdir -p /data && chown bun:bun /data

ENV DATABASE_PATH=/data/attendance.db

USER bun

CMD ["bun", "src/app.ts"]
