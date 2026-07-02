const { z } = require('zod');

const loginSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username must be at most 50 characters')
    .trim(),
  password: z.string()
    .min(1, 'Password is required')
    .max(100, 'Password must be at most 100 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string({
    required_error: 'Refresh token is required',
  }).min(1, 'Refresh token cannot be empty'),
});

module.exports = {
  loginSchema,
  refreshSchema,
};
