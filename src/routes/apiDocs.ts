/**
 * Swagger UI and raw OpenAPI JSON routes — development-only.
 *
 * GET /api-docs       → Swagger UI HTML
 * GET /api-docs.json  → Raw OpenAPI 3.0 JSON
 *
 * Both routes are only mounted when NODE_ENV !== 'production'.
 * See src/app.ts for the conditional mount.
 */
import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './apiSpec';

export const apiDocsRouter = Router();

/**
 * @openapi
 * /api-docs.json:
 *   get:
 *     summary: Raw OpenAPI 3.0 specification
 *     tags: [Docs]
 *     security: []
 *     responses:
 *       200:
 *         description: OpenAPI JSON document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
apiDocsRouter.get('/api-docs.json', (_req: Request, res: Response): void => {
  res.json(swaggerSpec);
});

// Serve the Swagger UI at /api-docs
apiDocsRouter.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
