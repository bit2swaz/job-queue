# runbook: redis maintenance

**audience:** sre / infrastructure engineer
**last updated:** 2026-03-12
**related:** `src/services/redisClient.ts`, [adr-002](../adr/ADR-002-ioredis-client.md)

---

## overview

this runbook covers planned redis maintenance tasks: version upgrades, memory management, persistence configuration, and connection pool tuning.

---

## pre-maintenance checklist

before any redis operation that may cause downtime:

- [ ] alert the on-call rotation (see [incident-response.md](incident-response.md))
- [ ] confirm queue depths are low or jobs can tolerate delay:
  ```bash
  curl http://localhost:3000/health | jq '.queues'
  ```
- [ ] notify consumers that the job system may be degraded
- [ ] take a redis snapshot:
  ```bash
  redis-cli BGSAVE
  # wait for background save to complete:
  redis-cli LASTSAVE
  ```

---

## redis version upgrade

```bash
# 1. check current version
redis-cli INFO server | grep redis_version

# 2. pull new image (docker)
docker pull redis:7-alpine

# 3. stop the current redis container (workers will queue locally and reconnect)
docker compose stop redis

# 4. start with new image
docker compose up -d redis

# 5. verify connection
docker compose exec redis redis-cli PING  # -> PONG

# 6. confirm workers reconnect (check logs)
docker compose logs worker --tail=20
```

**expected behaviour during downtime:**
ioredis retries connections with exponential backoff. workers will stall on blocking commands; they will not crash. the api will return `503` from `/health` until redis is back.

---

## memory management

### check current memory usage

```bash
redis-cli INFO memory | grep used_memory_human
redis-cli INFO memory | grep maxmemory
```

### set a memory limit (if not already set)

edit `docker-compose.yml` or `redis.conf`:

```yaml
# docker-compose.yml
redis:
  command: redis-server --maxmemory 512mb --maxmemory-policy noeviction
```

`noeviction` is the correct policy for a job queue - redis will return an error on new writes rather than silently evicting job data.

### inspect key counts

```bash
# count bullmq keys by queue
redis-cli --scan --pattern 'bull:*' | wc -l

# count by specific queue
redis-cli --scan --pattern 'bull:email:*' | wc -l
```

---

## persistence configuration

bullmq jobs are stored in redis. for production, enable **aof (append-only file)** persistence:

```ini
# redis.conf
appendonly yes
appendfsync everysec
```

for a docker deployment, mount the config:

```yaml
redis:
  volumes:
    - ./redis.conf:/usr/local/etc/redis/redis.conf
    - redis_data:/data
  command: redis-server /usr/local/etc/redis/redis.conf
```

---

## flush all jobs (emergency only)

**destructive. removes all jobs from all queues. never run on production without explicit approval.**

```bash
# target only job-queue keys (safer than FLUSHALL)
redis-cli --scan --pattern 'bull:*' | xargs redis-cli DEL

# nuclear option (clears entire redis instance - never do this in shared redis)
# redis-cli FLUSHALL
```

---

## replication / high availability

for production ha, switch from standalone redis to **redis sentinel** or **redis cluster**:

1. update `REDIS_URL` to `redis://sentinel-host:26379` (sentinel) or `redis://cluster-node:7000` (cluster)
2. update `getRedisClient()` in `src/services/redisClient.ts` to use `new Redis.Cluster([...nodes])` (see [adr-002](../adr/ADR-002-ioredis-client.md))
3. no other application code changes are required

---

## verify redis health after maintenance

```bash
# api health check (includes redis ping latency)
curl http://localhost:3000/health | jq .

# worker reconnection
docker compose logs worker --tail=50 | grep -i "redis\|connect\|error"

# prometheus metrics (should resume scraping)
curl http://localhost:3000/metrics | grep queue_waiting_jobs
```
