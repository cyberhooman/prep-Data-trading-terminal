const https = require('https');
const { URL } = require('url');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    };

    https.get(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          return reject(new Error(`Request failed (${res.statusCode}): ${raw}`));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function testFreeCurrencyAPIs() {
  console.log('Testing free currency APIs...\n');

  // Test 1: exchangerate-api.com (free, no key needed for USD base)
  try {
    console.log('1. Testing exchangerate-api.com...');
    const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
    console.log('✓ Success!');
    console.log('Sample rates:', {
      EUR: data.rates.EUR,
      GBP: data.rates.GBP,
      JPY: data.rates.JPY,
      CHF: data.rates.CHF,
      CAD: data.rates.CAD,
      AUD: data.rates.AUD,
      NZD: data.rates.NZD,
    });
    console.log('Last update:', data.time_last_update_utc);
  } catch (err) {
    console.log('✗ Failed:', err.message);
  }

  console.log('\n');

  // Test 2: frankfurter.app (ECB data, free)
  try {
    console.log('2. Testing frankfurter.app (ECB data)...');
    const data = await fetchJson('https://api.frankfurter.app/latest?from=USD');
    console.log('✓ Success!');
    console.log('Rates:', data.rates);
    console.log('Base:', data.base);
    console.log('Date:', data.date);
  } catch (err) {
    console.log('✗ Failed:', err.message);
  }

  console.log('\n');

  // Test 3: Get historical data to calculate 24h change
  try {
    console.log('3. Testing historical data (24h ago)...');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().split('T')[0];
    const data = await fetchJson(`https://api.frankfurter.app/${dateStr}?from=USD`);
    console.log('✓ Success!');
    console.log('Historical rates from', data.date);
    console.log('Sample:', {
      EUR: data.rates.EUR,
      GBP: data.rates.GBP,
      JPY: data.rates.JPY,
    });
  } catch (err) {
    console.log('✗ Failed:', err.message);
  }
}

testFreeCurrencyAPIs();
