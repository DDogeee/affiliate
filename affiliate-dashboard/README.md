# Affiliate Dashboard

Solo affiliate loop — Weibo → Vietnamese Reels (voice + burned subs) → Shopee affiliate → FB Reels + TikTok.

## 30-min handoff

1. Prerequisites: Node 22, **FFmpeg 9.0.1** on PATH (`ffmpeg -version` must show 9.0.1), **yt-dlp** on PATH (`yt-dlp --version`), Git
   - Windows: `winget install Gyan.FFmpeg` + `pip install yt-dlp` (ensure `D:\miniconda\Scripts` on PATH, restart shell after winget)
   - Verify: `ffmpeg -version` and `yt-dlp --version` before dev — missing yt-dlp causes `WEIBO_FETCH_BLOCKED: spawn yt-dlp ENOENT`
2. Env: `cp .env.example .env.local && cp .env.example .env` and ensure `DATABASE_URL=postgresql://affiliate:affiliate@postgres:5432/affiliate` **unquoted** (Prisma 7 `env()` fails on quoted) + `LOG_LEVEL=info` + `WORKER_URL=http://worker:3001` + FB/TikTok/Shopee tokens. For local dev without Docker, you can use `DATABASE_URL=postgresql://affiliate:affiliate@localhost:5432/affiliate` or fallback `file:./dev.db` with sqlite (switch provider).
3. Install: `npm install`
4. DB: `npx prisma migrate dev --name postgres_init && npx prisma generate` — if `Cannot resolve DATABASE_URL`, run `$env:DATABASE_URL="postgresql://affiliate:affiliate@postgres:5432/affiliate"` in this shell first. Postgres must be running (`docker compose up postgres -d`).
5. Dev: `npm run dev -- --port 3000 --hostname 0.0.0.0` → http://localhost:3000 (restart after ffmpeg/yt-dlp install to pick up new PATH)
6. Paste a Weibo URL → queue shows `queued` → `POST /api/jobs/:id/fetch` → `fetched` → `Localize → Needs Review` → preview plays. Logs are JSON: `docker compose logs -f | grep jobId`.

## Project structure

`src/adapters/*` (Source/Destination/Affiliate), `src/workers/pipeline/*`, `src/app/api/jobs/*`, `src/lib/db|validators|storage|logger`, `storage/source|rendered/` gitignored. `src/lib/logger.ts` is pino JSON with `jobLogger(jobId,stage)`.

## Docker Compose (microservices)

`docker-compose.yml` defines `api` (Next on :3000), `worker` (pipeline on :3001, `src/workers/run.ts` via tsx), a one-shot `migrate` service (runs `prisma migrate deploy` before api/worker start), and `postgres:16`. Both `api`+`worker` mount `aff_storage:/app/storage` and share Postgres.

```bash
docker compose up --build -d
docker compose ps                    # migrate exits 0; api, worker, postgres healthy
curl http://localhost:3000/api/jobs  # 200
docker compose logs -f | grep jobId  # JSON logs with level,msg,jobId,stage,durationMs
docker compose logs --tail 50 worker | grep fetch
docker exec -it $(docker compose ps -q postgres) psql -U affiliate -c "\dt"  # jobs table
LOG_LEVEL=debug docker compose up    # shows ffmpeg time= progress
docker compose down -v
```

Local dev without full compose: run `docker compose up postgres -d` then two processes
- `npx tsx src/workers/run.ts` (worker, WORKER_URL=http://localhost:3001) 
- `npm run dev -- --port 3000 --hostname 0.0.0.0` (api)

Standalone build: `npx prisma generate && npm run build` (`next.config.ts` `output: 'standalone'`). Worker/API share Postgres via `DATABASE_URL`; there is no SQLite anymore (`prisma/migrations/` has only the `postgres_init` migration).

## Logging

Every log line is JSON to stdout: `{"level":"info","msg":"...","jobId":"...","stage":"fetch","durationMs":4100}`. Use `LOG_LEVEL=debug` for `ffmpeg time=` progress. Never logs secrets, never throws. Filter: `docker compose logs -f api worker | grep <jobId>`.

## Deploy (OCI)

`next.config.ts` has `output: 'standalone'`. Build: `npx prisma generate && npm run build`. Docker: `docker build -f Dockerfile.api -t affiliate-api .` + `docker build -f Dockerfile.worker -t affiliate-worker .`
