const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const database = require('./database');

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

class FinancialJuiceScraper {
  constructor() {
    this.baseUrl = 'https://www.financialjuice.com';
    this.newsCache = [];
    this.lastFetch = null;
    this.cacheTimeout = 120000; // 2 minutes cache - capture real-time economic data releases
    this.browser = null;
    this.isLoggedIn = false;
    this.newsHistory = new Map(); // Store news with first seen timestamp
    this.retentionDays = 7; // Keep news for 1 week (7 days)
    this.database = database;

    // Initialize database and load history
    this.init();
  }

  /**
   * Initialize database and load history
   */
  async init() {
    try {
      // Create tables if in production mode
      await this.database.createNewsHistoryTable();

      // Load history from database or file
      await this.loadHistory();
    } catch (error) {
      console.error('Error initializing scraper:', error);
    }
  }

  /**
   * Load news history from database or file
   */
  async loadHistory() {
    try {
      const historyArray = await this.database.loadNewsHistory();

      // Convert array back to Map
      this.newsHistory = new Map(historyArray.map(item => [
        `${item.headline}-${item.timestamp}`,
        item
      ]));

      console.log(`Loaded ${this.newsHistory.size} news items from history`);
    } catch (error) {
      console.error('Error loading news history:', error.message);
      this.newsHistory = new Map();
    }
  }

  /**
   * Save news history to database or file
   */
  async saveHistory() {
    try {
      // Convert Map to array
      const historyArray = Array.from(this.newsHistory.values());

      await this.database.saveNewsHistory(historyArray);
    } catch (error) {
      console.error('Error saving news history:', error.message);
    }
  }

  /**
   * Initialize browser instance (reused across scrapes)
   */
  async getBrowser() {
    if (!this.browser) {
      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      };

      // Use Google Chrome on Railway (installed via deb package)
      if (process.env.NODE_ENV === 'production') {
        const fs = require('fs');
        const possiblePaths = [
          '/usr/bin/google-chrome-stable',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser'
        ];

        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            console.log(`Found browser at: ${path}`);
            launchOptions.executablePath = path;
            break;
          }
        }

