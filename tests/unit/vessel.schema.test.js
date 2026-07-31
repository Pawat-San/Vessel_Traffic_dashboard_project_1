const { createVesselSchema } = require('../../src/modules/vessel/vessel.schema');

// Minimal valid payload shared across cases -- only `voy` varies.
const basePayload = {
  vessel_name: 'TEST VESSEL',
  type: 'CNTN',
  terminal_id: 1,
  activity: 'L',
  status: 'AT SEA',
};

describe('createVesselSchema — voy (F13)', () => {
  it('accepts exactly 3 digits', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: '042' });
    expect(result.success).toBe(true);
    expect(result.data.voy).toBe('042');
  });

  it('preserves a leading zero rather than coercing to a number', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: '007' });
    expect(result.success).toBe(true);
    expect(result.data.voy).toBe('007');
  });

  it('rejects 2-digit VOY', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: '42' });
    expect(result.success).toBe(false);
  });

  it('rejects 4-digit VOY', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: '0422' });
    expect(result.success).toBe(false);
  });

  it('rejects letters, even at 3 characters', () => {
    expect(createVesselSchema.safeParse({ ...basePayload, voy: 'A12' }).success).toBe(false);
    expect(createVesselSchema.safeParse({ ...basePayload, voy: 'ABC' }).success).toBe(false);
  });

  it('rejects non-digit characters at 3 characters', () => {
    expect(createVesselSchema.safeParse({ ...basePayload, voy: '0-2' }).success).toBe(false);
    expect(createVesselSchema.safeParse({ ...basePayload, voy: '4 2' }).success).toBe(false);
  });

  it('still allows a blank/omitted VOY (optional field)', () => {
    expect(createVesselSchema.safeParse({ ...basePayload, voy: '' }).success).toBe(true);
    expect(createVesselSchema.safeParse(basePayload).success).toBe(true);
  });
});
