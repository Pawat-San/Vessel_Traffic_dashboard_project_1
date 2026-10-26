const vm = require('vm');
const fs = require('fs');
const path = require('path');

function browserUtils() {
  let csv;
  const context = vm.createContext({
    window: { formatters: {} },
    localStorage: { getItem: () => null },
    document: { documentElement: { setAttribute() {} } },
    fetch: async () => ({ ok: false }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/js/utils.js'), 'utf8'), context);
  context.downloadCSV = (filename, text) => { csv = text; };
  return { context, exported: () => csv };
}

describe('Spreadsheet-safe CSV export', () => {
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '＝1+1', '＋1', '－1', '＠SUM(A1)'])('neutralizes formula/control prefixes (%#)', (value) => {
    const { context } = browserUtils();
    expect(context.csvCell(value)).toBe(`"\t${value}"`);
  });

  it('preserves ordinary values and safely quotes separators, newlines, and quotes', () => {
    const { context } = browserUtils();
    expect(context.csvCell('VESSEL "A", berth\nnext')).toBe('"VESSEL ""A"", berth\nnext"');
    expect(context.csvCell('042')).toBe('"042"');
    expect(context.csvCell(null)).toBe('""');
    expect(context.csvCell('Safe",=1+1')).toBe('"Safe"",=1+1"');
  });

  it('protects every user-controlled export column, including account display names', () => {
    const { context, exported } = browserUtils();
    context.window.utils.exportVesselsToCSV([{
      vessel_name: '=1+1', voy: '042', type: 'CNTN', terminal_code: '+1', activity: 'L',
      status: 'AT SEA', next_port: '@SUM(A1)', remark: 'Note "quoted", safely', updated_by_name: '-1',
    }]);
    const csv = exported();
    for (const value of ['=1+1', '+1', '@SUM(A1)', '-1']) expect(csv).toContain(`"\t${value}"`);
    expect(csv).toContain('"Note ""quoted"", safely"');
    expect(csv).toContain('"042"');
  });
});
