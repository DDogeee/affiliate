# Affiliate Dashboard

Solo affiliate loop — Weibo → Vietnamese Reels (voice + burned subs) → Shopee affiliate → FB Reels + TikTok.

## 30-min handoff

1. Prerequisites: Node 22, FFmpeg 9.0.1 on PATH (`ffmpeg -version`), Git
2. Env: `cp .env.example .env.local` and fill `DATABASE_URL="file:./dev.db"` + FB/TikTok/Shopee tokens
3. Install: `npm install`
4. DB: `npx prisma migrate dev --name init && npx prisma generate`
5. Dev: `npm run dev` → http://localhost:3000
6. Paste a Weibo URL → queue shows `queued` → `POST /api/jobs/:id/fetch` → `fetched` → continue pipeline per stories

## Project structure

`src/adapters/*` (Source/Destination/Affiliate), `src/workers/pipeline/*`, `src/app/api/jobs/*`, `src/lib/db|validators|storage`, `storage/source|rendered/` gitignored.

## Deploy (OCI)

`next.config.ts` has `output: 'standalone'`. Build: `npx prisma generate && npm run build`. Docker: `docker build -t affiliate . && docker run -p 3000:3000 -v aff_storage:/app/storage --env-file .env affiliate`
