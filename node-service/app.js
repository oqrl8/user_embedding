// app.js
const express = require('express');
const crypto = require('crypto');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const app = express();
app.use(express.json());

const MODEL_ID = 'embed-model-v1';
const TENANT_HEADER = 'x-tenant-id';
const EMBEDDING_TTL_SECONDS = 60 * 60 * 24;

const todosByTenant = {};

function embeddingHash(vec) {
  const quantized = vec.map(v => Math.round(v * 1e6)).join(',');
  return crypto.createHash('sha256').update(quantized).digest('hex').slice(0, 32);
}

async function computeEmbedding(text, model = MODEL_ID) {
  const hash = crypto.createHash('sha256').update(model + '|' + text).digest();
  const vec = Array.from(hash).slice(0, 16).map(b => (b / 255) * 2 - 1);
  return vec;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function embeddingCacheKey(tenantId, modelId, embHash) {
  return `embed:${tenantId}:${modelId}:${embHash}`;
}

async function cacheEmbedding(tenantId, modelId, embHash, vector) {
  const key = embeddingCacheKey(tenantId, modelId, embHash);
  await redis.set(key, JSON.stringify(vector), 'EX', EMBEDDING_TTL_SECONDS);
}

async function getCachedEmbedding(tenantId, modelId, embHash) {
  const key = embeddingCacheKey(tenantId, modelId, embHash);
  const v = await redis.get(key);
  return v ? JSON.parse(v) : null;
}

function tenantIndexKey(tenantId) {
  return `tenant:index:${tenantId}`;
}
async function indexEmbeddingKeyForTenant(tenantId, key) {
  await redis.sadd(tenantIndexKey(tenantId), key);
}
async function invalidateTenantEmbeddings(tenantId) {
  const idxKey = tenantIndexKey(tenantId);
  const keys = await redis.smembers(idxKey);
  if (keys.length) {
    await redis.del(...keys);
  }
  await redis.del(idxKey);
}

app.post('/todos', async (req, res) => {
  const tenantId = req.header(TENANT_HEADER) || 'demo-tenant';
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const vec = await computeEmbedding(text, MODEL_ID);
  const hash = embeddingHash(vec);
  const id = crypto.randomUUID();
  todosByTenant[tenantId] = todosByTenant[tenantId] || [];
  todosByTenant[tenantId].push({ id, text, embeddingHash: hash });

  await cacheEmbedding(tenantId, MODEL_ID, hash, vec);
  await indexEmbeddingKeyForTenant(tenantId, embeddingCacheKey(tenantId, MODEL_ID, hash));

  res.json({ id, text });
});

app.post('/todos/query', async (req, res) => {
  const tenantId = req.header(TENANT_HEADER) || 'demo-tenant';
  const { query, topK = 5 } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  const qVec = await computeEmbedding(query, MODEL_ID);
  const qHash = embeddingHash(qVec);

  const cached = await getCachedEmbedding(tenantId, MODEL_ID, qHash);
  if (!cached) {
    await cacheEmbedding(tenantId, MODEL_ID, qHash, qVec);
    await indexEmbeddingKeyForTenant(tenantId, embeddingCacheKey(tenantId, MODEL_ID, qHash));
  }

  const todos = todosByTenant[tenantId] || [];
  const scored = [];
  for (const t of todos) {
    let tVec = await getCachedEmbedding(tenantId, MODEL_ID, t.embeddingHash);
    if (!tVec) {
      tVec = await computeEmbedding(t.text, MODEL_ID);
      await cacheEmbedding(tenantId, MODEL_ID, t.embeddingHash, tVec);
      await indexEmbeddingKeyForTenant(tenantId, embeddingCacheKey(tenantId, MODEL_ID, t.embeddingHash));
    }
    const score = cosine(qVec, tVec);
    scored.push({ id: t.id, text: t.text, score });
  }

  scored.sort((a, b) => b.score - a.score);
  res.json({ results: scored.slice(0, topK) });
});

app.put('/todos/:id', async (req, res) => {
  const tenantId = req.header(TENANT_HEADER) || 'demo-tenant';
  const { id } = req.params;
  const { text } = req.body;
  const list = todosByTenant[tenantId] || [];
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  list[idx].text = text;
  const newVec = await computeEmbedding(text, MODEL_ID);
  const newHash = embeddingHash(newVec);
  list[idx].embeddingHash = newHash;

  await cacheEmbedding(tenantId, MODEL_ID, newHash, newVec);
  await indexEmbeddingKeyForTenant(tenantId, embeddingCacheKey(tenantId, MODEL_ID, newHash));

  res.json({ id, text });
});

app.post('/admin/invalidate-tenant', async (req, res) => {
  const tenantId = req.header(TENANT_HEADER) || 'demo-tenant';
  await invalidateTenantEmbeddings(tenantId);
  res.json({ invalidated: tenantId });
});

app.listen(3000, () => console.log('Todo embedding service listening on 3000'));
