FROM node:22-bookworm-slim

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}"

WORKDIR /app

COPY . /app

RUN npm ci
RUN npm run build -w @relay/client

WORKDIR /app/apps/client

EXPOSE 3009

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3009"]
