FROM node:22-bookworm-slim

WORKDIR /app

COPY . /app

RUN npm ci
RUN npm run build -w @relay/api

EXPOSE 4000

CMD ["sh", "-lc", "npm run db:push -w @relay/api && npx tsx apps/api/src/index.ts"]
