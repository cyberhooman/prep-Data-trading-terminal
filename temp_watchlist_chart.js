const query = `query ($listId: ID!) {
  watchlistChart(listId: $listId, normalize: false, period: ONE_DAY, streamId: REAL_TIME) {
    values { symbolId values }
    minValue
    maxValue
  }
}`;
const variables = { listId: "fxcm:forex" };
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query, variables})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
