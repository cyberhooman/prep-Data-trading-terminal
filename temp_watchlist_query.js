const query = `query ($id: ID!) {
  watchlist(id: $id) {
    id
    name
    plot {
      period
      minTime
      maxTime
      minValue
      maxValue
      values
    }
  }
}`;
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query, variables:{id:"fxcm:forex"}})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
