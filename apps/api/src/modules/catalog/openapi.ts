import type { ApiEndpoint, ApiProduct } from '@prisma/client';
import type { ParamDef } from '@zeze/shared';

const typeMap: Record<ParamDef['type'], string> = {
  string: 'string',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
};

/** Generates an OpenAPI 3.0 document for one published product (customer-facing; no upstream details). */
export function buildProductOpenApi(
  product: ApiProduct & { endpoints: ApiEndpoint[] },
  opts: {
    baseUrl: string;
    companyName: string;
    prices: Record<string, string | null>;
    currency: string;
  },
) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of product.endpoints.filter((x) => x.isActive)) {
    const params = (e.params as ParamDef[]) ?? [];
    const bodyParams = params.filter((p) => p.in === 'body');
    const op: Record<string, unknown> = {
      operationId: `${e.method.toLowerCase()}_${e.path.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'root'}`,
      summary: e.name,
      description: [
        e.description ?? '',
        opts.prices[e.id]
          ? `\n\n**Price:** ${opts.prices[e.id]} ${opts.currency} per successful request.`
          : '',
      ].join(''),
      parameters: params
        .filter((p) => p.in !== 'body')
        .map((p) => ({
          name: p.name,
          in: p.in,
          required: p.in === 'path' ? true : p.required,
          description: p.description,
          schema: {
            type: typeMap[p.type],
            ...(p.enum ? { enum: p.enum } : {}),
            ...(p.maxLength ? { maxLength: p.maxLength } : {}),
          },
          ...(p.example !== undefined ? { example: p.example } : {}),
        })),
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': { ...(e.responseExample ? { example: e.responseExample } : {}) },
          },
        },
        '400': { $ref: '#/components/responses/Error' },
        '401': { $ref: '#/components/responses/Error' },
        '402': { $ref: '#/components/responses/Error' },
        '403': { $ref: '#/components/responses/Error' },
        '429': { $ref: '#/components/responses/Error' },
        '502': { $ref: '#/components/responses/Error' },
        '503': { $ref: '#/components/responses/Error' },
        '504': { $ref: '#/components/responses/Error' },
      },
    };
    if (bodyParams.length || e.requestBodyExample) {
      op.requestBody = {
        required: bodyParams.some((p) => p.required),
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: Object.fromEntries(
                bodyParams.map((p) => [
                  p.name,
                  { type: typeMap[p.type], description: p.description },
                ]),
              ),
              required: bodyParams.filter((p) => p.required).map((p) => p.name),
            },
            ...(e.requestBodyExample ? { example: e.requestBodyExample } : {}),
          },
        },
      };
    }
    const path = `/v1/${product.slug}${e.path === '/' ? '' : e.path}`;
    paths[path] = { ...(paths[path] ?? {}), [e.method.toLowerCase()]: op };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: `${product.name}`,
      version: '1.0.0',
      description: `${product.summary}\n\nProvided by ${opts.companyName}.${product.usageRestrictions ? `\n\n**Usage restrictions:** ${product.usageRestrictions}` : ''}`,
      'x-internal-id': product.internalCode,
    },
    servers: [{ url: opts.baseUrl }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Authorization: Bearer <your API key>',
        },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      responses: {
        Error: {
          description: 'Error envelope',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      message: { type: 'string' },
                      requestId: { type: 'string' },
                      details: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
