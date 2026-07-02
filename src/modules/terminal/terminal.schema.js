const { z } = require('zod');

const createTerminalSchema = z.object({
  code: z.string()
    .min(1, 'Terminal code is required')
    .max(20, 'Terminal code must be at most 20 characters')
    .toUpperCase()
    .trim(),
  name: z.string()
    .max(100, 'Terminal name must be at most 100 characters')
    .trim()
    .optional(),
  group_name: z.string()
    .max(50, 'Group name must be at most 50 characters')
    .trim()
    .optional(),
  sort_order: z.number().int().nonnegative().default(0),
  is_active: z.number().int().min(0).max(1).default(1),
});

const updateTerminalSchema = createTerminalSchema.partial();

module.exports = {
  createTerminalSchema,
  updateTerminalSchema,
};
