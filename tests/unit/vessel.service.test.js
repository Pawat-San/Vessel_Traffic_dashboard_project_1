const { setupTestDb, teardownTestDb } = require('../helpers/setup');
const { createTerminal, createVessel, createUser } = require('../helpers/factory');
const vesselService = require('../../src/modules/vessel/vessel.service');
const connection = require('../../src/database/connection');
const { ValidationError, NotFoundError } = require('../../src/utils/errors');

describe('VesselService Unit Tests', () => {
  let terminal;
  let user;

  beforeAll(async () => {
    await setupTestDb();
    
    // Seed prerequisite users and terminals
    user = createUser({ username: 'operator1', role: 'operator' });
    terminal = createTerminal({ code: 'LCB-T1', name: 'Laem Chabang T1' });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(() => {
    // Clean up vessels table between tests
    connection.db.prepare('DELETE FROM vessels').run();
    connection.db.prepare('DELETE FROM vessel_archive').run();
    connection.db.prepare('DELETE FROM audit_logs').run();
  });

  describe('getVessels()', () => {
    it('should sort vessels by ETA ascending by default', async () => {
      createVessel({ vessel_name: 'VESSEL B', eta: '2026-07-02T10:00:00.000Z', terminal_id: terminal.id });
      createVessel({ vessel_name: 'VESSEL A', eta: '2026-07-01T10:00:00.000Z', terminal_id: terminal.id });

      const res = await vesselService.getVessels();

      expect(res.data[0].vessel_name).toBe('VESSEL A');
      expect(res.data[1].vessel_name).toBe('VESSEL B');
    });

    it('should filter vessels by status', async () => {
      createVessel({ vessel_name: 'SEA VESSEL', status: 'AT SEA', terminal_id: terminal.id });
      createVessel({ vessel_name: 'BERTH VESSEL', status: 'BERTH', terminal_id: terminal.id });

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
        type: 'Container',
        terminal_id: terminal.id,
        activity: 'L',
        eta: '2026-07-01T08:00:00.000Z',
        status: 'AT SEA',
      };

      const created = await vesselService.createVessel(payload, user.id, '192.168.1.50');

      expect(created.vessel_name).toBe('CONTAINER SHIP ALPHA');
      expect(created.updated_by).toBe(user.id);
      
      // Verify Audit Log was written
      const audit = connection.db.prepare('SELECT * FROM audit_logs WHERE action = ?').get('CREATE');
      expect(audit).toBeDefined();
      expect(audit.entity_type).toBe('vessel');
      expect(audit.user_id).toBe(user.id);
      expect(JSON.parse(audit.changes).vessel_name).toBe('CONTAINER SHIP ALPHA');
    });

    it('should reject creation for invalid or inactive terminal IDs', async () => {
      const payload = {
        vessel_name: 'BAD TERMINAL SHIP',
        type: 'Container',
        terminal_id: 9999, // non-existent
        activity: 'L',
        status: 'AT SEA',
      };

      await expect(
        vesselService.createVessel(payload, user.id, '127.0.0.1')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('archiveExpiredVessels()', () => {
    it('should move departed vessels with ATD > 24 hours to archive and delete original', async () => {
      // 1. Create a vessel departed 26 hours ago
      const expiredAtd = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      const expiredVessel = createVessel({
        vessel_name: 'EXPIRED SHIP',
        status: 'DEPART',
        atd: expiredAtd,
        terminal_id: terminal.id
      });

      // 2. Create a vessel departed only 2 hours ago (should not be archived)
      const recentAtd = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const recentVessel = createVessel({
        vessel_name: 'RECENT SHIP',
        status: 'DEPART',
        atd: recentAtd,
        terminal_id: terminal.id
      });

      // Run archiving job
      const archivedCount = await vesselService.archiveExpiredVessels(24);

      expect(archivedCount).toBe(1);

      // Verify expired vessel was deleted from vessels table
      const activeShip = connection.db.prepare('SELECT * FROM vessels WHERE vessel_name = ?').get('EXPIRED SHIP');
      expect(activeShip).toBeUndefined();

      // Verify expired vessel exists in archive table
      const archivedShip = connection.db.prepare('SELECT * FROM vessel_archive WHERE vessel_name = ?').get('EXPIRED SHIP');
      expect(archivedShip).toBeDefined();
      expect(archivedShip.terminal_code).toBe(terminal.code);

      // Verify recent vessel is still active in vessels table
      const recentActiveShip = connection.db.prepare('SELECT * FROM vessels WHERE vessel_name = ?').get('RECENT SHIP');
      expect(recentActiveShip).toBeDefined();
    });

    it('should not archive vessels that have no ATD', async () => {
      createVessel({
        vessel_name: 'NO ATD SHIP',
        status: 'AT SEA',
        atd: null,
        terminal_id: terminal.id
      });

      const archivedCount = await vesselService.archiveExpiredVessels(24);
      expect(archivedCount).toBe(0);
    });
  });
});
