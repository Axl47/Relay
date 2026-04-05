FROM node:22-bookworm-slim

WORKDIR /app

COPY . /app

RUN npm ci
RUN npm run build -w @relay/api

EXPOSE 4000

CMD ["sh", "-lc", "attempt=0; until npm run db:push -w @relay/api; do attempt=$((attempt + 1)); if [ \"$attempt\" -ge 30 ]; then echo 'db:push failed after 30 attempts' >&2; exit 1; fi; echo \"db:push failed, retrying in 2s (attempt $attempt/30)\" >&2; sleep 2; done; exec npx tsx apps/api/src/index.ts"]
