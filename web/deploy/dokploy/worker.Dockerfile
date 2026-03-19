FROM node:22-bookworm-slim

WORKDIR /app

COPY . /app

RUN npm ci
RUN npm run build -w @relay/worker

CMD ["node", "apps/worker/dist/apps/worker/src/index.js"]
