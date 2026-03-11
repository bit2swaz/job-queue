# ADR-004: Use Zod for Runtime Validation

**Status:** Accepted  
**Date:** 2026-03-12  
**Deciders:** Project team

---

## Context

The REST API accepts arbitrary JSON payloads from HTTP clients. TypeScript types are erased at runtime; there is no compile-time guarantee that incoming data matches the expected shape. We needed a runtime validation strategy.

---

## Decision

We use **Zod v3** for all request body validation.

---

## Rationale

| Criterion                         | Zod | Joi                 | Yup     | class-validator      |
| --------------------------------- | --- | ------------------- | ------- | -------------------- |
| TypeScript-first (inferred types) | ✅  | ❌ (separate types) | Partial | ❌ (decorator-based) |
| `z.infer<typeof schema>`          | ✅  | ❌                  | ❌      | ❌                   |
| Zero dependencies                 | ✅  | ❌                  | ❌      | ❌                   |
| Tree-shakeable                    | ✅  | ❌                  | ❌      | ❌                   |
| Composable schema refinements     | ✅  | ✅                  | Partial | Limited              |
| Discriminated unions              | ✅  | Limited             | Limited | Limited              |

The key advantage of Zod is that **the schema is the single source of truth** for both runtime validation and TypeScript types. We write:

```typescript
export const submitJobSchema = z.object({
  data: z.record(z.unknown()),
  opts: jobOptsSchema.optional(),
  idempotencyKey: z.string().optional(),
});

export type SubmitJobBody = z.infer<typeof submitJobSchema>;
```

The inferred `SubmitJobBody` type stays in sync with the schema automatically. No separate interface declaration, no drift.

### Integration with Express

The generic `validate(schema)` middleware factory in `src/middleware/validate.ts` wraps any Zod schema and returns a typed request body:

```typescript
router.post('/:queue', jwtMiddleware, validate(submitJobSchema), handler);
```

If validation fails, the middleware returns a `400` response with a structured error list before the handler executes.

---

## Consequences

- All request schemas live in `src/schemas/jobSchemas.ts`.
- Adding a new field requires updating only the Zod schema; TypeScript types update automatically.
- Error messages from `ZodError.flatten()` are returned in the 400 response body.
- Zod's `.parse()` method is used (throws on failure) rather than `.safeParse()` in the middleware, since the middleware already catches and converts the error.
- We are on Zod v3. Zod v4 introduced breaking changes to the error API; a dedicated ADR update will be required before upgrading.

---

## Alternatives Rejected

- **Joi** — mature and feature-rich, but requires separate TypeScript type declarations that can drift from the schema.
- **express-validator** — decorator/chain API is verbose; no automatic TypeScript inference.
- **Manual type guards** — every endpoint would require bespoke guard functions; high maintenance burden.
