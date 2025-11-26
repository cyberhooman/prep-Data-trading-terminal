/**
 * Test script for FinancialJuice scraper
 */

const scraper = require('./services/financialJuiceScraper');

async function testScraper() {
  console.log('Testing FinancialJuice scraper...\n');

  try {
    const news = await scraper.getLatestNews();

    console.log(`✓ Scraper executed successfully`);
    console.log(`✓ Found ${news.length} high-impact news items\n`);

    if (news.length > 0) {
      console.log('Sample news items:\n');
      news.slice(0, 5).forEach((item, index) => {
        console.log(`--- Item ${index + 1} ---`);
        console.log(`Headline: ${item.headline}`);
        console.log(`Timestamp: ${item.timestamp}`);
        console.log(`Has Chart: ${item.hasChart}`);
        if (item.economicData) {
          console.log(`Economic Data:`, item.economicData);
        }
        if (item.tags.length > 0) {
          console.log(`Tags: ${item.tags.join(', ')}`);
        }
        console.log(`Link: ${item.link || 'N/A'}`);
        console.log();
      });
    } else {
      console.log('⚠ Warning: No news items found. This might mean:');
      console.log('  1. The site structure has changed');
      console.log('  2. There are no high-impact news at the moment');
      console.log('  3. The selectors need adjustment\n');
      console.log('Debug info: Run the scraper with verbose logging to see what was found.');
    }

  } catch (error) {
    console.error('✗ Error testing scraper:');
    console.error(error.message);
    console.error('\nFull error:', error);
  }
}

testScraper();
