const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class FinancialJuiceScraper {
  constructor() {
    this.baseUrl = 'https://www.financialjuice.com';
    this.newsCache = [];
    this.lastFetch = null;
    this.cacheTimeout = 60000; // 1 minute cache
    this.browser = null;
    this.newsHistory = new Map(); // Store news with first seen timestamp
    this.retentionDays = 2; // Keep news for 2 days
    this.historyFile = path.join(__dirname, '..', 'data', 'news-history.json');

    // Load history from file on startup
    this.loadHistory();
  }

  /**
   * Load news history from file
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf8');
        const historyArray = JSON.parse(data);

        // Convert array back to Map
        this.newsHistory = new Map(historyArray.map(item => [
          `${item.headline}-${item.timestamp}`,
          item
        ]));

        // Clean up old items (older than 2 days)
        const now = Date.now();
        const twoDaysAgo = now - (this.retentionDays * 24 * 60 * 60 * 1000);

        for (const [key, item] of this.newsHistory.entries()) {
          if (item.firstSeenAt < twoDaysAgo) {
            this.newsHistory.delete(key);
          }
        }

        console.log(`Loaded ${this.newsHistory.size} news items from history`);
      }
    } catch (error) {
      console.error('Error loading news history:', error.message);
      this.newsHistory = new Map();
    }
  }

  /**
   * Save news history to file
   */
  saveHistory() {
    try {
      // Ensure data directory exists
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Convert Map to array for JSON serialization
      const historyArray = Array.from(this.newsHistory.values());

      fs.writeFileSync(this.historyFile, JSON.stringify(historyArray, null, 2), 'utf8');
      console.log(`Saved ${historyArray.length} news items to history file`);
    } catch (error) {
      console.error('Error saving news history:', error.message);
    }
  }

  /**
   * Initialize browser instance (reused across scrapes)
   */
  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Scrape ONLY red-bordered critical news from FinancialJuice
   * Filters for active-critical class (red border indicators) only
   */
  async scrapeHighImpactNews() {
    let page = null;
    try {
      // Check cache first
      if (this.lastFetch && Date.now() - this.lastFetch < this.cacheTimeout) {
        console.log('Returning cached news data');
        return this.newsCache;
      }

      console.log('Fetching fresh news from FinancialJuice...');
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate to the page
      await page.goto(`${this.baseUrl}/home`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract news items from the page
      const newsItems = await page.evaluate(() => {
        const items = [];

        // Use the actual FinancialJuice class names
        // Look for feed items, prioritizing critical/active items
        const elements = Array.from(document.querySelectorAll('.media.feedWrap, .infinite-item.headline-item'));

        elements.forEach((element) => {
          const className = element.className || '';
          const text = element.innerText || element.textContent;

          // Skip if no meaningful text
          if (!text || text.trim().length < 10) return;

          // Check if this is a critical item (red border) using FinancialJuice's actual classes
          const isCritical = className.includes('active-critical');

          // ONLY include items with red borders (active-critical class)
          if (!isCritical) {
            return;
          }

          const isActive = className.includes('active');

          // Look for economic data patterns
          const hasEconomicData = text.match(/Actual|Forecast|Previous/i);

          // Look for charts/images
          const hasChart = element.querySelector('img, canvas, svg') !== null;

          // Extract timestamp
          const timeElement = element.querySelector('.time');
          const timeText = timeElement ? timeElement.innerText.trim() : '';

          // Extract headline/title using FinancialJuice's actual structure
          const headlineElement = element.querySelector('.headline-title-nolink, .headline-title');
          const headline = headlineElement ? headlineElement.innerText.trim() : text.split('\n')[0];

          // Extract economic data if present
          const actualMatch = text.match(/Actual[:\s]+([0-9.%\-+]+)/i);
          const forecastMatch = text.match(/Forecast[:\s]+([0-9.%\-+]+)/i);
          const previousMatch = text.match(/Previous[:\s]+([0-9.%\-+]+)/i);

          const economicData = {};
          if (actualMatch) economicData.actual = actualMatch[1];
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
            hasChart: hasChart,
            link: link,
            rawText: text.trim(),
            isCritical: isCritical,
            isActive: isActive,
            className: className
          });
        });

        return items;
      });

      console.log(`Found ${newsItems.length} red-bordered critical news items before deduplication`);

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

      console.log(`Found ${dedupedItems.length} unique red-bordered critical news items`);

      // Process timestamps
      const processedItems = dedupedItems.map(item => ({
        ...item,
        timestamp: this.parseTimestamp(item.timestamp),
        scrapedAt: new Date().toISOString()
      }));

      // Merge with historical items (keep for 2 days)
      const now = Date.now();
      const twoDaysAgo = now - (this.retentionDays * 24 * 60 * 60 * 1000);

      // Add new items to history with first seen timestamp
      processedItems.forEach(item => {
        const key = `${item.headline}-${item.timestamp}`;
        if (!this.newsHistory.has(key)) {
          this.newsHistory.set(key, {
            ...item,
            firstSeenAt: now
          });
        }
      });

      // Remove items older than 2 days from history
      for (const [key, item] of this.newsHistory.entries()) {
        if (item.firstSeenAt < twoDaysAgo) {
          this.newsHistory.delete(key);
        }
      }

      // Return all items from history (includes current + items from last 2 days)
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
      console.error('Error scraping FinancialJuice:', error.message);
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
