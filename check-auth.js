const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function checkAuth() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto('https://www.financialjuice.com/home', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  const pageContent = await page.evaluate(() => {
    return {
      bodyText: document.body.innerText.substring(0, 500),
      hasLoginForm: !!document.querySelector('input[type="password"]'),
      hasSignupModal: document.body.innerText.includes('SIGN UP'),
      feedElements: document.querySelectorAll('.media.feedWrap').length,
      allText: document.body.innerText
    };
  });

  console.log('Body text preview:', pageContent.bodyText);
  console.log('Has login form:', pageContent.hasLoginForm);
  console.log('Has signup modal:', pageContent.hasSignupModal);
  console.log('Feed elements found:', pageContent.feedElements);
  console.log('\n--- Checking for auth messages ---');
  console.log('Contains "login":', pageContent.allText.toLowerCase().includes('login'));
  console.log('Contains "sign in":', pageContent.allText.toLowerCase().includes('sign in'));
  console.log('Contains "member":', pageContent.allText.toLowerCase().includes('member'));

  await browser.close();
}

checkAuth();
