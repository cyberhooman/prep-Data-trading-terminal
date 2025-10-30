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

async function testWithStream() {
  console.log('Testing with streamId parameter...\n');

  try {
    // Test with REAL_TIME stream
    console.log('Attempting with REAL_TIME stream...');
    const data = await fetchJson(MARKETMILK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        operationName: 'GetWatchlistChart',
        query: `query GetWatchlistChart($listId: ID!, $period: Period!, $streamId: Stream!, $normalize: Boolean!) {
          watchlistChart(listId: $listId, period: $period, streamId: $streamId, normalize: $normalize) {
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
          streamId: 'REAL_TIME',
          normalize: false,
        },
      }),
    });

    const values = data?.data?.watchlistChart?.values || [];
    console.log(`Result: ${values.length} currencies found`);
    if (values.length > 0) {
      console.log('Sample data:', JSON.stringify(values.slice(0, 2), null, 2));
    }
    console.log('\nFull response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }

  // Also try getting individual currency data
  console.log('\n\nTrying individual symbol chart...');
  try {
    const symbolData = await fetchJson(MARKETMILK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: `query {
          symbolChart(symbolId: "fxcm:USD", period: ONE_DAY, streamId: REAL_TIME, limit: 1) {
            values {
              time
              value
            }
          }
        }`,
      }),
    });

    console.log('Symbol chart response:', JSON.stringify(symbolData, null, 2));
  } catch (err) {
    console.error('Symbol chart error:', err.message);
  }
}

testWithStream();
