fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({query:`query { __type(name: "Query") { fields { name } } }`})
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{
  console.error(err);
  process.exit(1);
});
