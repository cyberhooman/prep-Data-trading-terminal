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

async function testWithIndicators() {
  console.log('Testing with indicators parameter...\n');

  try {
    const data = await fetchJson(MARKETMILK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        operationName: 'GetWatchlistChart',
        query: `query GetWatchlistChart($listId: ID!, $period: Period, $streamId: Stream, $normalize: Boolean!, $indicators: [Indicator!]) {
          watchlistChart(listId: $listId, period: $period, streamId: $streamId, normalize: $normalize, indicators: $indicators) {
            period
            minTime
            maxTime
            minValue
            maxValue
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
          indicators: [{
            key: 'change',
            fields: ['raw', 'pct']
          }]
        },
      }),
    });

    console.log('Full response:', JSON.stringify(data, null, 2));

    const values = data?.data?.watchlistChart?.values || [];
    console.log(`\nResult: ${values.length} currencies found`);
    if (values.length > 0) {
      console.log('Sample data:', values[0]);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testWithIndicators();
