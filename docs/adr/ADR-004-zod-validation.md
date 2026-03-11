# adr-004: use zod for runtime validation

**status:** accepted
**date:** 2026-03-12
**deciders:** project team

---

## context

the rest api accepts arbitrary json payloads from http clients. typescript types are erased at runtime; there is no compile-time guarantee that incoming data matches the expected shape. we needed a runtime validation strategy.

---

## decision

we use **zod v3** for all request body validation.

---

## rationale

| criterion                         | zod | joi                 | yup     | class-validator      |
| --------------------------------- | --- | ------------------- | ------- | -------------------- |
| typescript-first (inferred types) | ✅  | ❌ (separate types) | partial | ❌ (decorator-based) |
| `z.infer<typeof schema>`          | ✅  | ❌                  | ❌      | ❌                   |
| zero dependencies                 | ✅  | ❌                  | ❌      | ❌                   |
| tree-shakeable                    | ✅  | ❌                  | ❌      | ❌                   |
| composable schema refinements     | ✅  | ✅                  | partial | limited              |
| discriminated unions              | ✅  | limited             | limited | limited              |

the key advantage of zod is that **the schema is the single source of truth** for both runtime validation and typescript types. we write:

```typescript
export const submitJobSchema = z.object({
  data: z.record(z.unknown()),
  opts: jobOptsSchema.optional(),
  idempotencyKey: z.string().optional(),
});

export type SubmitJobBody = z.infer<typeof submitJobSchema>;
```

the inferred `SubmitJobBody` type stays in sync with the schema automatically. no separate interface declaration, no drift.

### integration with express

the generic `validate(schema)` middleware factory in `src/middleware/validate.ts` wraps any zod schema and returns a typed request body:

```typescript
router.post('/:queue', jwtMiddleware, validate(submitJobSchema), handler);
```

if validation fails, the middleware returns a `400` response with a structured error list before the handler executes.

---

## consequences

- all request schemas live in `src/schemas/jobSchemas.ts`.
- adding a new field requires updating only the zod schema; typescript types update automatically.
- error messages from `ZodError.flatten()` are returned in the 400 response body.
- zod's `.parse()` method is used (throws on failure) rather than `.safeParse()` in the middleware, since the middleware already catches and converts the error.
- we are on zod v3. zod v4 introduced breaking changes to the error api; a dedicated adr update will be required before upgrading.

---

## alternatives rejected

- **joi** - mature and feature-rich, but requires separate typescript type declarations that can drift from the schema.
- **express-validator** - decorator/chain api is verbose; no automatic typescript inference.
- **manual type guards** - every endpoint would require bespoke guard functions; high maintenance burden.
