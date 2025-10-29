const query = `query {
  __type(name: "Symbol") {
    fields {
      name
      args {
        name
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
      type {
        name
        kind
        ofType {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
}`;
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({query})
}).then(r=>r.json()).then(res=>{
  const indicatorField = res.data.__type.fields.find(f=>f.name==='indicator');
  console.log(JSON.stringify(indicatorField,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
