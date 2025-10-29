const typeName = process.argv[2];
if(!typeName){
  console.error("Type name required");
  process.exit(1);
}
const typeFields = `
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
        ofType {
          name
          kind
        }
      }
    }
  }
`;
fetch("https://marketmilk.babypips.com/api",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({
    query:`query ($name: String!) {
      __type(name: $name) {
        name
        kind
        fields {
          name
          args { name type { ${typeFields} } }
          type { ${typeFields} }
        }
        inputFields { name type { ${typeFields} } }
        enumValues { name }
      }
    }`,
    variables:{ name: typeName }
  })
}).then(r=>r.json()).then(res=>{
  console.log(JSON.stringify(res,null,2));
}).catch(err=>{console.error(err);process.exit(1);});
