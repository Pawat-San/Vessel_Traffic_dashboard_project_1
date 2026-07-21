const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createTerminal, createVessel, createUser } = require('../helpers/factory');
const vesselService = require('../../src/modules/vessel/vessel.service');
const database = require('../../src/database/knex');
const { ValidationError, NotFoundError } = require('../../src/utils/errors');

describe('VesselService Unit Tests', () => {
  let terminal;
  let user;

  beforeAll(async () => {
    await setupTestDb();

    // Seed prerequisite users and terminals
    user = await createUser({ username: 'operator1', role: 'operator' });
    terminal = await createTerminal({ code: 'LCB-T1', name: 'Laem Chabang T1' });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    // Clean up vessels table between tests
    await database.db('vessels').del();
    await database.db('vessel_archive').del();
    await database.db('audit_logs').del();
  });

  describe('getVessels()', () => {
    it('should sort vessels by ETD ascending by default', async () => {
      await createVessel({ vessel_name: 'VESSEL B', etd: '2026-07-02T10:00:00.000Z', terminal_id: terminal.id });
      await createVessel({ vessel_name: 'VESSEL A', etd: '2026-07-01T10:00:00.000Z', terminal_id: terminal.id });

      const res = await vesselService.getVessels();

      expect(res.data[0].vessel_name).toBe('VESSEL A');
      expect(res.data[1].vessel_name).toBe('VESSEL B');
    });

    it('should filter vessels by status', async () => {
      await createVessel({ vessel_name: 'SEA VESSEL', status: 'AT SEA', terminal_id: terminal.id });
      await createVessel({ vessel_name: 'BERTH VESSEL', status: 'BERTH', terminal_id: terminal.id });

      const res = await vesselService.getVessels({ status: 'BERTH' });

      expect(res.totalCount).toBe(1);
      expect(res.data[0].vessel_name).toBe('BERTH VESSEL');
    });
  });

  describe('createVessel()', () => {
    it('should create vessel, set updated_by, and write an audit log entry', async () => {
      const payload = {
        vessel_name: 'CONTAINER SHIP ALPHA',
        voy: 'VOY-99',
        type: 'CNTN',
        terminal_id: terminal.id,
        activity: 'L',
        eta: '2026-07-01T08:00:00.000Z',
        status: 'AT SEA',
      };

      const created = await vesselService.createVessel(payload, user.id, '192.168.1.50');

      expect(created.vessel_name).toBe('CONTAINER SHIP ALPHA');
      expect(created.updated_by).toBe(user.id);

      // Verify Audit Log was written
      const audit = await database.db('audit_logs').where('action', 'CREATE').first();
      expect(audit).toBeDefined();
      expect(audit.entity_type).toBe('vessel');
      expect(audit.user_id).toBe(user.id);
      expect(JSON.parse(audit.changes).vessel_name).toBe('CONTAINER SHIP ALPHA');
    });

    it('should reject creation for invalid or inactive terminal IDs', async () => {
      const payload = {
        vessel_name: 'BAD TERMINAL SHIP',
        type: 'CNTN',
        terminal_id: 9999, // non-existent
        activity: 'L',
        status: 'AT SEA',
      };

      await expect(
        vesselService.createVessel(payload, user.id, '127.0.0.1')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('createVesselsBulk()', () => {
    it('should insert valid rows (by terminal_code or terminal_id) and report failures', async () => {
      const rows = [
        { vessel_name: 'BULK ALPHA', type: 'CNTN', terminal_code: terminal.code, activity: 'L', status: 'AT SEA' },
        { vessel_name: 'BULK BRAVO', type: 'BULK', terminal_id: terminal.id, activity: 'D', status: 'BERTH' },
        { vessel_name: 'BULK CHARLIE', type: 'TANKER', terminal_code: 'DOES-NOT-EXIST', activity: 'B', status: 'ANCHOR' },
      ];

      const result = await vesselService.createVesselsBulk(rows, user.id, '10.0.0.9');

      expect(result.inserted).toBe(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].vessel_name).toBe('BULK CHARLIE');

      const inserted = await database.db('vessels').whereIn('vessel_name', ['BULK ALPHA', 'BULK BRAVO']);
      expect(inserted).toHaveLength(2);
      expect(inserted.every((v) => v.terminal_id === terminal.id)).toBe(true);
      expect(inserted.every((v) => v.updated_by === user.id)).toBe(true);

      // No row should have been created for the invalid one
      const badShip = await database.db('vessels').where('vessel_name', 'BULK CHARLIE').first();
      expect(badShip).toBeUndefined();

      // One CREATE audit log per inserted row
      const audits = await database.db('audit_logs').where('action', 'CREATE');
      expect(audits).toHaveLength(2);
    });

    it('should insert nothing when every row has an unknown terminal', async () => {
      const rows = [
        { vessel_name: 'ORPHAN 1', type: 'CNTN', terminal_code: 'NOPE', activity: 'L', status: 'AT SEA' },
      ];

      const result = await vesselService.createVesselsBulk(rows, user.id, '10.0.0.9');

      expect(result.inserted).toBe(0);
      expect(result.failed).toHaveLength(1);

      const count = await database.db('vessels').count({ c: '*' }).first();
      expect(Number(count.c)).toBe(0);
    });
  });

  describe('archiveExpiredVessels()', () => {
    it('should move departed vessels with ATD > 24 hours to archive and delete original', async () => {
      // 1. Create a vessel departed 26 hours ago
      const expiredAtd = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      await createVessel({
        vessel_name: 'EXPIRED SHIP',
        status: 'DEPART',
        atd: expiredAtd,
        terminal_id: terminal.id,
      });

      // 2. Create a vessel departed only 2 hours ago (should not be archived)
      const recentAtd = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await createVessel({
        vessel_name: 'RECENT SHIP',
        status: 'DEPART',
        atd: recentAtd,
        terminal_id: terminal.id,
      });

      // Run archiving job
      const archivedCount = await vesselService.archiveExpiredVessels(24);

      expect(archivedCount).toBe(1);

      // Verify expired vessel was deleted from vessels table
      const activeShip = await database.db('vessels').where('vessel_name', 'EXPIRED SHIP').first();
      expect(activeShip).toBeUndefined();

      // Verify expired vessel exists in archive table
      const archivedShip = await database.db('vessel_archive').where('vessel_name', 'EXPIRED SHIP').first();
      expect(archivedShip).toBeDefined();
      expect(archivedShip.terminal_code).toBe(terminal.code);

      // Verify recent vessel is still active in vessels table
      const recentActiveShip = await database.db('vessels').where('vessel_name', 'RECENT SHIP').first();
      expect(recentActiveShip).toBeDefined();
    });

    it('should not archive vessels that have no ATD', async () => {
      await createVessel({
        vessel_name: 'NO ATD SHIP',
        status: 'AT SEA',
        atd: null,
        terminal_id: terminal.id,
      });

      const archivedCount = await vesselService.archiveExpiredVessels(24);
      expect(archivedCount).toBe(0);
    });
  });
});
