# Relay Web Platform

This workspace contains the web-first Relay platform:

- `apps/client`: Next.js web application
- `apps/api`: Fastify API and persistence layer
- `apps/worker`: BullMQ worker for imports, refresh, and playback resolution
- `packages/contracts`: Zod schemas and shared request/response types
- `packages/provider-sdk`: provider interfaces and adapter utilities
- `packages/providers`: curated provider implementations
- `deploy`: local Docker and Dokploy-oriented deployment files

The initial implementation ships with a `demo` provider so the platform is runnable before the final curated source list is selected.

## Dokploy Deployment

Relay now includes a Dokploy-ready deployment for the `web/` workspace at [`docker-compose.yml`](docker-compose.yml). It runs as a full stack:

- `client`: the Next.js app, served on container port `3009`
- `api`: the Fastify API, served on container port `4000`
- `browser`: the Playwright-backed extraction service on container port `4100`
- `worker`: the BullMQ worker
- `postgres`: the app database
- `redis`: queue and browser cookie-jar storage

The Dokploy-specific container assets live under [`deploy/dokploy/`](deploy/dokploy/). The existing [`deploy/docker-compose.yml`](deploy/docker-compose.yml) remains the local development compose and should not be repurposed for production.

### Required Dokploy variables

Start from [`deploy/dokploy/dokploy.env.example`](deploy/dokploy/dokploy.env.example) and define:

- `NEXT_PUBLIC_API_URL=https://api.example.com`
- `PUBLIC_API_URL=https://api.example.com`
- `CORS_ORIGIN=https://app.example.com`
- `POSTGRES_DB=relay_web`
- `POSTGRES_USER=relay`
- `POSTGRES_PASSWORD=change-me`

`NEXT_PUBLIC_API_URL` is a build-time value for the client image. If the public API domain changes later, rebuild and redeploy the `client` service instead of expecting a runtime env-only change to take effect.

### Dokploy domains

Attach domains in Dokploy's Domains tab instead of hard-coding routing labels in Compose:

- `app.example.com` -> `client` service port `3009`
- `api.example.com` -> `api` service port `4000`

`browser`, `worker`, `postgres`, and `redis` stay private inside the compose network.

### Local Docker validation

From the `web/` directory, validate the same deployment assets locally:

`docker compose --env-file deploy/dokploy/dokploy.env.example config`

`docker compose --env-file deploy/dokploy/dokploy.env.example build`

`docker compose --env-file deploy/dokploy/dokploy.env.example up -d`

Because the Dokploy compose publishes container ports without fixed host bindings, inspect the assigned local host ports with:

`docker compose port client 3009`

`docker compose port api 4000`

Then visit the reported client URL, open `/login`, and use `Bootstrap` to create the first admin account.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the backing services:

```bash
cd deploy
docker compose up postgres redis
```

3. Push the schema:

```bash
npm run db:push -w @relay/api
```

4. Start the apps in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:client
```

5. Open `http://localhost:3000/login` and use `Bootstrap` once to create the first admin account.

The client dev server binds to `0.0.0.0`, so LAN devices can reach it via `http://<your-lan-ip>:3000`.

## What Works

- account bootstrap and login
- provider listing and admin toggles
- catalog search through the built-in `demo` provider
- anime detail and episode listing
- add to library
- watch session creation and progress updates
- history and updates views
- local Docker environment for Postgres and Redis
- worker queues for imports, refresh, and playback-resolution scaffolding

## What Is Scaffolded

- AniList and MAL OAuth flow
- Android backup parsing and import normalization
- stream proxying beyond a direct redirect
- real curated providers beyond the built-in `demo` adapter

The code structure is ready for those additions without changing the shared contracts or the route surface.
