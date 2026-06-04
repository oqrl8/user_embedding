# Todo Embedding Cache Examples

https://www.ibm.com/think/topics/multi-tenant?utm_source=copilot.com

This repo contains two implementations of a tenant-aware embedding cache for a todo list:
- `node-service` — Node.js + Express + Redis
- `python-service` — Python + Flask + Redis

Each service:
- Computes deterministic embeddings (placeholder function)
- Stores embeddings in Redis with key: `embed:{tenantId}:{modelId}:{embeddingHash}`
- Indexes keys per tenant for targeted invalidation
- Includes endpoints to add, query, update todos and invalidate tenant cache

Requirements
- Docker and docker-compose (recommended) or Node 18+/Python 3.11 and Redis

Quick start
1. `docker-compose up --build`
2. Node service: `http://localhost:3000`
3. Python service: `http://localhost:5000`

See each service folder for run instructions and tests.
docker-compose up --build

cd node-service
bash tests/test_requests.sh

cd python-service
bash tests/test_requests.sh