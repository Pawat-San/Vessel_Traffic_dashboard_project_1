const { z } = require('zod');
const { getPasswordPolicyErrors } = require('../../utils/passwordPolicy');

const ROLES = ['superadmin', 'admin', 'operator', 'viewer'];

const passwordSchema = z.string().superRefine((password, ctx) => {
  for (const error of getPasswordPolicyErrors(password)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error.message });
  }
});

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).trim(),
  password: passwordSchema,
  display_name: z.string().min(1, 'Display name is required').max(100).trim(),
  role: z.enum(ROLES, { errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}` }) }),
});

const updateUserSchema = z.object({
  display_name: z.string().min(1).max(100).trim().optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
});

const adminResetPasswordSchema = z.object({
  new_password: passwordSchema,
});

const selfChangePasswordSchema = z.object({
  current_password: z.string().max(100).optional(),
  new_password: passwordSchema,
});

const listUsersQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  role: z.enum(ROLES).optional(),
  activityStatus: z.enum(['active-now', 'active-30d', 'inactive-30d', 'never-login']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const activityEventsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  targetUserId: z.string().regex(/^\d+$/).transform(Number).optional(),
  role: z.enum(ROLES).optional(),
  action: z.string().min(1).max(120).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
}).refine(
  (value) => !value.startDate || !value.endDate || new Date(value.startDate) <= new Date(value.endDate),
  { message: 'startDate must be before or equal to endDate', path: ['startDate'] }
);

module.exports = {
  ROLES,
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
  selfChangePasswordSchema,
  listUsersQuerySchema,
  activityEventsQuerySchema,
  passwordSchema,
};
