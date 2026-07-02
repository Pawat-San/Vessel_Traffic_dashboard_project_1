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
  voy: z.string()
    .max(20, 'VOY must be at most 20 characters')
    .trim()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(),
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
};
