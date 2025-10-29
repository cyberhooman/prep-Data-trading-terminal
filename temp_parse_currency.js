const fs=require("fs");
const html=fs.readFileSync("currency_strength.html","utf8");
const match=html.match(/window.__APOLLO_STATE__=(\{.*?\});/s);
if(!match){console.error("no match");process.exit(1);}
const state=JSON.parse(match[1]);
console.log(Object.keys(state).length);
console.log(Object.keys(state).slice(0,50));
const currencyEntries=Object.entries(state).filter(([k,v])=>typeof v==='object' && v && Object.keys(v).some(key=>key.toLowerCase().includes('strength')));
console.log('entries with strength-like fields',currencyEntries.length);
for(const [k,v] of currencyEntries){console.log(k,Object.keys(v));}
