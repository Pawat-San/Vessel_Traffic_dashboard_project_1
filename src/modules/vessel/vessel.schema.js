const { z } = require('zod');

// Custom Zod schema for parseable datetimes or empty inputs
const dateSchema = z.string()
  .trim()
  .refine((val) => {
    if (!val) return true;
    return !isNaN(Date.parse(val));
  }, {
    message: 'Must be a valid date/time format (e.g. ISO 8601)'
  })
  .transform((val) => (val === '' ? null : val))
  .nullable()
  .optional();

const createVesselSchema = z.object({
  vessel_name: z.string()
    .min(1, 'Vessel name is required')
    .max(100, 'Vessel name must be at most 100 characters')
    .trim(),
  // F13: optional, but if provided must be exactly 4 alphanumeric characters.
  voy: z.string()
    .trim()
    .toUpperCase()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional()
    .refine((val) => val === null || val === undefined || /^[A-Z0-9]{4}$/.test(val), {
      message: 'VOY must be exactly 4 alphanumeric characters',
    }),
  type: z.enum(['Container','Bulk','Tanker','General','RoRo','LPG','Passenger'], {
    errorMap: () => ({ message: 'Vessel type must be one of: Container, Bulk, Tanker, General, RoRo, LPG, Passenger' })
  }),
  terminal_id: z.number({
    required_error: 'Terminal ID is required'
  }).int().positive(),
  activity: z.enum(['L','D','B','DD','LD','LB','DB','LDB','L,D','L,B','D,B','L,D,B'], {
    errorMap: () => ({ message: 'Activity must be a valid loading/discharging combination (e.g. L, D, B, LD, etc.)' })
  }),
  eta: dateSchema,
  etb: dateSchema,
  etd: dateSchema,
  atd: dateSchema,
  status: z.enum(['AT SEA','ANCHOR','BERTH','DEPART'], {
    errorMap: () => ({ message: 'Status must be one of: AT SEA, ANCHOR, BERTH, DEPART' })
  }),
  next_port: z.string()
    .max(100, 'Next port name must be at most 100 characters')
    .trim()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(),
  remark: z.string()
    .max(500, 'Remark must be at most 500 characters')
    .trim()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(),
});

const updateVesselSchema = createVesselSchema.partial();

// A single row in a bulk CSV import. Reuses createVesselSchema's rules but
// makes terminal_id optional and accepts a human-readable terminal_code
// instead (that is what the CSV Export writes). The service resolves the code
// to an id. At least one of terminal_id / terminal_code must be supplied.
const importVesselRowSchema = createVesselSchema
  .extend({
    terminal_id: z.number().int().positive().optional(),
    terminal_code: z.string().trim().min(1).max(20).optional(),
  })
  .refine((row) => row.terminal_id != null || (row.terminal_code && row.terminal_code.length > 0), {
    message: 'Each row requires a terminal_id or a terminal_code',
    path: ['terminal_code'],
  });

const bulkImportSchema = z.object({
  vessels: z.array(importVesselRowSchema)
    .min(1, 'At least one vessel row is required')
    .max(500, 'A single import is limited to 500 rows'),
});

const queryVesselSchema = z.object({
  status: z.enum(['AT SEA','ANCHOR','BERTH','DEPART']).optional(),
  terminal_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('asc').optional(),
});

module.exports = {
  createVesselSchema,
  updateVesselSchema,
  queryVesselSchema,
  importVesselRowSchema,
  bulkImportSchema,
};
