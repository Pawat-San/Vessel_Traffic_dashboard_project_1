exports.seed = async function seed(knex) {
  await knex('terminals').del();

  const terminals = [
    { code: 'LCB-A0', name: 'Laem Chabang Terminal A0', group_name: 'LCB', sort_order: 1, is_active: 1 },
    { code: 'LCB-A1', name: 'Laem Chabang Terminal A1', group_name: 'LCB', sort_order: 2, is_active: 1 },
    { code: 'LCB-A2', name: 'Laem Chabang Terminal A2', group_name: 'LCB', sort_order: 3, is_active: 1 },
    { code: 'LCB-B1', name: 'Laem Chabang Terminal B1', group_name: 'LCB', sort_order: 4, is_active: 1 },
    { code: 'LCB-B2', name: 'Laem Chabang Terminal B2', group_name: 'LCB', sort_order: 5, is_active: 1 },
    { code: 'LCB-B3', name: 'Laem Chabang Terminal B3', group_name: 'LCB', sort_order: 6, is_active: 1 },
    { code: 'LCB-B4', name: 'Laem Chabang Terminal B4', group_name: 'LCB', sort_order: 7, is_active: 1 },
    { code: 'LCB-B5', name: 'Laem Chabang Terminal B5', group_name: 'LCB', sort_order: 8, is_active: 1 },
    { code: 'LCB-C0', name: 'Laem Chabang Terminal C0', group_name: 'LCB', sort_order: 9, is_active: 1 },
    { code: 'LCB-C1', name: 'Laem Chabang Terminal C1', group_name: 'LCB', sort_order: 10, is_active: 1 },
    { code: 'LCB-C2', name: 'Laem Chabang Terminal C2', group_name: 'LCB', sort_order: 11, is_active: 1 },
    { code: 'LCB-D1', name: 'Laem Chabang Terminal D1', group_name: 'LCB', sort_order: 12, is_active: 1 },
    { code: 'LCB-D2', name: 'Laem Chabang Terminal D2', group_name: 'LCB', sort_order: 13, is_active: 1 },
    { code: 'MTP-A', name: 'Map Ta Phut Terminal A', group_name: 'MTP', sort_order: 14, is_active: 1 },
    { code: 'MTP-B', name: 'Map Ta Phut Terminal B', group_name: 'MTP', sort_order: 15, is_active: 1 },
    { code: 'MTP-C', name: 'Map Ta Phut Terminal C', group_name: 'MTP', sort_order: 16, is_active: 1 },
    { code: 'BKK-PAT1', name: 'Bangkok Port Klong Toey Terminal 1', group_name: 'BKK', sort_order: 17, is_active: 1 },
    { code: 'BKK-PAT2', name: 'Bangkok Port Klong Toey Terminal 2', group_name: 'BKK', sort_order: 18, is_active: 1 },
    { code: 'SRH-A', name: 'Sriracha Harbour Terminal A', group_name: 'SRH', sort_order: 19, is_active: 1 },
    { code: 'SRH-B', name: 'Sriracha Harbour Terminal B', group_name: 'SRH', sort_order: 20, is_active: 1 },
  ];

  await knex('terminals').insert(terminals);
};
