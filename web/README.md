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
