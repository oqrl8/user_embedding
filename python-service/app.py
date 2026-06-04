# app.py
from flask import Flask, request, jsonify
import hashlib, json, os
import redis
from utils import compute_embedding, embedding_hash, cosine, embedding_cache_key, tenant_index_key

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
r = redis.from_url(REDIS_URL, decode_responses=True)
app = Flask(__name__)

MODEL_ID = "embed-model-v1"
TENANT_HEADER = "x-tenant-id"
EMBEDDING_TTL_SECONDS = 60 * 60 * 24

todos_by_tenant = {}

def cache_embedding(tenant_id, model_id, emb_hash, vector):
    key = embedding_cache_key(tenant_id, model_id, emb_hash)
    r.set(key, json.dumps(vector), ex=EMBEDDING_TTL_SECONDS)
    r.sadd(tenant_index_key(tenant_id), key)

def get_cached_embedding(tenant_id, model_id, emb_hash):
    key = embedding_cache_key(tenant_id, model_id, emb_hash)
    v = r.get(key)
    return json.loads(v) if v else None

def invalidate_tenant_embeddings(tenant_id):
    idx_key = tenant_index_key(tenant_id)
    keys = r.smembers(idx_key)
    if keys:
        r.delete(*keys)
    r.delete(idx_key)

@app.route("/todos", methods=["POST"])
def add_todo():
    tenant_id = request.headers.get(TENANT_HEADER, "demo-tenant")
    body = request.get_json() or {}
    text = body.get("text")
    if not text:
        return jsonify({"error":"text required"}), 400
    vec = compute_embedding(text, MODEL_ID)
    h = embedding_hash(vec)
    import uuid
    id = str(uuid.uuid4())
    todos_by_tenant.setdefault(tenant_id, []).append({"id":id, "text":text, "embeddingHash":h})
    cache_embedding(tenant_id, MODEL_ID, h, vec)
    return jsonify({"id":id, "text":text})

@app.route("/todos/query", methods=["POST"])
def query_todos():
    tenant_id = request.headers.get(TENANT_HEADER, "demo-tenant")
    body = request.get_json() or {}
    query = body.get("query")
    topK = int(body.get("topK", 5))
    if not query:
        return jsonify({"error":"query required"}), 400
    qvec = compute_embedding(query, MODEL_ID)
    qhash = embedding_hash(qvec)
    if not get_cached_embedding(tenant_id, MODEL_ID, qhash):
        cache_embedding(tenant_id, MODEL_ID, qhash, qvec)
    todos = todos_by_tenant.get(tenant_id, [])
    scored = []
    for t in todos:
        tvec = get_cached_embedding(tenant_id, MODEL_ID, t["embeddingHash"])
        if not tvec:
            tvec = compute_embedding(t["text"], MODEL_ID)
            cache_embedding(tenant_id, MODEL_ID, t["embeddingHash"], tvec)
        score = cosine(qvec, tvec)
        scored.append({"id":t["id"], "text":t["text"], "score":score})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return jsonify({"results": scored[:topK]})

@app.route("/todos/<id>", methods=["PUT"])
def update_todo(id):
    tenant_id = request.headers.get(TENANT_HEADER, "demo-tenant")
    body = request.get_json() or {}
    text = body.get("text")
    list_ = todos_by_tenant.get(tenant_id, [])
    for t in list_:
        if t["id"] == id:
            t["text"] = text
            newvec = compute_embedding(text, MODEL_ID)
            newhash = embedding_hash(newvec)
            t["embeddingHash"] = newhash
            cache_embedding(tenant_id, MODEL_ID, newhash, newvec)
            return jsonify({"id":id, "text":text})
    return jsonify({"error":"not found"}), 404

@app.route("/admin/invalidate-tenant", methods=["POST"])
def admin_invalidate():
    tenant_id = request.headers.get(TENANT_HEADER, "demo-tenant")
    invalidate_tenant_embeddings(tenant_id)
    return jsonify({"invalidated": tenant_id})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
