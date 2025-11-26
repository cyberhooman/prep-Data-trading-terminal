const puppeteer = require('puppeteer');

class FinancialJuiceScraper {
  constructor() {
    this.baseUrl = 'https://www.financialjuice.com';
    this.newsCache = [];
    this.lastFetch = null;
    this.cacheTimeout = 60000; // 1 minute cache
    this.browser = null;
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
   * Scrape high-impact news from FinancialJuice
   * Filters for red-flagged/important news items only
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

          // Check if this is a high-impact item using FinancialJuice's actual classes
          const isCritical = className.includes('active-critical');
          const isActive = className.includes('active');

          // Look for economic data patterns
          const hasEconomicData = text.match(/Actual|Forecast|Previous/i);

          // Look for charts/images
          const hasChart = element.querySelector('img, canvas, svg') !== null;

          // Only include critical/active items OR items with economic data OR items with charts
          if (!isCritical && !isActive && !hasEconomicData && !hasChart) {
            return;
          }

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

      console.log(`Found ${newsItems.length} news items before deduplication`);

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

      // Update cache
      this.newsCache = processedItems;
      this.lastFetch = Date.now();

      return processedItems;
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
   * Clear cache
   */
  clearCache() {
    this.newsCache = [];
    this.lastFetch = null;
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
