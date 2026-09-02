# Weibo Affiliate Video Pipeline

Pluggable pipeline: **Weibo (source) → Vietnamese TTS+subs → Shopee/TikTok Shop affiliate → any publisher (Facebook/TikTok)**. Adding a new source/product/publisher = new adapter + config entry, no core change.

## Quick start
```bash
cp .env.example .env
docker-compose up --build -d
npm install
npm run test:contract   # proves extensibility
npm run test:e2e
# API on :3000, worker auto-starts
curl http://localhost:3000/health
curl -X POST http://localhost:3000/crawl -H 'Content-Type: application/json' -d '{"topic":"housing-equipment"}'
```

## Config
`src/config/topics.yaml` defines topics, enabled sources/products/publishers. Example adding kitchenware:
```yaml
topics: [{id: kitchenware, keywords: ["厨房好物"], category: kitchenware, enabled: true}]
```

## Adding a new platform (e.g. Douyin, Lazada, YouTube)
1. Create `src/adapters/sources/douyin.adapter.ts` implementing `SourceAdapter`
2. `registry.registerSource(new DouyinAdapter())` in `src/api/server.ts` + `src/worker.ts`
3. Add `douyin` to `sources.enabled` in `topics.yaml`
4. Contract test proves it: see `tests/contract.test.ts` mock.

Same for `ProductAdapter` / `PublisherAdapter`.

## Pipeline
`crawl` (BullMQ) → `process` (download→Whisper STT→translate→edge-tts→FFmpeg+subs) → `match` (keyword+embedding) → `review_queue` (human approve) → `publish` (rate-limit aware)

Idempotency: `jobId = hash(sourceId:stage:configVersion)`.
