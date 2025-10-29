const fs=require("fs");
const text=fs.readFileSync("marketmilk_index.js","utf8");
const matches=text.match(/[^\s"'`]*graphql[^\s"'`]*/gi) || [];
const unique=Array.from(new Set(matches));
console.log(unique);
