# adr-002: use ioredis as the redis client

**status:** accepted
**date:** 2026-03-12
**deciders:** project team

---

## context

a redis client library is required for both the bullmq queue layer and the health-check endpoint. node.js has two mainstream options:

- **node-redis v4** (`redis`) - official redis-sponsored client
- **ioredis v5** - long-standing community client with cluster and sentinel support

---

## decision

we chose **ioredis v5**.

---

## Rationale

BullMQ explicitly [documents](https://docs.bullmq.io/guide/connections) that it uses `ioredis` internally and requires callers to pass an `ioredis` `IORedis` instance (or `RedisOptions`). While BullMQ can accept a `RedisOptions` object and create its own internal connection, sharing a single `ioredis` singleton across the app (health checks, DLQ service, queue manager) avoids opening redundant connections.

Using `node-redis` for application-level operations while BullMQ opens `ioredis` connections internally would mean two separate connection pools with different reconnect semantics — unnecessary complexity.

Key `ioredis` behaviours we rely on:

| Feature                                 | Why we need it                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `lazyConnect: true`                     | Prevents connection before the server is ready; avoids test-startup noise       |
| `maxRetriesPerRequest: null`            | Required by BullMQ; allows long-running blocking commands to retry indefinitely |
| Auto-reconnect with exponential backoff | Handles transient Redis restarts without crashing the worker                    |
| Cluster / Sentinel support              | Available when we need to scale Redis horizontally (no code change)             |

---

## consequences

- `ioredis` is a direct `dependency`, not a peer dependency.
- the singleton is in `src/services/redisClient.ts`. all modules import `getRedisClient()`.
- `getRedisClient()` is called once at startup; subsequent calls return the same instance.
- in tests, the singleton's `disconnect()` method is called in `afterAll` to release the connection and allow jest to exit cleanly.
- a future migration to redis cluster only requires changing the `RedisOptions` object in `redisClient.ts`; no other files change.

---

## alternatives rejected

- **node-redis v4** - would require two separate redis connection pools (ioredis for bullmq + node-redis for app). rejected on the grounds of unnecessary complexity and doubled connection overhead.
- **bullmq-managed connections only** - passing raw `RedisOptions` to bullmq and not importing ioredis directly would lose the ability to share a connection for health checks and dlq operations.
