#!/usr/bin/env bash
set -e
BASE=http://localhost:5000
TENANT=tenant-A
curl -s -X POST $BASE/todos -H "x-tenant-id:$TENANT" -H "Content-Type:application/json" -d '{"text":"Walk the dog"}' | jq
curl -s -X POST $BASE/todos -H "x-tenant-id:$TENANT" -H "Content-Type:application/json" -d '{"text":"Walk the big dog"}' | jq
curl -s -X POST $BASE/todos/query -H "x-tenant-id:$TENANT" -H "Content-Type:application/json" -d '{"query":"dog walk"}' | jq
