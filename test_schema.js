const https = require('https');
const { URL } = require('url');

function fetchJson(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      method,
      headers,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      port: urlObj.port || 443,
    };

    const req = https.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Request failed (${res.statusCode}): ${raw}`));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const MARKETMILK_API = 'https://marketmilk.babypips.com/api';

async function exploreSchema() {
  console.log('Exploring MarketMilk GraphQL Schema...\n');

  // Query for available query fields
  const data = await fetchJson(MARKETMILK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query: `{
        __schema {
          queryType {
            name
            fields {
              name
              description
              args {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        }
      }`,
    }),
  });

  console.log('Available Query Fields:');
  const fields = data?.data?.__schema?.queryType?.fields || [];
  fields.forEach(field => {
    console.log(`\n  ${field.name}`);
    if (field.description) {
      console.log(`    Description: ${field.description}`);
    }
    if (field.args && field.args.length > 0) {
      console.log(`    Arguments:`);
      field.args.forEach(arg => {
        console.log(`      - ${arg.name} (${arg.type.name || arg.type.kind})`);
      });
    }
  });
}

exploreSchema().catch(err => console.error('Error:', err.message));
