const { z } = require('zod');

const ROLES = ['superadmin', 'admin', 'operator', 'viewer'];

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  display_name: z.string().min(1, 'Display name is required').max(100).trim(),
  role: z.enum(ROLES, { errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}` }) }),
});

const updateUserSchema = z.object({
  display_name: z.string().min(1).max(100).trim().optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
});

const adminResetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const selfChangePasswordSchema = z.object({
  current_password: z.string().max(100).optional(),
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const listUsersQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  role: z.enum(ROLES).optional(),
});

module.exports = {
  ROLES,
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
  selfChangePasswordSchema,
  listUsersQuerySchema,
};
