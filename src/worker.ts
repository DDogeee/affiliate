import { createWorker, enqueue } from './core/pipeline/orchestrator.js';
import { processVideo } from './core/video/processor.js';
import { matchProducts } from './core/matching/product-matcher.js';
import { registry } from './adapters/interfaces.js';
import { WeiboAdapter } from './adapters/sources/weibo.adapter.js';
import { ShopeeAdapter } from './adapters/products/shopee.adapter.js';
import { TikTokShopAdapter } from './adapters/products/tiktok-shop.adapter.js';
import { FacebookAdapter } from './adapters/publishers/facebook.adapter.js';
import { TikTokAdapter } from './adapters/publishers/tiktok.adapter.js';
import { loadConfig } from './config/loader.js';
import { pool, initDb } from './storage/db.js';
import path from 'path';

registry.registerSource(new WeiboAdapter());
registry.registerProduct(new ShopeeAdapter());
registry.registerProduct(new TikTokShopAdapter());
registry.registerPublisher(new FacebookAdapter());
registry.registerPublisher(new TikTokAdapter());

await initDb();

createWorker('process', async (data) => {
  const { sourceId } = data;
  if (!sourceId) throw new Error('missing sourceId');
  const r = await pool.query(`SELECT * FROM posts WHERE source_id=$1`, [sourceId]);
  const post = r.rows[0];
  if (!post || !post.video_url) throw new Error('post or video not found');
  const outDir = path.join('storage', 'derived', sourceId);
  const result = await processVideo({ inputVideo: post.video_url, outputDir: outDir, attribution: post.attribution });
  // confidence gate — distinguish low-confidence for review
  const needsReview = result.confidence < 0.6;
  await pool.query(`INSERT INTO review_queue(source_id, output_video, srt_path, transcript_vi, products, status)
    VALUES($1,$2,$3,$4,'[]',$5)`, [sourceId, result.outputVideo, result.srtPath, result.transcriptVi, needsReview ? 'needs_review' : 'pending']);
  await enqueue('match', { sourceId });
  console.log(`[process] ${sourceId} confidence=${result.confidence} ${needsReview?'flagged':''}`);
});

createWorker('match', async (data) => {
  const cfg = loadConfig();
  const { sourceId } = data;
  const postR = await pool.query(`SELECT * FROM posts WHERE source_id=$1`, [sourceId]);
  const revR = await pool.query(`SELECT * FROM review_queue WHERE source_id=$1 ORDER BY id DESC LIMIT 1`, [sourceId]);
  const post = postR.rows[0];
  const rev = revR.rows[0];
  if (!post || !rev) throw new Error('post/review not found');
  const topicCfg = cfg.topics.find(t=> t.id===post.topic);
  const adapters = cfg.products.enabled.map(n=> registry.getProduct(n)!).filter(Boolean);
  const products = await matchProducts(rev.transcript_vi ?? post.text, post.topic, adapters, {
    category: post.topic, keywords: topicCfg?.keywords ?? [], threshold: cfg.products.matching.threshold
  }, cfg.products.matching.limit);
  await pool.query(`UPDATE review_queue SET products=$1 WHERE id=$2`, [JSON.stringify(products), rev.id]);
  console.log(`[match] ${sourceId} matched ${products.length}`);
});

createWorker('publish', async (data) => {
  const { sourceId, platform } = data;
  if (!platform) throw new Error('missing platform');
  const revR = await pool.query(`SELECT * FROM review_queue WHERE source_id=$1 AND status='approved' ORDER BY id DESC LIMIT 1`, [sourceId]);
  const rev = revR.rows[0];
  if (!rev) { console.log(`[publish] ${sourceId} not approved, skip`); return; }
  const adapter = registry.getPublisher(platform);
  if (!adapter) throw new Error(`publisher ${platform} not registered`);
  const products = JSON.parse(rev.products ?? '[]') as Array<{ affiliateUrl: string }>;
  const result = await adapter.publish({
    videoPath: rev.output_video,
    caption: rev.transcript_vi ?? '',
    affiliateLinks: products.map(p=> p.affiliateUrl),
  });
  await pool.query(`UPDATE posts SET status='published' WHERE source_id=$1`, [sourceId]);
  console.log(`[publish] ${sourceId} -> ${platform} ${result.url}`);
});

console.log('workers started');
