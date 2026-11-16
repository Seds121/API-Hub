import { applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

function jsonSchema(schema: ZodTypeAny) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as any;
  delete s.$schema;
  return s;
}

/** Validated body param + OpenAPI body schema in one decorator. */
export const ZBody = <T extends ZodTypeAny>(schema: T) =>
  createParamDecorator(
    (_d: unknown, ctx: ExecutionContext): z.infer<T> =>
      schema.parse(ctx.switchToHttp().getRequest().body ?? {}),
  )();

export const ZQuery = <T extends ZodTypeAny>(schema: T) =>
  createParamDecorator(
    (_d: unknown, ctx: ExecutionContext): z.infer<T> =>
      schema.parse(ctx.switchToHttp().getRequest().query ?? {}),
  )();

export const ApiZodBody = (schema: ZodTypeAny) =>
  applyDecorators(ApiBody({ schema: jsonSchema(schema) }));

export const ApiZodQuery = (schema: ZodTypeAny) => {
  const js = jsonSchema(schema) as { properties?: Record<string, object>; required?: string[] };
  return applyDecorators(
    ...Object.entries(js.properties ?? {}).map(([name, s]) =>
      ApiQuery({ name, required: js.required?.includes(name) ?? false, schema: s }),
    ),
  );
};

export const uuidParam = z.string().uuid();
