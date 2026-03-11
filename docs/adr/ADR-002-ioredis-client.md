# ADR-002: Use ioredis as the Redis Client

**Status:** Accepted  
**Date:** 2026-03-12  
**Deciders:** Project team

---

## Context

A Redis client library is required for both the BullMQ queue layer and the health-check endpoint. Node.js has two mainstream options:

- **node-redis v4** (`redis`) — official Redis-sponsored client
- **ioredis v5** — long-standing community client with cluster and sentinel support

---

## Decision

We chose **ioredis v5**.

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

## Consequences

- `ioredis` is a direct `dependency`, not a peer dependency.
- The singleton is in `src/services/redisClient.ts`. All modules import `getRedisClient()`.
- `getRedisClient()` is called once at startup; subsequent calls return the same instance.
- In tests, the singleton's `disconnect()` method is called in `afterAll` to release the connection and allow Jest to exit cleanly.
- A future migration to Redis Cluster only requires changing the `RedisOptions` object in `redisClient.ts`; no other files change.

---

## Alternatives Rejected

- **node-redis v4** — would require two separate Redis connection pools (ioredis for BullMQ + node-redis for app). Rejected on the grounds of unnecessary complexity and doubled connection overhead.
- **BullMQ-managed connections only** — passing raw `RedisOptions` to BullMQ and not importing ioredis directly would lose the ability to share a connection for health checks and DLQ operations.
