FROM mcr.microsoft.com/playwright:v1.53.2-noble

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY . /app

RUN npm ci
RUN npm run build -w @relay/browser

EXPOSE 4100

CMD ["npx", "tsx", "apps/browser/src/index.ts"]
