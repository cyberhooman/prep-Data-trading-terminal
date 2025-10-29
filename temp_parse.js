const fs=require("fs");
const html=fs.readFileSync("marketmilk.html","utf8");
const match=html.match(/window.__APOLLO_STATE__=(\{.*?\});/s);
if(!match){console.error("no match");process.exit(1);}
const state=JSON.parse(match[1]);
const key='symbols({"listId":"fxcm:forex"})';
console.log(Object.keys(state['ROOT_QUERY']));
console.log(state['ROOT_QUERY'][key]);
