#!/usr/bin/env bash
set -e
BASE=http://localhost:3000
TENANT=tenant-A
curl -s -X POST $BASE/todos -H "x-tenant-id:$TENANT" -H "Content-Type:application/json" -d '{"text":"Buy milk"}' | jq
curl -s -X POST $BASE/todos -H "x-tenant-id:$TENANT" -H "Content-Type:application/json" -d '{"text":"Buy almond milk"}' | jq
curl -s -X POST $BASE/todos/query -H "x-tenant-id:$TENANT" -H "Content-Type:application/json" -d '{"query":"milk"}' | jq
