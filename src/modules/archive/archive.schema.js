const { z } = require('zod');

const purgeQuerySchema = z.object({
  days: z.string().regex(/^[1-9][0-9]*$/).transform(Number)
    .pipe(z.number().int().min(1).max(3650)).optional().default('90'),
});

module.exports = { purgeQuerySchema };
