/**
 * OpenAPI specification setup using swagger-jsdoc.
 *
 * The spec is assembled at startup from JSDoc @openapi annotations
 * across all route files. The `swaggerSpec` export is used by both
 * the `/api-docs` UI route and the `/api-docs.json` raw-JSON route.
 */
import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Job Queue API',
      version,
      description: 'Production-grade background job processing system built on BullMQ and Redis.',
      license: { name: 'MIT' },
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        JobOptions: {
          type: 'object',
          properties: {
            priority: { type: 'integer', minimum: 1, description: 'Lower = higher priority' },
            delay: { type: 'integer', minimum: 0, description: 'Delay before processing (ms)' },
            attempts: { type: 'integer', minimum: 1, description: 'Max retry attempts' },
          },
        },
        SubmitJobBody: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              additionalProperties: true,
              description: 'Arbitrary job payload',
            },
            opts: { $ref: '#/components/schemas/JobOptions' },
            idempotencyKey: {
              type: 'string',
              description: 'Deduplication key — same key re-uses the existing job',
            },
          },
        },
        JobStatus: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            state: {
              type: 'string',
              enum: ['waiting', 'active', 'completed', 'failed', 'delayed', 'unknown'],
            },
            progress: { oneOf: [{ type: 'number' }, { type: 'object' }] },
            returnValue: {},
            failedReason: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

/**
 * Compiled OpenAPI 3.0 specification object.
 * Generated once at startup; read-only at runtime.
 */
export const swaggerSpec = swaggerJsdoc(options) as object;
