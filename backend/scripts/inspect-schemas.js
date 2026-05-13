const XLSX = require('xlsx');
const dir = 'D:/Work space/lvbcsym/docs/数据范式/';

// 直播数据
const wb1 = XLSX.readFile(dir + '4.13最近28天直播数据.xlsx');
const ws1 = wb1.Sheets['Sheet1'];
const d1 = XLSX.utils.sheet_to_json(ws1, { header: 1 });
console.log('=== 直播数据 前5行 ===');
d1.slice(0,5).forEach((r,i) => console.log('Row'+i+':', JSON.stringify(r)));

// 店铺产品数据
const wb3 = XLSX.readFile(dir + '近28天店铺产品数据.xlsx');
const ws3 = wb3.Sheets['Sheet1'];
const d3 = XLSX.utils.sheet_to_json(ws3, { header: 1 });
console.log('\n=== 店铺产品数据 前5行 ===');
d3.slice(0,5).forEach((r,i) => console.log('Row'+i+':', JSON.stringify(r)));

// 产品数据明细
const wb4 = XLSX.readFile(dir + '4月6-12号产品数据明细.xlsx');
const ws4 = wb4.Sheets['Sheet 1'];
const d4 = XLSX.utils.sheet_to_json(ws4, { header: 1 });
console.log('\n=== 产品数据明细 前5行 ===');
d4.slice(0,5).forEach((r,i) => console.log('Row'+i+':', JSON.stringify(r)));
