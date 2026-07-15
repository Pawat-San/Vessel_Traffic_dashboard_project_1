const { createVesselSchema } = require('../../src/modules/vessel/vessel.schema');

// Minimal valid payload shared across cases -- only `voy` varies.
const basePayload = {
  vessel_name: 'TEST VESSEL',
  type: 'Container',
  terminal_id: 1,
  activity: 'L',
  status: 'AT SEA',
};

describe('createVesselSchema — voy (F13)', () => {
  it('accepts exactly 4 alphanumeric characters', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: '04A2' });
    expect(result.success).toBe(true);
    expect(result.data.voy).toBe('04A2');
  });

  it('normalizes lowercase input to uppercase', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: 'ab12' });
    expect(result.success).toBe(true);
    expect(result.data.voy).toBe('AB12');
  });

  it('rejects 3-character VOY', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: 'A12' });
    expect(result.success).toBe(false);
  });

  it('rejects 5-character VOY', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: 'A1234' });
    expect(result.success).toBe(false);
  });

  it('still allows a blank/omitted VOY (optional field)', () => {
    expect(createVesselSchema.safeParse({ ...basePayload, voy: '' }).success).toBe(true);
    expect(createVesselSchema.safeParse(basePayload).success).toBe(true);
  });

  it('rejects non-alphanumeric characters even at 4 chars', () => {
    const result = createVesselSchema.safeParse({ ...basePayload, voy: '04-2' });
    expect(result.success).toBe(false);
  });
});
