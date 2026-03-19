---
created_at: 2026-03-19T00:00:00-04:00
updated_at: 2026-03-19T00:00:00-04:00
status: completed
---
# Relay Web Dokploy Deployment ExecPlan

## Objective

Add a Dokploy-ready production deployment for the `web/` workspace without disturbing the existing local development compose in `web/deploy/docker-compose.yml`.

## Scope

In scope:
- `web/docker-compose.yml`
- `web/.dockerignore`
- `web/deploy/dokploy/*.Dockerfile`
- `web/deploy/dokploy/dokploy.env.example`
- `web/README.md`
- `AGENTS.md`

Out of scope:
- Replacing the current local dev compose
- Converting the client to Next.js standalone output
- Adding a dedicated migration system beyond the existing `drizzle-kit push` flow
- Combining the stack into a single container

## Decisions

1. Use a full stack Dokploy deployment: `client`, `api`, `browser`, `worker`, `postgres`, and `redis`.
2. Keep Postgres and Redis inside the same compose project with named volumes.
3. Publish the web client on container port `3009` and the API on container port `4000`.
4. Keep `browser`, `worker`, `postgres`, and `redis` private to the compose network.
5. Build the client with `NEXT_PUBLIC_API_URL` as a required build argument so Dokploy rebuilds are the source of truth for public API routing.
6. Run `npm run db:push -w @relay/api` before API startup because the repository does not yet ship committed migration files.

## Workstreams

### 1. Deployment assets

- Add a new Dokploy compose file at `web/docker-compose.yml`.
- Add four service Dockerfiles under `web/deploy/dokploy/`.
- Add a Dokploy env example under `web/deploy/dokploy/`.
- Add `web/.dockerignore` so image builds stay scoped to the workspace.

### 2. Documentation

- Document the Dokploy flow in `web/README.md`.
- Record the new deployment entrypoints and the client build-time URL caveat in `AGENTS.md`.

### 3. Validation

- Validate compose rendering with the example env file.
- Build all Dokploy images locally.

## Acceptance Criteria

- `docker compose --env-file deploy/dokploy/dokploy.env.example config` succeeds from `web/`.
- `docker compose --env-file deploy/dokploy/dokploy.env.example build` succeeds from `web/`.
- The client image serves `next start` on port `3009`.
- The API image starts on port `4000` and applies schema changes through `db:push`.
- The browser service responds on `/health` and the worker starts without public networking.
- The local development compose remains unchanged.
