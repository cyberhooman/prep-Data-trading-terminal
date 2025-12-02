/**
 * Detailed diagnostic to see actual news items
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function diagnoseDetailed() {
  let browser = null;
  let page = null;

  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to FinancialJuice...');
    await page.goto('https://www.financialjuice.com/home', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Waiting for content...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get detailed info about the news items
    const items = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('.media.feedWrap'));

      return elements.slice(0, 10).map((el, index) => {
        const className = el.className || '';
        const text = el.innerText || el.textContent || '';

        // Check for headline elements
        const headlineEl = el.querySelector('.headline-title-nolink, .headline-title, [class*="headline"]');
        const headline = headlineEl ? headlineEl.innerText : '';

        // Check for time elements
        const timeEl = el.querySelector('.time, [class*="time"]');
        const time = timeEl ? timeEl.innerText : '';

        return {
          index,
          className,
          textLength: text.length,
          textPreview: text.substring(0, 200),
          headline: headline.substring(0, 100),
          time,
          hasActiveCritical: className.includes('active-critical'),
          hasActive: className.includes('active'),
          allClasses: className.split(' ').filter(c => c)
        };
      });
    });

    console.log('\n=== News Items Analysis ===\n');
    items.forEach(item => {
      console.log(`Item ${item.index + 1}:`);
      console.log(`  All classes: ${item.allClasses.join(', ')}`);
      console.log(`  Has 'active-critical': ${item.hasActiveCritical}`);
      console.log(`  Has 'active': ${item.hasActive}`);
      console.log(`  Text length: ${item.textLength} chars`);
      console.log(`  Headline: ${item.headline || 'NOT FOUND'}`);
      console.log(`  Time: ${item.time || 'NOT FOUND'}`);
      console.log(`  Text preview: ${item.textPreview.substring(0, 150)}...`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

diagnoseDetailed();
