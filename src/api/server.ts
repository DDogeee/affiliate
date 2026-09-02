import express from 'express';
import { loadConfig } from '../config/loader.js';
import { registry } from '../adapters/interfaces.js';
import { WeiboAdapter } from '../adapters/sources/weibo.adapter.js';
import { ShopeeAdapter } from '../adapters/products/shopee.adapter.js';
import { TikTokShopAdapter } from '../adapters/products/tiktok-shop.adapter.js';
import { FacebookAdapter } from '../adapters/publishers/facebook.adapter.js';
import { TikTokAdapter } from '../adapters/publishers/tiktok.adapter.js';
import { pool, initDb } from '../storage/db.js';
import { enqueue } from '../core/pipeline/orchestrator.js';

const app = express();
app.use(express.json());

// register adapters
registry.registerSource(new WeiboAdapter());
registry.registerProduct(new ShopeeAdapter());
registry.registerProduct(new TikTokShopAdapter());
registry.registerPublisher(new FacebookAdapter());
registry.registerPublisher(new TikTokAdapter());

app.get('/health', (_req, res) => res.json({ ok: true, adapters: {
  sources: registry.listSources(), products: registry.listProducts(), publishers: registry.listPublishers()
}}));

app.get('/config/topics', (_req, res) => {
  const cfg = loadConfig();
  res.json(cfg);
});

app.post('/crawl', async (req, res) => {
  const { topic } = req.body as { topic: string };
  const cfg = loadConfig();
  const t = cfg.topics.find(x=> x.id===topic && x.enabled);
  if (!t) return res.status(404).json({ error: 'topic not found or disabled' });
  // respect sources.enabled — pluggable, not hardcoded
  const enabledSources = loadConfig().sources.enabled;
  const sourceName = enabledSources[0] ?? 'weibo';
  const adapter = registry.getSource(sourceName);
  if (!adapter) return res.status(500).json({ error: `source ${sourceName} not registered` });
  const result = await adapter.crawl({ topic: t.id, keywords: t.keywords, limit: 10 });
  for (const p of result.posts) {
    await pool.query(
      `INSERT INTO posts(source_id, source, topic, title, text, video_url, attribution, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'ingested') ON CONFLICT(source_id) DO NOTHING`,
      [p.sourceId, p.source, p.topic, p.title, p.text, p.videoUrl, p.attribution]
    );
    await enqueue('process', { sourceId: p.sourceId, topic: p.topic });
  }
  res.json({ ingested: result.posts.length, hasMore: result.hasMore });
});

app.get('/review', async (req, res) => {
  const status = (req.query.status as string) ?? 'pending';
  // allow pending + needs_review to surface low-confidence items
  const allowed = ['pending','needs_review','approved','rejected'];
  const qStatus = allowed.includes(status) ? status : 'pending';
  const r = await pool.query(`SELECT * FROM review_queue WHERE status=$1 ORDER BY created_at DESC LIMIT 50`, [qStatus]);
  res.json(r.rows);
});

app.post('/review/:id/approve', async (req, res) => {
  const id = req.params.id;
  const { platforms } = req.body as { platforms: string[] };
  const r = await pool.query(`SELECT * FROM review_queue WHERE id=$1`, [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
  const row = r.rows[0];
  for (const plat of platforms ?? loadConfig().publishers.enabled) {
    await enqueue('publish', { sourceId: row.source_id, platform: plat });
  }
  await pool.query(`UPDATE review_queue SET status='approved' WHERE id=$1`, [id]);
  res.json({ ok: true });
});

app.post('/review/:id/reject', async (req,res)=>{
  await pool.query(`UPDATE review_queue SET status='rejected' WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/jobs', async (_req,res)=>{
  const r = await pool.query(`SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 100`);
  res.json(r.rows);
});

const port = Number(process.env.PORT ?? 3000);
initDb().then(()=> app.listen(port, ()=> console.log(`api listening ${port}`)));
export default app;
