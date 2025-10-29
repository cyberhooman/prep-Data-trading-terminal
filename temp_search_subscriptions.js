const fs=require("fs");
const text=fs.readFileSync("marketmilk_index.js","utf8");
const idx=text.indexOf("/api/subscriptions");
console.log("index", idx);
console.log(text.slice(idx-200, idx+200));
