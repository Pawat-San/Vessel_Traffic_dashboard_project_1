module.exports = {
  run(db) {
    // Clear terminals first to ensure re-runnability
    db.exec('DELETE FROM terminals');
    db.exec("DELETE FROM sqlite_sequence WHERE name='terminals'");

    const terminals = [
      { code: 'LCB-A0', name: 'Laem Chabang Terminal A0', group_name: 'LCB', sort_order: 1 },
      { code: 'LCB-A1', name: 'Laem Chabang Terminal A1', group_name: 'LCB', sort_order: 2 },
      { code: 'LCB-A2', name: 'Laem Chabang Terminal A2', group_name: 'LCB', sort_order: 3 },
      { code: 'LCB-B1', name: 'Laem Chabang Terminal B1', group_name: 'LCB', sort_order: 4 },
      { code: 'LCB-B2', name: 'Laem Chabang Terminal B2', group_name: 'LCB', sort_order: 5 },
      { code: 'LCB-B3', name: 'Laem Chabang Terminal B3', group_name: 'LCB', sort_order: 6 },
      { code: 'LCB-B4', name: 'Laem Chabang Terminal B4', group_name: 'LCB', sort_order: 7 },
      { code: 'LCB-B5', name: 'Laem Chabang Terminal B5', group_name: 'LCB', sort_order: 8 },
      { code: 'LCB-C0', name: 'Laem Chabang Terminal C0', group_name: 'LCB', sort_order: 9 },
      { code: 'LCB-C1', name: 'Laem Chabang Terminal C1', group_name: 'LCB', sort_order: 10 },
      { code: 'LCB-C2', name: 'Laem Chabang Terminal C2', group_name: 'LCB', sort_order: 11 },
      { code: 'LCB-D1', name: 'Laem Chabang Terminal D1', group_name: 'LCB', sort_order: 12 },
      { code: 'LCB-D2', name: 'Laem Chabang Terminal D2', group_name: 'LCB', sort_order: 13 },
      { code: 'MTP-A', name: 'Map Ta Phut Terminal A', group_name: 'MTP', sort_order: 14 },
      { code: 'MTP-B', name: 'Map Ta Phut Terminal B', group_name: 'MTP', sort_order: 15 },
      { code: 'MTP-C', name: 'Map Ta Phut Terminal C', group_name: 'MTP', sort_order: 16 },
      { code: 'BKK-PAT1', name: 'Bangkok Port Klong Toey Terminal 1', group_name: 'BKK', sort_order: 17 },
      { code: 'BKK-PAT2', name: 'Bangkok Port Klong Toey Terminal 2', group_name: 'BKK', sort_order: 18 },
      { code: 'SRH-A', name: 'Sriracha Harbour Terminal A', group_name: 'SRH', sort_order: 19 },
      { code: 'SRH-B', name: 'Sriracha Harbour Terminal B', group_name: 'SRH', sort_order: 20 },
    ];

    const insert = db.prepare(`
      INSERT INTO terminals (code, name, group_name, sort_order, is_active)
      VALUES (@code, @name, @group_name, @sort_order, 1)
    `);

    for (const term of terminals) {
      insert.run(term);
    }
  }
};
