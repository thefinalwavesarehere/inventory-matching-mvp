/**
 * Input Validation Middleware
 * 
 * Provides type-safe request validation using Zod schemas.
 * Prevents injection attacks and ensures data integrity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema, ZodError } from 'zod';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodIssue[],
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate request body against Zod schema
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        'Invalid request body',
        error.errors
      );
    }
    throw error;
  }
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQuery<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): T {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    return schema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        'Invalid query parameters',
        error.errors
      );
    }
    throw error;
  }
}

/**
 * Validate route parameters against Zod schema
 */
export function validateParams<T>(
  params: Record<string, string | string[]>,
  schema: ZodSchema<T>
): T {
  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        'Invalid route parameters',
        error.errors
      );
    }
    throw error;
  }
}

/**
 * Middleware wrapper with automatic validation and error handling
 */
export async function withValidation<TBody, TQuery, TParams>(
  request: NextRequest,
  schemas: {
    body?: ZodSchema<TBody>;
    query?: ZodSchema<TQuery>;
    params?: ZodSchema<TParams>;
  },
  handler: (validated: {
    body?: TBody;
    query?: TQuery;
    params?: TParams;
  }) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const validated: {
      body?: TBody;
      query?: TQuery;
      params?: TParams;
    } = {};

    if (schemas.body) {
      validated.body = await validateBody(request, schemas.body);
    }

    if (schemas.query) {
      validated.query = validateQuery(request, schemas.query);
    }

    // Note: params would be passed separately in actual route handlers
    
    return await handler(validated);
  } catch (error) {
    return handleValidationError(error);
  }
}

/**
 * Format validation errors for API response
 */
function handleValidationError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: 'VALIDATION_ERROR',
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      },
      { status: error.statusCode }
    );
  }

  console.error('[VALIDATION_ERROR]', error);
  
  return NextResponse.json(
    {
      error: 'An unexpected error occurred during validation.',
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  );
}

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    offset: z.coerce.number().int().nonnegative().optional(),
  }),

  // ID validation
  cuid: z.string().regex(/^c[a-z0-9]{24}$/, 'Invalid CUID format'),
  uuid: z.string().uuid('Invalid UUID format'),

  // Sorting
  sortOrder: z.enum(['asc', 'desc']).default('asc'),

  // Date range
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).refine(
    data => data.startDate <= data.endDate,
    { message: 'Start date must be before end date' }
  ),

  // Email
  email: z.string().email('Invalid email address'),

  // Non-empty string
  nonEmptyString: z.string().min(1, 'Field cannot be empty').trim(),

  // Positive integer
  positiveInt: z.number().int().positive(),

  // Confidence score (0-1)
  confidence: z.number().min(0).max(1),
};
