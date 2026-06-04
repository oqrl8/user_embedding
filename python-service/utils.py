# utils.py
import hashlib, math

MODEL_ID = "embed-model-v1"

def compute_embedding(text, model=MODEL_ID):
    h = hashlib.sha256((model + "|" + text).encode("utf-8")).digest()
    vec = [((b / 255) * 2 - 1) for b in h[:16]]
    return vec

def embedding_hash(vec):
    quantized = ",".join(str(int(round(v * 1e6))) for v in vec)
    return hashlib.sha256(quantized.encode("utf-8")).hexdigest()[:32]

def cosine(a, b):
    dot = sum(x*y for x,y in zip(a,b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    return dot / (na * nb + 1e-12)

def embedding_cache_key(tenant_id, model_id, emb_hash):
    return f"embed:{tenant_id}:{model_id}:{emb_hash}"

def tenant_index_key(tenant_id):
    return f"tenant:index:{tenant_id}"
