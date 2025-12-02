/**
 * Diagnostic script to understand what's on the FinancialJuice page
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function diagnosePage() {
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

    // Take screenshot
    const screenshotPath = 'financialjuice-diagnostic.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Get page info
    const info = await page.evaluate(() => {
      const selectors = [
        '.media.feedWrap',
        '.infinite-item',
        '.media',
        '[class*="feed"]',
        '[class*="headline"]',
        'article',
        'div'
      ];

      const results = {};
      selectors.forEach(sel => {
        const elements = document.querySelectorAll(sel);
        results[sel] = elements.length;
      });

      // Get all class names in the page
      const allElements = document.querySelectorAll('*');
      const classNames = new Set();
      allElements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach(cls => {
            if (cls) classNames.add(cls);
          });
        }
      });

      return {
        title: document.title,
        url: window.location.href,
        bodyLength: document.body ? document.body.innerText.length : 0,
        selectorCounts: results,
        sampleClasses: Array.from(classNames).slice(0, 50),
        totalElements: allElements.length
      };
    });

    console.log('\n=== Page Diagnostic Info ===');
    console.log('Title:', info.title);
    console.log('URL:', info.url);
    console.log('Body text length:', info.bodyLength);
    console.log('Total elements:', info.totalElements);

    console.log('\n=== Selector Counts ===');
    Object.entries(info.selectorCounts).forEach(([sel, count]) => {
      console.log(`  ${sel}: ${count} elements`);
    });

    console.log('\n=== Sample Class Names (first 50) ===');
    info.sampleClasses.forEach(cls => console.log(`  ${cls}`));

    // Save detailed results to file
    fs.writeFileSync('diagnostic-results.json', JSON.stringify(info, null, 2));
    console.log('\nDetailed results saved to diagnostic-results.json');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

diagnosePage();
