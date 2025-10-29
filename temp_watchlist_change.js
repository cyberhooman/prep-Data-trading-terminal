const query = `query ($listId: ID!, $period: Period!, $stream: Stream!) {
  watchlistChart(listId: $listId, indicators: [{ name: "change", fields: ["pct"] }], normalize: false, period: $period, streamId: $stream) {
    values { symbolId values }
    minValue
    maxValue
  }
}`;
const variables = { listId: "fxcm:forex", period: "ONE_DAY", stream: "REAL_TIME" };
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query, variables})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
