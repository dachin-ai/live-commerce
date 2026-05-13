const http = require('http');
const d = JSON.stringify({email:'admin@example.com',password:'123456'});
const r = http.request({hostname:'localhost',port:3000,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json'}}, res => {
  let b=''; res.on('data',c=>b+=c);
  res.on('end',()=>{
    const t=JSON.parse(b).token;
    http.get({hostname:'localhost',port:3000,path:'/api/stores',headers:{'Authorization':'Bearer '+t}}, r2 => {
      let b2=''; r2.on('data',c=>b2+=c);
      r2.on('end',()=>{
        console.log('Stores raw:', b2.slice(0, 500));
        const parsed = JSON.parse(b2);
        const stores = Array.isArray(parsed) ? parsed : (parsed.stores || parsed.data || [parsed]);
        stores.forEach(x => console.log(x.id, '|', x.name));
        if (stores.length > 0) {
          const sid = stores[0].id;
          // Check history for this store
          http.get({hostname:'localhost',port:3000,path:'/api/tt-import/history?storeId='+sid,headers:{'Authorization':'Bearer '+t}}, r3 => {
            let b3=''; r3.on('data',c=>b3+=c);
            r3.on('end',()=>{
              const h=JSON.parse(b3);
              console.log('\nHistory for store', sid, ':', h.length, 'imports');
              h.forEach(x => console.log('  ', x.dataTypeLabel, x.recordCount));
            });
          });
        }
        // Also check storeId=undefined (where we accidentally imported)
        http.get({hostname:'localhost',port:3000,path:'/api/tt-import/history?storeId=undefined',headers:{'Authorization':'Bearer '+t}}, r4 => {
          let b4=''; r4.on('data',c=>b4+=c);
          r4.on('end',()=>{
            const h2=JSON.parse(b4);
            console.log('\nHistory for storeId=undefined:', h2.length, 'imports');
            h2.forEach(x => console.log('  ', x.dataTypeLabel, x.recordCount));
          });
        });
      });
    });
  });
});
r.write(d); r.end();
