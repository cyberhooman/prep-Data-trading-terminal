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
          return reject(new Error(`Request failed (${res.statusCode}): ${raw.substring(0, 200)}`));
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
const symbols = ['fxcm:AUD', 'fxcm:CAD', 'fxcm:CHF', 'fxcm:EUR', 'fxcm:GBP', 'fxcm:JPY', 'fxcm:NZD', 'fxcm:USD'];

console.log('Testing watchlistAnalytics API...\n');

// Try watchlistAnalytics query
fetchJson(MARKETMILK_API, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    operationName: 'GetWatchlistAnalytics',
    query: `query GetWatchlistAnalytics($listId: ID!, $period: Period!, $stream: Stream!) {
      watchlistAnalytics(listId: $listId, period: $period, stream: $stream) {
        symbolId
        strength
      }
    }`,
    variables: {
      listId: 'fxcm:forex',
      period: 'ONE_DAY',
      stream: 'REAL_TIME',
    },
  }),
})
.then(data => {
  console.log('✓ Success! watchlistAnalytics query result:');
  console.log(JSON.stringify(data, null, 2));

  if (data?.data?.watchlistAnalytics) {
    console.log('\n✓ Found currency strength data!');
    console.log('Number of currencies:', data.data.watchlistAnalytics.length);
  }
})
.catch(err => {
  console.error('✗ watchlistAnalytics error:', err.message);
  console.log('\nTrying alternate approach with symbolAnalytics...\n');

  // Try getting analytics for individual symbols
  return fetchJson(MARKETMILK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'GetSymbolAnalytics',
      query: `query GetSymbolAnalytics($symbolId: ID!, $period: Period!, $stream: Stream!) {
        symbolAnalytics(symbolId: $symbolId, period: $period, stream: $stream) {
          symbolId
          strength
        }
      }`,
      variables: {
        symbolId: 'fxcm:USD',
        period: 'ONE_DAY',
        stream: 'REAL_TIME',
      },
    }),
  })
  .then(data => {
    console.log('✓ symbolAnalytics query result:');
    console.log(JSON.stringify(data, null, 2));
  });
});