        if (!launchOptions.executablePath) {
          console.error('No Chrome/Chromium executable found');
          throw new Error('Browser not found - check Railway apt packages');
        }
      }

      this.browser = await puppeteer.launch(launchOptions);
    }
    return this.browser;
  }

  /**
   * Login to FinancialJuice
   */
  async login(page) {
    const email = process.env.FINANCIALJUICE_EMAIL;
    const password = process.env.FINANCIALJUICE_PASSWORD;

    if (!email || !password) {
      console.log('No news source credentials configured');
      return false;
    }

    try {
      console.log('Attempting to login to news source...');

      // Wait for page to be fully loaded
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Click the Login button in the header to open the login modal
      console.log('Clicking Login button in header...');
      await page.evaluate(() => {
        const loginBtn = document.querySelector('.login-btn, a.login-btn');
        if (loginBtn) {
          loginBtn.click();
          return true;
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Take screenshot to see current state
      try {
        await page.screenshot({ path: 'login-attempt.png' });
      } catch (e) {}

      // Click the Sign In tab to make sure we're on login form (not sign up)
      console.log('Clicking Sign In tab...');
      await page.evaluate(() => {
        // Find and click the Sign In tab using its href
        const signInTab = document.querySelector('a[href=\"#LoginTab\"]');
        if (signInTab) {
          signInTab.click();
          return true;
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Now find the SIGN IN form fields inside #LoginTab
      console.log('Looking for SIGN IN form fields in #LoginTab...');

      // Find and fill the login form in #LoginTab
      const fillResult = await page.evaluate((emailValue, passwordValue) => {
        // Try to find the LoginTab container
        const loginTab = document.querySelector('#LoginTab');

        if (loginTab) {
          const emailInput = loginTab.querySelector('input[placeholder="Email"], input[type="email"]');
          const passwordInput = loginTab.querySelector('input[placeholder="Password"], input[type="password"]');

          if (emailInput && passwordInput) {
            emailInput.focus();
            emailInput.value = emailValue;
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            emailInput.dispatchEvent(new Event('change', { bubbles: true }));

            passwordInput.focus();
            passwordInput.value = passwordValue;
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

            return 'filled-in-LoginTab';
          }
        }

        // Fallback: find inputs not in SignUpTab
        const allEmails = document.querySelectorAll('input[placeholder="Email"]');
        for (const emailInput of allEmails) {
          const signUpTab = emailInput.closest('#SignUpTab');
          if (!signUpTab) {
            const parent = emailInput.closest('.tab-pane') || emailInput.parentElement.parentElement;
            const passwordInput = parent.querySelector('input[placeholder="Password"]');

            if (passwordInput) {
              emailInput.focus();
              emailInput.value = emailValue;
              emailInput.dispatchEvent(new Event('input', { bubbles: true }));

              passwordInput.focus();
              passwordInput.value = passwordValue;
              passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

              return 'filled-fallback';
            }
          }
        }

        return 'not-found';
      }, email, password);

      console.log('Form fill result:', fillResult);

      // Take screenshot after filling
      try {
        await page.screenshot({ path: 'login-filled.png' });
      } catch (e) {}

      // Small delay before clicking submit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Click the LOGIN button inside #LoginTab
      await page.evaluate(() => {
        // First try to find button in LoginTab
        const loginTab = document.querySelector('#LoginTab');
        if (loginTab) {
          const btn = loginTab.querySelector('button, input[type="submit"]');
          if (btn) {
            btn.click();
            return true;
          }
        }

        // Fallback: find any LOGIN button
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toUpperCase();
          if (text === 'LOGIN') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      console.log('Clicked LOGIN button');

      // Wait for login to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if login was successful by looking for news feed
      const pageContent = await page.content();
      const hasNewsFeed = pageContent.includes('feedWrap') || pageContent.includes('infinite-item') || pageContent.includes('headline-title');
      const stillHasLoginModal = await page.$('input[placeholder="Password"]:not([style*="display: none"])');

      if (hasNewsFeed || !stillHasLoginModal) {
        console.log('Login successful!');
        this.isLoggedIn = true;

        try {
          await page.screenshot({ path: 'login-success.png' });
        } catch (e) {}

        return true;
      }

      console.log('Login may have failed - checking for errors...');
      try {
        await page.screenshot({ path: 'login-failed.png' });
      } catch (e) {}
      return false;

    } catch (error) {
      console.error('Login error:', error.message);
      try {
        await page.screenshot({ path: 'login-error.png' });
      } catch (e) {}
      return false;
    }
  }

  /**
   * Scrape high-impact news from FinancialJuice
   * Includes both critical (red border) and active (high-impact) items
   */
  async scrapeHighImpactNews() {
    let page = null;
    try {
      // Check cache first
      if (this.lastFetch && Date.now() - this.lastFetch < this.cacheTimeout) {
        console.log('Returning cached news data');
        return this.newsCache;
      }

      console.log('Fetching fresh market news...');
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to the page
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for page to fully load
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Force-close any login/signup modals by removing them from DOM
      console.log('Removing any modal overlays...');
      await page.evaluate(() => {
        document.querySelectorAll('.modal, .modal-backdrop, .modal-dialog').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = 'auto';
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Scroll to trigger lazy loading of feed items
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Wait for the news feed to appear
      let feedLoaded = false;
      try {
        await page.waitForSelector('.media.feedWrap', { timeout: 10000 });
        console.log('News feed loaded successfully');
        feedLoaded = true;
      } catch (error) {
        console.log('News feed not found, taking debug screenshot...');
        try {
          await page.screenshot({ path: 'scraper-debug-failed.png' });
        } catch (err) {}
      }

      // Scroll down more to load additional items
      await page.evaluate(() => window.scrollBy(0, 1000));
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract news items from the page
      const result = await page.evaluate(() => {
        const items = [];

        // Try multiple selectors, prioritizing the most specific
        const selectors = [
          { selector: '.media.feedWrap', minExpected: 10 },  // Primary selector
          { selector: '.infinite-item', minExpected: 10 },   // Fallback 1
          { selector: '.media', minExpected: 10 },            // Fallback 2
          { selector: '[class*="feed"]', minExpected: 5 },    // Fallback 3
          { selector: '[class*="headline"]', minExpected: 5 } // Fallback 4
        ];

        let elements = [];
        let selectorUsed = 'none';

        // Try to use the selector that finds enough elements
        for (const { selector, minExpected } of selectors) {
          const found = Array.from(document.querySelectorAll(selector));
          if (found.length >= minExpected) {
            elements = found;
            selectorUsed = selector;
            break;
          } else if (found.length > 0 && elements.length === 0) {
            // Keep this as a last resort if no other selector works
            elements = found;
            selectorUsed = selector + ' (fallback)';
          }
        }

        // If no elements found with any selector, return empty
        if (elements.length === 0) {
          console.log('No elements found with any selector');
          return {
            items: [],
            debug: {
              totalElements: 0,
              criticalCount: 0,
              activeCount: 0,
              otherCount: 0,
              selectorUsed: 'none'
            }
          };
        }

        let criticalCount = 0;
        let activeCount = 0;
        let otherCount = 0;

        elements.forEach((element) => {
          const className = element.className || '';
          const text = element.innerText || element.textContent;

          // Skip if no meaningful text
          if (!text || text.trim().length < 10) return;

          // Skip navigation elements and non-news items
          if (className.includes('nav') || className.includes('navbar') ||
              text.includes('My News') || text.includes('Bonds\nCommodities')) {
            return;
          }

          // Skip Financial Juice feature sections (not actual news events)
          const fjFeatureSections = [
            'Mood Imbalance',
            'Morning Juice',
            'Europe Session Prep',
            'US Session',
            'Asian Session',
            'London Session',
            'Need to know'
          ];

          // Only check text here - headline is not yet defined at this point
          if (fjFeatureSections.some(section => text.includes(section))) {
            return;
          }

          // Check if this is a critical item (red border) or active (high-impact) item
          const isCritical = className.includes('active-critical');
          const isActive = className.includes('active');

          // Check for bullish/bearish sentiment indicators (triangle icons)
          let sentiment = null;
          const triangleIcon = element.querySelector('.fa-caret-up, .fa-caret-down, .triangle-up, .triangle-down, [class*="bullish"], [class*="bearish"]');
          if (triangleIcon) {
            const iconClass = triangleIcon.className || '';
            if (iconClass.includes('up') || iconClass.includes('bullish') || iconClass.includes('green')) {
              sentiment = 'bullish';
            } else if (iconClass.includes('down') || iconClass.includes('bearish') || iconClass.includes('red')) {
              sentiment = 'bearish';
            }
          }

          // Also check for text-based sentiment in the element
          if (!sentiment && text) {
            // Check for explicit bullish/bearish markers in text or classes
            if (text.match(/📈|🟢|▲|↑/g) || className.includes('bull')) {
              sentiment = 'bullish';
            } else if (text.match(/📉|🔴|▼|↓/g) || className.includes('bear')) {
              sentiment = 'bearish';
            }
          }

          if (isCritical) criticalCount++;
          else if (isActive) activeCount++;
          else otherCount++;

          // Include items that are either critical (red border) OR active (high-impact)
          // Also include regular news items for display (but mark them as not critical)
          // Skip promo/ad items
          if (text.includes('Join us and Go Real-time') || text.includes('GO PRO')) {
            return;
          }

          // Look for economic data patterns
          const hasEconomicData = text.match(/Actual|Forecast|Previous/i);

          // Look for charts/images (including background images)
          const hasChart = element.querySelector('img, canvas, svg') !== null;
          const hasBackgroundImage = element.querySelector('[style*="background-image"]') !== null;

          // Extract timestamp
          const timeElement = element.querySelector('.time');
          const timeText = timeElement ? timeElement.innerText.trim() : '';

          // Extract headline/title using FinancialJuice's actual structure
          // Try multiple selectors to catch different formats
          const headlineElement = element.querySelector('.headline-title-nolink, .headline-title, .headline, [class*="headline"]');
          let headline = '';

          if (headlineElement) {
            headline = headlineElement.innerText.trim();
          } else {
            // Fallback: extract first meaningful line from text
            const lines = text.split('\n').filter(line => line.trim().length > 10);
            headline = lines[0] || text.split('\n')[0];
          }

          // Clean up headline - remove time prefix if present
          headline = headline.replace(/^\d{1,2}:\d{2}\s+\w+\s+\d{1,2}\s*/, '').trim();

          // Extract economic data if present
          // Enhanced regex to accurately capture K/M/B/% suffixes with proper sign handling
          // Pattern matches: optional sign (+ or -), digits with decimals, and optional suffix (K/M/B or %)
          // Uses alternation to handle: 1) K/M/B not followed by letters, 2) % suffix, 3) plain numbers
          const actualMatch = text.match(/\bActual[:\s]+([\-+]?[0-9.]+[KMBkmb](?![a-zA-Z])|[\-+]?[0-9.]+%|[\-+]?[0-9.]+)/i);
          const forecastMatch = text.match(/\bForecast[:\s]+([\-+]?[0-9.]+[KMBkmb](?![a-zA-Z])|[\-+]?[0-9.]+%|[\-+]?[0-9.]+)/i);
          const previousMatch = text.match(/\bPrevious[:\s]+([\-+]?[0-9.]+[KMBkmb](?![a-zA-Z])|[\-+]?[0-9.]+%|[\-+]?[0-9.]+)/i);

          const economicData = {};
          if (actualMatch) {
            economicData.actual = actualMatch[1];
            // Log for debugging data accuracy issues
            console.log(`DEBUG: Extracted Actual="${actualMatch[1]}" from headline: "${headline.substring(0, 60)}..."`);
          }
          if (forecastMatch) economicData.forecast = forecastMatch[1];
          if (previousMatch) economicData.previous = previousMatch[1];

          // Extract tags/categories using FinancialJuice's actual structure
          const tagElements = element.querySelectorAll('.news-label');
          const tags = Array.from(tagElements).map(tag => tag.innerText.trim()).filter(t => t);

          // Extract link
          const linkElement = element.querySelector('a');
          const link = linkElement ? linkElement.href : null;

          items.push({
            headline: headline.trim(),
            timestamp: timeText,
            economicData: Object.keys(economicData).length > 0 ? economicData : null,
            tags: tags,
            hasChart: hasChart || hasBackgroundImage,
            link: link,
            rawText: text.trim(),
            isCritical: isCritical,
            isActive: isActive,
            sentiment: sentiment, // 'bullish', 'bearish', or null
            className: className
          });
        });

        return {
          items,
          debug: {
            totalElements: elements.length,
            criticalCount,
            activeCount,
            otherCount,
            selectorUsed
          }
        };
      });

      // Extract items and debug info
      const newsItems = result.items;
      console.log(`DEBUG: Selector used: "${result.debug.selectorUsed}"`);
      console.log(`DEBUG: Found ${result.debug.totalElements} elements matching selectors`);
      console.log(`DEBUG: Critical items: ${result.debug.criticalCount}, Active items: ${result.debug.activeCount}, Other: ${result.debug.otherCount}`);
      console.log(`Found ${newsItems.length} high-impact news items before deduplication`);

      // Log first 3 critical headlines for debugging
      const criticalItems = newsItems.filter(item => item.isCritical);
      if (criticalItems.length > 0) {
        console.log(`DEBUG: First ${Math.min(3, criticalItems.length)} critical headlines:`);
        criticalItems.slice(0, 3).forEach((item, i) => {
          console.log(`  ${i + 1}. ${item.headline.substring(0, 80)}`);
        });
      }

      // Deduplicate based on headline and timestamp
      const seen = new Set();
      const dedupedItems = newsItems.filter(item => {
        const key = `${item.headline}-${item.timestamp}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      console.log(`Found ${dedupedItems.length} unique high-impact news items`);

      // Process timestamps
      const processedItems = dedupedItems.map(item => ({
        ...item,
        timestamp: this.parseTimestamp(item.timestamp),
        scrapedAt: new Date().toISOString()
      }));

      // Merge with historical items (keep for 1 week)
      const now = Date.now();
      const oneWeekAgo = now - (this.retentionDays * 24 * 60 * 60 * 1000);

      // Add new items to history with first seen timestamp
      // Filter out items containing promotional branding
      processedItems.forEach(item => {
        const key = `${item.headline}-${item.timestamp}`;
        const text = `${item.headline} ${item.rawText || ''}`.toLowerCase();

        // Skip items containing promotional branding
        if (text.includes('financialjuice') || text.includes('financial juice')) {
          return;
        }

        if (!this.newsHistory.has(key)) {
          this.newsHistory.set(key, {
            ...item,
            firstSeenAt: now
          });
        }
      });

      // Remove items older than 1 week from history
      for (const [key, item] of this.newsHistory.entries()) {
        if (item.firstSeenAt < oneWeekAgo) {
          this.newsHistory.delete(key);
        }
      }

      // Return all items from history (includes current + items from last week)
      const allItems = Array.from(this.newsHistory.values());

      // Sort by first seen timestamp (newest first)
      allItems.sort((a, b) => b.firstSeenAt - a.firstSeenAt);

      console.log(`Returning ${allItems.length} items (including ${allItems.length - processedItems.length} from history)`);

      // Save history to file
      this.saveHistory();

      // Update cache
      this.newsCache = allItems;
      this.lastFetch = Date.now();

      return allItems;
    } catch (error) {
      console.error('Error scraping news:', error.message);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Parse timestamp from various formats
   */
  parseTimestamp(timeText) {
    if (!timeText) return null;

    try {
      // Handle formats like "20:30 Nov 25", "0:00 Nov 26", etc.
      const match = timeText.match(/(\d{1,2}:\d{2})\s+(\w+)\s+(\d{1,2})/);
      if (match) {
        const [_, time, month, day] = match;
        const year = new Date().getFullYear();
        const monthMap = {
          'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
          'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
        };
        const [hours, minutes] = time.split(':');
        const date = new Date(year, monthMap[month], parseInt(day), parseInt(hours), parseInt(minutes));
        return date.toISOString();
      }

      // Try to parse as standard date
      const date = new Date(timeText);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (error) {
      console.error('Error parsing timestamp:', error.message);
    }

    return timeText;
  }

  /**
   * Get latest high-impact news (with cache)
   */
  async getLatestNews() {
    return await this.scrapeHighImpactNews();
  }

  /**
   * Clear cache and history
   */
  clearCache() {
    this.newsCache = [];
    this.lastFetch = null;
    this.newsHistory.clear();
    this.saveHistory(); // Save empty history to file
  }

  /**
   * Close browser instance
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new FinancialJuiceScraper();
