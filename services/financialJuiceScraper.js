const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const database = require('./database');

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

class FinancialJuiceScraper {
  constructor() {
    this.baseUrl = 'https://www.financialjuice.com';
    this.newsCacheCritical = [];
    this.newsCacheAll = [];
    this.lastFetchCritical = null;
    this.lastFetchAll = null;
    this.cacheTimeout = 1 * 60 * 1000; // 1 minute cache - shorter to catch breaking news faster
    this.browser = null;
    this.isLoggedIn = false;
    this.newsHistory = new Map(); // Store news with first seen timestamp
    this.retentionDays = 7; // Keep news for 1 week (7 days)
    this.database = database;
    this.browserLaunchTime = null;
    this.browserMaxLifetime = 30 * 60 * 1000; // Restart browser every 30 minutes to prevent memory leaks

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

      // Clean up any non-critical news that was stored before the filter fix
      console.log('Cleaning up non-critical news items from history...');
      await this.database.deleteNonCriticalNews();

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
   * Close and cleanup browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        // Close all pages first to free memory
        const pages = await this.browser.pages();
        for (const p of pages) {
          try {
            await p.close();
          } catch (e) {}
        }
        await this.browser.close();
        console.log('Browser instance closed');
      } catch (error) {
        console.error('Error closing browser:', error.message);
      }
      this.browser = null;
      this.isLoggedIn = false;
      this.browserLaunchTime = null;
    }
  }

  /**
   * Initialize browser instance (reused across scrapes, auto-restart every 30 mins)
   */
  async getBrowser() {
    // Check if browser needs restart due to age
    const now = Date.now();
    if (this.browser && this.browserLaunchTime && (now - this.browserLaunchTime > this.browserMaxLifetime)) {
      console.log('Browser lifetime exceeded, restarting to free memory...');
      await this.closeBrowser();
    }

    if (!this.browser) {
      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--disable-notifications',
          '--disable-web-security',
          '--disable-features=site-per-process',
          '--single-process',
          '--no-zygote',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--js-flags="--max-old-space-size=256"' // Limit JS heap to 256MB
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
      this.browserLaunchTime = now;
      console.log('New browser instance launched with memory optimizations');
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
   * Scrape ALL news from FinancialJuice (for CB Speech extraction)
   * Does NOT filter by critical status
   */
  async scrapeAllNews() {
    return await this._scrapeNews({ filterCriticalOnly: false });
  }

  /**
   * Scrape high-impact news from FinancialJuice
   * Only includes critical (red border) items
   */
  async scrapeHighImpactNews() {
    return await this._scrapeNews({ filterCriticalOnly: true });
  }

  /**
   * Internal scraping method with configurable filtering
   */
  async _scrapeNews({ filterCriticalOnly = true }) {
    let page = null;

    try {
      // Check cache first - use separate cache for critical vs all news
      const lastFetch = filterCriticalOnly ? this.lastFetchCritical : this.lastFetchAll;
      const newsCache = filterCriticalOnly ? this.newsCacheCritical : this.newsCacheAll;

      if (lastFetch && Date.now() - lastFetch < this.cacheTimeout) {
        console.log(`Returning cached ${filterCriticalOnly ? 'critical' : 'all'} news data (${newsCache.length} items)`);
        return newsCache;
      }

      console.log(`Fetching fresh ${filterCriticalOnly ? 'critical' : 'all'} market news...`);
      const browser = await this.getBrowser();

      // Clean up any orphan pages from previous failed runs
      const existingPages = await browser.pages();
      if (existingPages.length > 1) {
        console.log(`Cleaning up ${existingPages.length - 1} orphan pages to free memory...`);
        for (let i = 1; i < existingPages.length; i++) {
          try {
            await existingPages[i].close();
          } catch (e) {}
        }
      }

      page = await browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to the page with relaxed wait conditions
      try {
        await page.goto(this.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 25000
        });
      } catch (navErr) {
        console.log('Navigation timeout - continuing with partial load', navErr.message);
        // Continue anyway - page may have loaded enough
      }

      // Wait for page to stabilize (reduced from 3s to 2s)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Force-close any login/signup modals by removing them from DOM
      console.log('Removing any modal overlays...');
      await page.evaluate(() => {
        document.querySelectorAll('.modal, .modal-backdrop, .modal-dialog').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = 'auto';
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Scroll to trigger lazy loading of feed items
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Wait for the news feed to appear (with reasonable timeout for JS rendering)
      try {
        await page.waitForSelector('.media.feedWrap', { timeout: 7000 });
        console.log('News feed loaded successfully');
      } catch (error) {
        console.log('News feed selector not found after 7s, continuing with fallback selectors...');
        // Continue - the feed may still load or be available via other selectors
      }

      // Scroll down multiple times to load more items (especially critical breaking news)
      // CRITICAL: Increase scroll iterations to ensure we don't miss late-breaking news
      const isLowMemory = process.env.LOW_MEMORY_MODE === 'true';
      const scrollIterations = isLowMemory ? 5 : 10; // Increased from 3/6 to 5/10
      const scrollDelay = isLowMemory ? 1200 : 1800; // Slightly faster scrolling

      console.log(`Scrolling to load more news items (${scrollIterations} iterations, ${scrollDelay}ms delay)...`);
      for (let i = 0; i < scrollIterations; i++) {
        try {
          await page.evaluate(() => {
            window.scrollBy(0, 600);
          });
          await new Promise(resolve => setTimeout(resolve, scrollDelay));
          console.log(`Scroll ${i + 1}/${scrollIterations} complete`);
        } catch (scrollErr) {
          console.log(`Scroll ${i + 1} error: ${scrollErr.message}, continuing...`);
        }
      }
      console.log('Finished scrolling, extracting news...');

      // Extract news items from the page
      const result = await page.evaluate((filterCriticalOnly) => {
        const items = [];
        const debugClasses = new Set(); // Track unique class combinations

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

          // CRITICAL DETECTION LOGIC - Multiple redundant checks to never miss critical news
          // FinancialJuice marks critical items with red backgrounds/borders
          const style = element.getAttribute('style') || '';
          const parentStyle = element.parentElement ? (element.parentElement.getAttribute('style') || '') : '';

          // Check computed styles for element and parent
          let computedBgColor = '';
          let computedBorderColor = '';
          let parentComputedBg = '';
          try {
            const computed = window.getComputedStyle(element);
            computedBgColor = computed.backgroundColor || '';
            computedBorderColor = computed.borderColor || '';

            if (element.parentElement) {
              const parentComputed = window.getComputedStyle(element.parentElement);
              parentComputedBg = parentComputed.backgroundColor || '';
            }
          } catch (e) {}

          // Enhanced red detection - check ALL possible red shades and formats
          const redPatterns = [
            'red', '#8B0000', '#B22222', '#DC143C', '#FF0000', '#CD5C5C',
            'rgb(139', 'rgb(178', 'rgb(220', 'rgb(255, 0, 0)', 'rgb(205',
            'rgba(139', 'rgba(178', 'rgba(220', 'rgba(255, 0, 0)', 'rgba(205',
            'darkred', 'firebrick', 'crimson'
          ];

          const hasRedInStyle = redPatterns.some(pattern =>
            style.toLowerCase().includes(pattern.toLowerCase())
          );

          const hasRedInParent = redPatterns.some(pattern =>
            parentStyle.toLowerCase().includes(pattern.toLowerCase())
          );

          const hasRedComputed = redPatterns.some(pattern =>
            computedBgColor.toLowerCase().includes(pattern.toLowerCase()) ||
            computedBorderColor.toLowerCase().includes(pattern.toLowerCase())
          );

          const hasRedInParentComputed = redPatterns.some(pattern =>
            parentComputedBg.toLowerCase().includes(pattern.toLowerCase())
          );

          // ============================================================================
          // CRITICAL NEWS DETECTION - RED MARK ONLY (5 DETECTION METHODS)
          // ONLY detect news with RED visual markers on FinancialJuice
          // ============================================================================
          // Layer 1: CSS Class markers
          const hasCriticalClass = className.includes('active-critical') ||
                                  className.includes('critical') ||
                                  className.includes('high-impact');

          // Layer 2: CRITICAL badge in text
          const hasCriticalBadge = text.includes('🔴 CRITICAL') ||
                                   text.includes('CRITICAL') ||
                                   element.querySelector('.critical-badge, .high-impact-badge');

          // Layer 3-5: Red color detection (inline styles, parent styles, computed styles)
          // Already computed above: hasRedInStyle, hasRedInParent, hasRedComputed, hasRedInParentComputed

          // Check if this is routine market data (settlements, futures contracts, MOO/MOC imbalance)
          // These should NEVER be marked critical even if they have red styling
          const isRoutineMarketData = (text.match(/\b(NYMEX|COMEX|futures?|settle[ds]?)\b/i) &&
                                       text.match(/\b(February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)) ||
                                       text.match(/\b(MOO|MOC)\s+(Imbalance|imbalance)\b/i);

          // Calculate critical flag, but exclude routine market data
          let isCritical = (hasCriticalClass || hasRedInStyle || hasRedInParent ||
                            hasRedComputed || hasRedInParentComputed || hasCriticalBadge) && !isRoutineMarketData;

          // DEBUG: Log when routine market data is being filtered out
          if ((hasCriticalClass || hasRedInStyle || hasRedInParent || hasRedComputed || hasRedInParentComputed || hasCriticalBadge) && isRoutineMarketData) {
            console.log(`🚫 EXCLUDED routine market data: ${text.substring(0, 80)}`);
          }

          // DEBUG: Log NYMEX items for investigation
          if ((hasCriticalClass || hasRedInStyle || hasRedInParent || hasRedComputed || hasRedInParentComputed || hasCriticalBadge) && text.toLowerCase().includes('nymex')) {
            console.log(`🔍 NYMEX item - Debug info:`);
            console.log(`  Headline: ${text.substring(0, 100)}`);
            console.log(`  isRoutineMarketData: ${isRoutineMarketData}`);
            console.log(`  isCritical (after filter): ${isCritical}`);
            console.log(`  hasCriticalClass: ${hasCriticalClass} (className: ${className})`);
            console.log(`  hasRedInStyle: ${hasRedInStyle}`);
            console.log(`  hasRedInParent: ${hasRedInParent}`);
            console.log(`  hasRedComputed: ${hasRedComputed} (bg: ${computedBgColor}, border: ${computedBorderColor})`);
            console.log(`  hasRedInParentComputed: ${hasRedInParentComputed}`);
            console.log(`  hasCriticalBadge: ${hasCriticalBadge}`);
          }

          // ============================================================================
          // HIGH-IMPACT KEYWORD DETECTION (SEPARATE FROM CRITICAL)
          // Market-moving events that should be tracked separately
          // ============================================================================
          const highImpactKeywords = [
            'supreme court', 'scotus', 'court ruling',
            'tariff', 'tariffs', 'trade war',
            'executive order', 'presidential decree',
            'emergency', 'breaking:', 'urgent:',
            'central bank decision', 'rate decision',
            'war', 'military action', 'invasion',
            'sanctions', 'embargo',
            'bankruptcy', 'default', 'bailout'
          ];

          const textLower = text.toLowerCase();
          const isHighImpact = highImpactKeywords.some(keyword =>
            textLower.includes(keyword)
          );

          // Debug: collect class names and styles for first 20 items to understand structure
          if (debugClasses.size < 20) {
            const bgInfo = computedBgColor ? `BG:${computedBgColor}` : 'BG:none';
            debugClasses.add(`Class:${className || 'none'}|Style:${style.substring(0, 40)}|${bgInfo}|Critical:${isCritical}`);
          }

          // If filterCriticalOnly is true, skip non-critical items
          if (filterCriticalOnly && !isCritical) {
            otherCount++;
            return;
          }

          // Track counts
          if (isCritical) {
            criticalCount++;
          } else {
            otherCount++;
          }

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
            isHighImpact: isHighImpact, // Market-moving keyword detection
            sentiment: sentiment, // 'bullish', 'bearish', or null
            className: className
          });
        });

        return {
          items,
          debug: {
            totalElements: elements.length,
            criticalCount,
            skippedCount: otherCount,
            selectorUsed,
            sampleClasses: Array.from(debugClasses)
          }
        };
      }, filterCriticalOnly);

      // Extract items and debug info
      const newsItems = result.items;
      console.log(`DEBUG: Selector used: "${result.debug.selectorUsed}"`);
      console.log(`DEBUG: Found ${result.debug.totalElements} elements matching selectors`);
      console.log(`DEBUG: Critical items (red border): ${result.debug.criticalCount}, Skipped (non-critical): ${result.debug.skippedCount}`);
      console.log(`DEBUG: Sample classes from first 20 items:`);
      result.debug.sampleClasses.forEach((cls, i) => {
        console.log(`  ${i + 1}. ${cls}`);
      });
      console.log(`Found ${newsItems.length} high-impact news items before deduplication`);

      // Log ALL critical headlines for debugging - CRITICAL to catch missed news
      const criticalItems = newsItems.filter(item => item.isCritical);
      if (criticalItems.length > 0) {
        console.log(`\n========== CRITICAL NEWS DETECTED: ${criticalItems.length} items ==========`);
        criticalItems.forEach((item, i) => {
          const timeStr = item.timestamp || 'no-time';
          console.log(`  ${i + 1}. [${timeStr}] ${item.headline.substring(0, 100)}`);
        });
        console.log(`=========================================================\n`);

        // SPECIFIC DEBUG: Check for Supreme Court / tariff news
        const supremeCourtNews = criticalItems.filter(item =>
          item.headline.toLowerCase().includes('supreme court') ||
          item.headline.toLowerCase().includes('tariff')
        );
        if (supremeCourtNews.length > 0) {
          console.log(`✅ CAPTURED Supreme Court/Tariff news: ${supremeCourtNews.length} items`);
        }
      } else {
        console.warn(`⚠️  WARNING: NO CRITICAL NEWS FOUND - This may indicate a scraping issue!`);
        console.warn(`   Total elements scanned: ${result.debug.totalElements}`);
        console.warn(`   Selector used: ${result.debug.selectorUsed}`);
      }

      // ADDITIONAL DEBUG: Check ALL news (including non-critical) for Supreme Court
      const allSupremeCourt = newsItems.filter(item =>
        item.headline.toLowerCase().includes('supreme court') ||
        item.headline.toLowerCase().includes('tariff')
      );
      if (allSupremeCourt.length > 0 && allSupremeCourt.some(item => !item.isCritical)) {
        console.warn(`⚠️  FOUND Supreme Court/Tariff news but NOT marked critical:`);
        allSupremeCourt.filter(item => !item.isCritical).forEach((item, i) => {
          console.warn(`  ${i + 1}. [${item.timestamp}] ${item.headline.substring(0, 100)}`);
          console.warn(`     isCritical: ${item.isCritical}, className: ${item.className}`);
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

      // FAILSAFE: Check if we're getting recent critical news
      const criticalProcessed = processedItems.filter(item => item.isCritical);
      if (criticalProcessed.length > 0) {
        const now = new Date();
        const recentCritical = criticalProcessed.filter(item => {
          if (!item.timestamp) return false;
          const itemTime = new Date(item.timestamp);
          const ageMinutes = (now - itemTime) / (1000 * 60);
          return ageMinutes <= 60; // Critical news from last hour
        });

        if (recentCritical.length > 0) {
          console.log(`✅ GOOD: Found ${recentCritical.length} critical news items from last hour`);
        } else {
          console.warn(`⚠️  WARNING: No critical news from last hour. Oldest critical news may be stale.`);
        }
      }

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

      // Update cache - use separate cache for critical vs all news
      if (filterCriticalOnly) {
        this.newsCacheCritical = allItems;
        this.lastFetchCritical = Date.now();
      } else {
        this.newsCacheAll = allItems;
        this.lastFetchAll = Date.now();
      }

      return allItems;
    } catch (error) {
      console.error('Error scraping news:', error.message);

      // If scraping fails, return cached data as fallback
      const fallbackCache = filterCriticalOnly ? this.newsCacheCritical : this.newsCacheAll;
      if (fallbackCache && fallbackCache.length > 0) {
        console.log(`Scraping failed, returning ${fallbackCache.length} cached items as fallback`);
        return fallbackCache;
      }

      // If no cache available, return empty array instead of throwing
      console.log('No cached data available, returning empty array');
      return [];
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (closeErr) {
          console.log('Error closing page:', closeErr.message);
        }
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
    this.newsCacheCritical = [];
    this.newsCacheAll = [];
    this.lastFetchCritical = null;
    this.lastFetchAll = null;
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
