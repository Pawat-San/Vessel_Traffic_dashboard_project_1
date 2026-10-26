const { z } = require('zod');
const validate = require('../../src/middleware/validate');
const { purgeQuerySchema } = require('../../src/modules/archive/archive.schema');
const { bulkImportSchema } = require('../../src/modules/vessel/vessel.schema');

describe('Zod 4 validation compatibility', () => {
  it.each(['body', 'query', 'params'])('returns a validation error for invalid %s', (part) => {
    const next = jest.fn();
    const req = { [part]: { count: 'invalid' } };
    validate[part](z.object({ count: z.number() }))(req, {}, next);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ field: 'count', message: expect.any(String) }]);
  });

  it('keeps the default purge age numeric and applies explicit query transformations', () => {
    expect(purgeQuerySchema.parse({})).toEqual({ days: 90 });
    expect(purgeQuerySchema.parse({ days: '120' })).toEqual({ days: 120 });
    const req = { query: {} };
    const next = jest.fn();
    validate.query(purgeQuerySchema)(req, {}, next);
    expect(req.query).toEqual({ days: 90 });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an oversized import before collecting errors for every invalid row', () => {
    const result = bulkImportSchema.safeParse({ vessels: Array.from({ length: 501 }, () => ({})) });
    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual([
      expect.objectContaining({ code: 'too_big', path: ['vessels'], maximum: 500 }),
    ]);
  });
});
