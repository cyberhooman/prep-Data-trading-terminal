fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query:"query { __schema { types { name kind } } }"})
}).then(r=>r.json()).then(res=>{
  const types = res.data.__schema.types.filter(t=>/Indicator/i.test(t.name));
  console.log(types);
}).catch(err=>{console.error(err);process.exit(1);});
