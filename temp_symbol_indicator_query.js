const query = `query ($listId: ID!) {
  symbols(listId: $listId) {
    id
    name
    indicator(streamId: REAL_TIME, indicator: { name: "relative-performance", period: ONE_DAY }) {
      indicator {
        __typename
      }
      error
    }
  }
}`;
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query, variables:{listId:"fxcm:forex"}})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
