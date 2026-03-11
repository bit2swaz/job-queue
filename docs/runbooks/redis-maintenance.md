# Runbook: Redis Maintenance

**Audience:** SRE / Infrastructure engineer  
**Last updated:** 2026-03-12  
**Related:** `src/services/redisClient.ts`, [ADR-002](../adr/ADR-002-ioredis-client.md)

---

## Overview

This runbook covers planned Redis maintenance tasks: version upgrades, memory management, persistence configuration, and connection pool tuning.

---

## Pre-maintenance checklist

Before any Redis operation that may cause downtime:

- [ ] Alert the on-call rotation (see [incident-response.md](incident-response.md))
- [ ] Confirm queue depths are low or jobs can tolerate delay:
  ```bash
  curl http://localhost:3000/health | jq '.queues'
  ```
- [ ] Notify consumers that the job system may be degraded
- [ ] Take a Redis snapshot:
  ```bash
  redis-cli BGSAVE
  # Wait for background save to complete:
  redis-cli LASTSAVE
  ```

---

## Redis version upgrade

```bash
# 1. Check current version
redis-cli INFO server | grep redis_version

# 2. Pull new image (Docker)
docker pull redis:7-alpine

# 3. Stop the current Redis container (workers will queue locally and reconnect)
docker compose stop redis

# 4. Start with new image
docker compose up -d redis

# 5. Verify connection
docker compose exec redis redis-cli PING  # → PONG

# 6. Confirm workers reconnect (check logs)
docker compose logs worker --tail=20
```

**Expected behaviour during downtime:**  
ioredis retries connections with exponential backoff. Workers will stall on blocking commands; they will not crash. The API will return `503` from `/health` until Redis is back.

---

## Memory management

### Check current memory usage

```bash
redis-cli INFO memory | grep used_memory_human
redis-cli INFO memory | grep maxmemory
```

### Set a memory limit (if not already set)

Edit `docker-compose.yml` or `redis.conf`:

```yaml
# docker-compose.yml
redis:
  command: redis-server --maxmemory 512mb --maxmemory-policy noeviction
```

`noeviction` is the correct policy for a job queue — Redis will return an error on new writes rather than silently evicting job data.

### Inspect key counts

```bash
# Count BullMQ keys by queue
redis-cli --scan --pattern 'bull:*' | wc -l

# Count by specific queue
redis-cli --scan --pattern 'bull:email:*' | wc -l
```

---

## Persistence configuration

BullMQ jobs are stored in Redis. For production, enable **AOF (Append-Only File)** persistence:

```ini
# redis.conf
appendonly yes
appendfsync everysec
```

For a Docker deployment, mount the config:

```yaml
redis:
  volumes:
    - ./redis.conf:/usr/local/etc/redis/redis.conf
    - redis_data:/data
  command: redis-server /usr/local/etc/redis/redis.conf
```

---

## Flush all jobs (emergency only)

⚠️ **DESTRUCTIVE. Removes all jobs from all queues. Never run on production without explicit approval.**

```bash
# Target only job-queue keys (safer than FLUSHALL)
redis-cli --scan --pattern 'bull:*' | xargs redis-cli DEL

# Nuclear option (clears entire Redis instance — never do this in shared Redis)
# redis-cli FLUSHALL
```

---

## Replication / High Availability

For production HA, switch from standalone Redis to **Redis Sentinel** or **Redis Cluster**:

1. Update `REDIS_URL` to `redis://sentinel-host:26379` (Sentinel) or `redis://cluster-node:7000` (Cluster)
2. Update `getRedisClient()` in `src/services/redisClient.ts` to use `new Redis.Cluster([...nodes])` (see [ADR-002](../adr/ADR-002-ioredis-client.md))
3. No other application code changes are required

---

## Verify Redis health after maintenance

```bash
# API health check (includes Redis ping latency)
curl http://localhost:3000/health | jq .

# Worker reconnection
docker compose logs worker --tail=50 | grep -i "redis\|connect\|error"

# Prometheus metrics (should resume scraping)
curl http://localhost:3000/metrics | grep queue_waiting_jobs
```
