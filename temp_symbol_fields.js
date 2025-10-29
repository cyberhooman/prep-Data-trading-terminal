fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query:"query { __type(name: \"Symbol\") { fields { name } } }"})
}).then(r=>r.json()).then(res=>{
  console.log(res.data.__type.fields.map(f=>f.name));
}).catch(err=>{console.error(err);process.exit(1);});
