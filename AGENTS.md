# AGENTS.md — affiliate

## Where code lives
- App is `affiliate-dashboard/` — **all npm/prisma/next commands run there, not repo root**. Root has no `package.json`.
- `affiliate-dashboard/src/` boundaries: `adapters/{source,destination,affiliate}`, `workers/pipeline/*`, `app/api/jobs/*`, `lib/{db,validators,storage,queue}`, `components/{queue,review}`, `types/job.ts`.
- Path alias `@/*` → `affiliate-dashboard/src/*` (`tsconfig.json:24`). Use it for imports.

## Prerequisites (local dev — not just Docker)
- Node 22+ (`node -v`), Git, **FFmpeg 9.0.1** on PATH (`ffmpeg -version` must show 9.0.1), **yt-dlp** on PATH (`yt-dlp --version`). `WeiboSourceAdapter` falls back to `yt-dlp --dump-json` for Sina Visitor System pages — `spawn yt-dlp ENOENT` means yt-dlp not installed.
- Windows: `winget install Gyan.FFmpeg` (9.0.1) + `pip install yt-dlp` (needs `D:\miniconda\Scripts` on PATH). Restart shell after `winget` (PATH updated). Verify both before `npm run dev`.
- Without yt-dlp/ffmpeg the fetch will 429 `WEIBO_FETCH_BLOCKED`; pipeline `ffmpeg.ts` currently stubs empty mp4.

## Commands (run from `affiliate-dashboard/`)
```bash
npm install                          # pnpm-lock.yaml exists but scripts use npm
cp .env.example .env.local && cp .env.example .env  # both needed; DATABASE_URL must be unquoted: DATABASE_URL=file:./dev.db (Prisma 7 env() fails on quoted)
# set env for Prisma 7 in this shell if migrate fails: $env:DATABASE_URL="postgresql://affiliate:affiliate@postgres:5432/affiliate"
npx prisma migrate dev --name postgres_init && npx prisma generate  # Postgres; DB at postgres:5432 via docker compose up postgres -d
# two-process local dev:
npx tsx src/workers/run.ts            # worker HTTP server on :3001 (WORKER_URL=http://localhost:3001)
npm run dev -- --turbopack --port 3000 --hostname 0.0.0.0  # api -> proxies pipeline to worker
npm run lint                         # next lint (eslint 9 + eslint-config-next) — may show "Invalid project directory" on Node 26, ignore
npm run build                        # requires prisma generate first
npx prisma generate && npm run build # Docker/standalone order (next.config.ts: output 'standalone')
```
No test runner configured — no `test` script, no vitest/jest config.

## DB — Prisma 7 + Postgres (pg + @prisma/adapter-pg)
- Config: `prisma.config.ts` reads `DATABASE_URL` via `env()` (Prisma 7 style, not `schema.prisma` url) — now `postgresql://affiliate:affiliate@postgres:5432/affiliate` for Docker; local fallback via `pg.Pool`.
- Schema: `prisma/schema.prisma` — single model `Job` (file `affiliate-dashboard/prisma/schema.prisma:9`), `provider = "postgresql"`, JSON fields stored as `JSONB`.
- Singleton in `src/lib/db.ts:6` — uses `@prisma/adapter-pg` + `pg.Pool` + `globalThis` caching for HMR. Both `api` and `worker` share Postgres via `DATABASE_URL`.
- Migration: only `20260904175441_postgres_init/` remains (sqlite migration retired when we moved to Postgres). Fresh envs run `prisma migrate deploy` via compose `migrate` one-shot service (`docker-compose.yml`) or manually.

## Env & storage
- Template: `affiliate-dashboard/.env.example` — `DATABASE_URL=postgresql://affiliate:affiliate@postgres:5432/affiliate`, `FB_PAGE_TOKEN/ID`, `TIKTOK_*`, `SHOPEE_*`, `TTS_KEY/PROVIDER`, `LOG_LEVEL`, `WORKER_URL`.
- Storage: `src/lib/storage.ts:4` — `STORAGE_BASE` env overrides base, else `<cwd>/storage`. Subdirs `source/`, `rendered/`, `tmp/` created by `ensureStorageDirs()`. Paths: `getSourcePath(jobId)`, `getRenderedPath(jobId)`. Both `storage/` and `affiliate-dashboard/storage/` are gitignored plus `prisma/dev.db`. Both `api` + `worker` mount same named volume `aff_storage:/app/storage`.
- Docker: `affiliate-dashboard/Dockerfile.api` + `Dockerfile.worker` split — both `node:22-alpine` + `ffmpeg=9.0.1-r0` on PATH (`ffmpeg -version` must show 9.0.1), `STORAGE_BASE=/app/storage`, standalone build. Worker runs `npx tsx src/workers/run.ts` (reuses shared `@/workers/pipeline/*` + `@/adapters/*` via tsconfig paths), api runs `npm start`. Both images carry `yt-dlp` (api needs it for inline fetch fallback when worker is down). `.dockerignore` excludes `.env*`, storage, logs. `docker-compose.yml` defines `postgres:16` (pg_isready healthcheck, volume `pgdata`), a one-shot `migrate` service (`prisma migrate deploy`, api/worker `depends_on: migrate: service_completed_successfully`), `api` (3000) + `worker` (3001) sharing `aff_storage:/app/storage`; healthchecks use `node -e fetch` (busybox `wget` exits 0 even on HTTP 500). Logs are JSON to stdout — `docker compose logs -f | grep jobId` and `LOG_LEVEL=debug` shows `ffmpeg time=` at debug.
- Logging: `src/lib/logger.ts:1` — pino JSON logger `logger` + `jobLogger(jobId,stage)` with `level,msg,jobId,stage,durationMs`. Never logs secrets, never throws.

## Pipeline & API gotchas
- Job states (`src/types/job.ts:1`): `queued → fetched → processing → needs_review → approved → publishing → published` plus `skipped/failed`. `POST /api/jobs/:id/fetch` only allowed from `queued|failed` (`src/app/api/jobs/[id]/fetch/route.ts:7`).
- Routes: `POST /api/jobs` accepts `{sourceUrl|url}` (validated by `weiboUrlSchema` — hostname must be `weibo.com|.cn`), then `POST /api/jobs/:id/fetch` → `POST /api/jobs/:id/localize` → `POST /api/jobs/:id/render` → `pick-offer` → `approve` → `publish`. `fetch` handles both GET and POST.
- FFmpeg burn is functional when source exists: `subtitles=` filter + optional voice mux, with fallback to source copy — `src/workers/pipeline/ffmpeg.ts:8`. Rendered output re-renders when source/srt/voice mtime is newer than the cached mp4. Don't assume audio track exists (voicePath is stubbed by `tts.ts`).

## Conventions
- TypeScript `strict`, `skipLibCheck`, `ES2017` target, `bundler` resolution.
- Keep edits inside `affiliate-dashboard/`; `src/` at repo root is just `storage/` placeholder.
- BMAD artifacts in `_bmad/` and `_bmad-output/` — read-only planning docs, not code.
