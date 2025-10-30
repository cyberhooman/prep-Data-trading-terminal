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
        console.log('Status:', res.statusCode);
        console.log('Raw response (first 500 chars):', raw.substring(0, 500));
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
const FOREX_LIST_ID = 'fxcm:forex';

console.log('Testing currency strength API...\n');

// Try using symbols query instead, since that's what's in the HTML
console.log('Attempting symbols query...\n');

fetchJson(MARKETMILK_API, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    operationName: 'GetSymbols',
    query: `query GetSymbols($listId: ID!) {
      symbols(listId: $listId) {
        id
        name
        title
      }
    }`,
    variables: {
      listId: FOREX_LIST_ID,
    },
  }),
})
.then(data => {
  console.log('✓ Symbols query result:');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n');
  return Promise.resolve();
})
.catch(err => {
  console.error('✗ Symbols query error:', err.message);
  console.log('\n');
  return Promise.resolve();
})
.then(() => fetchJson(MARKETMILK_API, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    query: `{
      watchlistChartData: __type(name: "WatchlistChartData") {
        name
        fields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
      watchlistChartDataValues: __type(name: "WatchlistChartDataValues") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }`,
  }),
}))
.then(data => {
  console.log('\n✓ Schema introspection result:');
  console.log(JSON.stringify(data, null, 2));

  console.log('\n\nNow testing watchlistChart with correct fields...\n');

  // Use the correct nested structure
  return fetchJson(MARKETMILK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'GetWatchlistChart',
      query: `query GetWatchlistChart($listId: ID!, $period: Period!, $normalize: Boolean!) {
        watchlistChart(listId: $listId, period: $period, normalize: $normalize) {
          period
          values {
            symbolId
            values
          }
        }
      }`,
      variables: {
        listId: FOREX_LIST_ID,
        period: 'ONE_DAY',
        normalize: false,
      },
    }),
  });
})
.then(data => {
  console.log('\n✓ Currency data query success!');
  console.log('\nFull response structure:');
  console.log(JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error('\n✗ Error:', err.message);

  // Try one more time with even simpler query
  console.log('\nTrying simplified query...\n');
  return fetchJson(MARKETMILK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query: `query {
        watchlistChart(listId: "fxcm:forex", normalize: false) {
          __typename
        }
      }`,
    }),
  })
  .then(data => {
    console.log('Typename query result:', JSON.stringify(data, null, 2));
  });
});
