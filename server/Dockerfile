# Fable+ API — production image
FROM node:22-bookworm-slim AS base
WORKDIR /app

# better-sqlite3 (a dependency) compiles native bindings; production uses Postgres,
# but the package still installs, so provide build tools.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 8787

# Drop privileges
USER node

CMD ["npx", "tsx", "src/index.ts"]
