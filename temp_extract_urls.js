const fs=require("fs");
const text=fs.readFileSync("marketmilk_index.js","utf8");
const urls=new Set();
const regex=/(https?:\/\/[^"'`]+)(?=["'`])/g;
let match;
while((match=regex.exec(text))){
  urls.add(match[1]);
}
console.log(Array.from(urls));
