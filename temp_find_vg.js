const fs=require("fs");
const text=fs.readFileSync("marketmilk_index.js","utf8");
const idx=text.indexOf("vg=");
console.log("index", idx);
console.log(text.slice(idx-100, idx+100));
