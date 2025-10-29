const query = `query {
  watchlist(id: "fxcm:forex") {
    plot(key: "currency-strength", x: { name: "currency-strength", period: ONE_DAY }, y: { name: "currency-strength", period: ONE_DAY }, normalize: false, limit: 1) {
      minValue
    }
  }
}`;
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
