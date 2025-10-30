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

// Try different list IDs
const listIds = [
  'fxcm:forex',
  'fxcm:currencies',
  'fxcm:fx',
  'forex',
  'currencies'
];

async function testListIds() {
  console.log('Testing different list IDs...\n');

  for (const listId of listIds) {
    try {
      console.log(`Testing listId: ${listId}`);

      // First try to get symbols for this list
      const symbolsData = await fetchJson(MARKETMILK_API, {
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
            listId: listId,
          },
        }),
      });

      const symbols = symbolsData?.data?.symbols || [];
      console.log(`  Symbols: ${symbols.length} found`);
      if (symbols.length > 0) {
        console.log(`  First symbol:`, symbols[0]);

        // Now try to get chart data for this list
        const chartData = await fetchJson(MARKETMILK_API, {
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
              listId: listId,
              period: 'ONE_DAY',
              normalize: false,
            },
          }),
        });

        const values = chartData?.data?.watchlistChart?.values || [];
        console.log(`  Chart values: ${values.length} currencies with data`);
        if (values.length > 0) {
          console.log(`  Sample:`, values[0]);
        }
      }
      console.log('');
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}\n`);
    }
  }
}

testListIds();
