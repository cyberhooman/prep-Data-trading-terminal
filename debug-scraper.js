/**
 * Debug script to inspect FinancialJuice page structure
 */

const puppeteer = require('puppeteer');

async function debugScraper() {
  console.log('Debugging FinancialJuice page structure...\n');

  let browser = null;
  let page = null;

  try {
    browser = await puppeteer.launch({
      headless: false, // Show browser so we can see what's happening
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

    // Take screenshot
    await page.screenshot({ path: 'financialjuice-debug.png', fullPage: true });
    console.log('✓ Screenshot saved to financialjuice-debug.png');

    // Get page HTML structure
    const pageInfo = await page.evaluate(() => {
      // Find all elements with red-ish backgrounds
      const redElements = [];
      document.querySelectorAll('*').forEach(el => {
        const bgColor = window.getComputedStyle(el).backgroundColor;
        if (bgColor && (
          bgColor.includes('rgb(255') ||
          bgColor.includes('rgb(220') ||
          bgColor.includes('rgb(200') && bgColor.match(/rgb\((\d+),\s*(\d+)/) && parseInt(RegExp.$1) > parseInt(RegExp.$2)
        )) {
          const text = el.innerText || el.textContent;
          if (text && text.trim().length > 20) {
            redElements.push({
              tag: el.tagName,
              class: el.className,
              id: el.id,
              bgColor: bgColor,
              text: text.trim().substring(0, 200)
            });
          }
        }
      });

      // Find elements with economic data
      const economicElements = [];
      const body = document.body.innerText;
      const matches = body.matchAll(/(Actual|Forecast|Previous)[:\s]+([0-9.%\-+]+)/gi);
      for (const match of matches) {
        economicElements.push(match[0]);
      }

      return {
        title: document.title,
        url: window.location.href,
        bodyLength: document.body.innerText.length,
        redElementCount: redElements.length,
        redElements: redElements.slice(0, 5),
        economicDataCount: economicElements.length,
        economicData: economicElements.slice(0, 10),
        allClasses: [...new Set(Array.from(document.querySelectorAll('[class*="news"], [class*="feed"], [class*="item"]')).map(el => el.className))].slice(0, 20)
      };
    });

    console.log('\n=== Page Info ===');
    console.log('Title:', pageInfo.title);
    console.log('URL:', pageInfo.url);
    console.log('Body text length:', pageInfo.bodyLength);
    console.log('\n=== Red Background Elements ===');
    console.log('Found:', pageInfo.redElementCount);
    pageInfo.redElements.forEach((el, i) => {
      console.log(`\nElement ${i + 1}:`);
      console.log('  Tag:', el.tag);
      console.log('  Class:', el.class);
      console.log('  Background:', el.bgColor);
      console.log('  Text:', el.text);
    });

    console.log('\n=== Economic Data ===');
    console.log('Found:', pageInfo.economicDataCount);
    pageInfo.economicData.forEach((data, i) => {
      console.log(`  ${i + 1}. ${data}`);
    });

    console.log('\n=== Common Classes ===');
    pageInfo.allClasses.forEach(cls => {
      console.log('  -', cls);
    });

    console.log('\n\nBrowser window will stay open for 10 seconds so you can inspect...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugScraper();
