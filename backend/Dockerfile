FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx tsc

# Create data directory for SQLite fallback
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
