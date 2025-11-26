/**
 * Detailed debug script to inspect ALL feed items
 */

const puppeteer = require('puppeteer');

async function debugDetailedScraper() {
  console.log('Detailed inspection of FinancialJuice feed items...\n');

  let browser = null;
  let page = null;

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('Navigating to FinancialJuice...');
    await page.goto('https://www.financialjuice.com/home', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get ALL feed items
    const feedItems = await page.evaluate(() => {
      const items = [];

      // Try multiple selectors
      const selectors = [
        '.media.feedWrap',
        '.infinite-item.headline-item',
        '.feedWrap',
        '[class*="feed"]'
      ];

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${elements.length} elements`);
      });

      // Get all feedWrap elements
      const elements = document.querySelectorAll('.media.feedWrap, .infinite-item.headline-item');

      elements.forEach((el, index) => {
        const text = el.innerText || el.textContent;
        const className = el.className || '';

        // Get computed styles
        const style = window.getComputedStyle(el);
        const bgColor = style.backgroundColor;
        const borderColor = style.borderLeftColor || style.borderColor;
        const borderWidth = style.borderLeftWidth || style.borderWidth;

        // Check for red-ish colors
        const hasRedBg = bgColor && (bgColor.includes('rgb(255') || bgColor.includes('rgb(220') || bgColor.includes('rgb(200'));
        const hasRedBorder = borderColor && (borderColor.includes('rgb(255') || borderColor.includes('rgb(220') || borderColor.includes('rgb(200'));

        items.push({
          index: index + 1,
          className: className,
          text: text.trim().substring(0, 150),
          bgColor: bgColor,
          borderColor: borderColor,
          borderWidth: borderWidth,
          hasRedBg: hasRedBg,
          hasRedBorder: hasRedBorder,
          hasEconomicData: text.match(/Actual|Forecast|Previous/i) ? true : false
        });
      });

      return items;
    });

    console.log(`\n=== Found ${feedItems.length} Feed Items ===\n`);

    feedItems.forEach(item => {
      console.log(`--- Item ${item.index} ---`);
      console.log(`Class: ${item.className}`);
      console.log(`Text: ${item.text}`);
      console.log(`Background: ${item.bgColor}`);
      console.log(`Border: ${item.borderColor} (${item.borderWidth})`);
      console.log(`Has Red BG: ${item.hasRedBg}`);
      console.log(`Has Red Border: ${item.hasRedBorder}`);
      console.log(`Has Economic Data: ${item.hasEconomicData}`);
      console.log('');
    });

    // Also check if there are any elements with 'critical' or 'active' in their class
    const criticalElements = await page.evaluate(() => {
      const critical = [];
      document.querySelectorAll('[class*="critical"], [class*="active"]').forEach(el => {
        const text = (el.innerText || el.textContent).trim();
        if (text.length > 20) {
          critical.push({
            className: el.className,
            text: text.substring(0, 150)
          });
        }
      });
      return critical;
    });

    console.log(`\n=== Elements with "critical" or "active" in class (${criticalElements.length}) ===\n`);
    criticalElements.forEach((el, i) => {
      console.log(`${i + 1}. Class: ${el.className}`);
      console.log(`   Text: ${el.text}\n`);
    });

    console.log('\nBrowser window will stay open for 15 seconds so you can inspect...');
    await new Promise(resolve => setTimeout(resolve, 15000));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugDetailedScraper();
