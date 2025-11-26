/**
 * Debug script to see the actual HTML structure of news items
 */

const puppeteer = require('puppeteer');

async function debugNewsStructure() {
  console.log('Debugging FinancialJuice news item structure...\n');

  let browser = null;
  let page = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto('https://www.financialjuice.com/home', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get detailed structure of first few news items
    const newsStructure = await page.evaluate(() => {
      const feedItems = document.querySelectorAll('.media.feedWrap');
      const results = [];

      for (let i = 0; i < Math.min(3, feedItems.length); i++) {
        const item = feedItems[i];
        results.push({
          index: i,
          outerHTML: item.outerHTML.substring(0, 1000),
          className: item.className,
          innerText: item.innerText.trim(),
          childrenInfo: Array.from(item.children).map(child => ({
            tag: child.tagName,
            className: child.className,
            text: child.innerText?.substring(0, 200)
          }))
        });
      }

      return results;
    });

    console.log('=== News Feed Items Structure ===\n');
    newsStructure.forEach(item => {
      console.log(`\n--- Item ${item.index + 1} ---`);
      console.log('Class Name:', item.className);
      console.log('\nInner Text:');
      console.log(item.innerText);
      console.log('\nChildren:');
      item.childrenInfo.forEach((child, i) => {
        console.log(`  ${i + 1}. <${child.tag}> class="${child.className}"`);
        if (child.text) console.log(`     Text: ${child.text}`);
      });
      console.log('\nHTML (first 1000 chars):');
      console.log(item.outerHTML);
      console.log('\n' + '='.repeat(80));
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugNewsStructure();
