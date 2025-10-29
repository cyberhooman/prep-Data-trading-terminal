const query = `query { symbols(listId: \"fxcm:forex\") { id name title aggregate overview(stream: REAL_TIME, period: ONE_DAY) { change percentageChange } } }`;
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
