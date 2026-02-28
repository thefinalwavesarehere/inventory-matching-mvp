/**
 * Domain Schemas
 *
 * Centralised Zod schemas for all user-facing mutating endpoints.
 * Import from here instead of defining inline in route handlers.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const cuid = z.string().cuid('Invalid ID format');
export const nonEmptyString = z.string().min(1).max(255).trim();
export const optionalString = z.string().max(1000).trim().optional();

// ---------------------------------------------------------------------------
// Auth / User Profile
// ---------------------------------------------------------------------------

export const CreateProfileSchema = z.object({
  userId: z.string().uuid('Invalid userId format'),
  email: z.string().email('Invalid email address'),
  fullName: z.string().max(100).trim().optional(),
});

export const UpdateUserProfileSchema = z.object({
  fullName: z.string().max(100).trim().optional(),
  email: z.string().email('Invalid email address').optional(),
}).refine(
  data => data.fullName !== undefined || data.email !== undefined,
  { message: 'At least one field (fullName or email) must be provided' }
);

// ---------------------------------------------------------------------------
// Admin — User Management
// ---------------------------------------------------------------------------

export const ChangeUserRoleSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER'], {
    errorMap: () => ({ message: 'Role must be ADMIN, EDITOR, or VIEWER' }),
  }),
});

export const AdminUpdateUserSchema = z.object({
  fullName: z.string().max(100).trim().optional(),
  email: z.string().email('Invalid email address').optional(),
}).refine(
  data => data.fullName !== undefined || data.email !== undefined,
  { message: 'At least one field must be provided' }
);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const CreateProjectSchema = z.object({
  name: nonEmptyString,
  description: optionalString,
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(1000).trim().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Rules (VendorActionRule)
// ---------------------------------------------------------------------------

const VendorActionEnum = z.enum(
  ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'],
  { errorMap: () => ({ message: 'Invalid vendor action' }) }
);

export const CreateRuleSchema = z.object({
  supplierLineCode: nonEmptyString,
  categoryPattern: nonEmptyString,
  subcategoryPattern: nonEmptyString,
  action: VendorActionEnum,
  active: z.boolean().default(true),
});

export const UpdateRuleSchema = z.object({
  supplierLineCode: z.string().min(1).max(255).trim().optional(),
  categoryPattern: z.string().min(1).max(255).trim().optional(),
  subcategoryPattern: z.string().min(1).max(255).trim().optional(),
  action: VendorActionEnum.optional(),
  active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Line Code Mappings
// ---------------------------------------------------------------------------

export const CreateLineMappingSchema = z.object({
  scope: z.enum(['project', 'global']),
  projectId: z.string().optional(),
  clientLineCode: nonEmptyString,
  manufacturerName: z.string().max(255).trim().optional(),
  manufacturerLineCode: nonEmptyString,
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.string().max(50).trim().default('manual'),
  notes: z.string().max(1000).trim().optional(),
}).refine(
  data => !(data.scope === 'project' && !data.projectId),
  { message: 'projectId is required for project-scoped mappings', path: ['projectId'] }
);

// ---------------------------------------------------------------------------
// Project Budget / Settings
// ---------------------------------------------------------------------------

export const UpdateBudgetSchema = z.object({
  budget: z.number().positive().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
});

// ---------------------------------------------------------------------------
// Helper: parse body and return 400 on failure
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';

export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: result.error.issues.map(i => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
