const http = require('http');
const fs = require('fs');

const LOGIN = {email:'admin@example.com',password:'123456'};
const FILES = [
  'D:/Work space/lvbcsym/docs/数据范式/4.13最近28天直播数据.xlsx',
  'D:/Work space/lvbcsym/docs/数据范式/广告消耗 2026-04-06 00 ~ 2026-04-12 23.xlsx',
  'D:/Work space/lvbcsym/docs/数据范式/近28天店铺产品数据.xlsx',
  'D:/Work space/lvbcsym/docs/数据范式/4月6-12号产品数据明细.xlsx',
];

function httpReq(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({status: res.statusCode, body: d}));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeMultipart(fields, fileField) {
  const boundary = 'B' + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`);
  }
  const preamble = parts.join('\r\n') + '\r\n' +
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--\r\n`;
  const buf = Buffer.concat([Buffer.from(preamble), fileField.buffer, Buffer.from(epilogue)]);
  return { boundary, buf };
}

(async () => {
  // Login
  const lr = await httpReq({hostname:'localhost',port:3000,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json'}}, JSON.stringify(LOGIN));
  const token = JSON.parse(lr.body).token;
  console.log('Login:', token ? 'OK' : 'FAIL');

  // Get store - API returns {items: [...]}
  const sr = await httpReq({hostname:'localhost',port:3000,path:'/api/stores',method:'GET',headers:{'Authorization':'Bearer '+token}});
  const storeData = JSON.parse(sr.body);
  const stores = storeData.items || storeData;
  const sid = stores[0]?.id;
  console.log('StoreId:', sid);
  console.log('StoreName:', stores[0]?.name);

  // Delete old bad imports (storeId=undefined)
  const hr0 = await httpReq({hostname:'localhost',port:3000,path:'/api/tt-import/history?storeId=undefined',method:'GET',headers:{'Authorization':'Bearer '+token}});
  const oldImports = JSON.parse(hr0.body);
  for (const imp of oldImports) {
    const dr = await httpReq({hostname:'localhost',port:3000,path:'/api/tt-import/'+imp.id,method:'DELETE',headers:{'Authorization':'Bearer '+token}});
    console.log('Deleted old import:', imp.dataTypeLabel, dr.status);
  }

  // Commit all files with correct storeId
  console.log('\n=== COMMIT WITH CORRECT STORE ===');
  for (const fp of FILES) {
    const fn = fp.split('/').pop();
    const buf = fs.readFileSync(fp);
    const fields = {storeId: sid};
    if (fn.includes('广告')) { fields.dateFrom = '2026-04-06'; fields.dateTo = '2026-04-12'; }
    const {boundary, buf: body} = makeMultipart(fields, {name:'file',filename:fn,buffer:buf});
    const r = await httpReq({hostname:'localhost',port:3000,path:'/api/tt-import/commit',method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':body.length}}, body);
    try {
      const d = JSON.parse(r.body);
      console.log(`[${r.status}] ${d.dataTypeLabel || d.message} | records=${d.recordCount} | ${d.dateFrom}~${d.dateTo}`);
    } catch(e) { console.log(`[${r.status}] RAW:`, r.body.slice(0,300)); }
  }

  // Verify history
  console.log('\n=== VERIFY ===');
  const hr = await httpReq({hostname:'localhost',port:3000,path:'/api/tt-import/history?storeId='+sid,method:'GET',headers:{'Authorization':'Bearer '+token}});
  const history = JSON.parse(hr.body);
  console.log(`Total imports: ${history.length}`);
  history.forEach(h => console.log(`  ${h.dataTypeLabel} | ${h.recordCount}行 | ${h.dateFrom}~${h.dateTo}`));
})().catch(e => console.error('FATAL:', e));
