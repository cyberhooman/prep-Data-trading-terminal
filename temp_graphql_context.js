const fs=require("fs");
const text=fs.readFileSync("marketmilk_index.js","utf8");
const regex=/.{0,60}\/graphql.{0,60}/g;
let match;
while((match=regex.exec(text))){
  console.log(match[0]);
}
