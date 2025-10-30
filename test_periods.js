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
const FOREX_LIST_ID = 'fxcm:forex';
const periods = ['ONE_HOUR', 'ONE_DAY', 'ONE_WEEK', 'ONE_MONTH', 'THREE_MONTHS', 'ONE_YEAR'];

async function testPeriods() {
  console.log('Testing different periods for currency strength data...\n');

  for (const period of periods) {
    try {
      console.log(`Testing period: ${period}`);
      const data = await fetchJson(MARKETMILK_API, {
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
            period: period,
            normalize: false,
          },
        }),
      });

      const values = data?.data?.watchlistChart?.values || [];
      console.log(`  ✓ ${period}: ${values.length} currencies found`);
      if (values.length > 0) {
        console.log(`  Sample data:`, JSON.stringify(values[0], null, 2));
      }
      console.log('');
    } catch (err) {
      console.log(`  ✗ ${period}: Error - ${err.message}\n`);
    }
  }
}

testPeriods();
