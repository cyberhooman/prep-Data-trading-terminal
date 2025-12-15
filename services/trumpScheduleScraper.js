/**
 * Trump Schedule Scraper Service
 * Extracts official Trump schedule from RollCall FactBase
 * Data retained for 7 days
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

class TrumpScheduleScraper {
  constructor() {
    this.baseUrl = 'https://rollcall.com/factbase/trump/topic/calendar/';
    this.scheduleCache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour cache (schedule updates at midnight ET)
    this.retentionDays = 7; // Keep data for 1 week
    this.scheduleHistory = new Map();
    this.historyFile = path.join(__dirname, '../data/trump-schedule-history.json');
    this.browser = null;
    this.lastFetch = null;

    // Load history on startup
    this.loadHistory();
  }

  /**
   * Load schedule history from file
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        this.scheduleHistory = new Map(data.map(item => [item.id, item]));
        this.cleanOldData();
        console.log(`Loaded ${this.scheduleHistory.size} Trump schedule items from history`);
      }
    } catch (err) {
      console.error('Error loading Trump schedule history:', err.message);
      this.scheduleHistory = new Map();
    }
  }

  /**
   * Save schedule history to file
   */
  saveHistory() {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.scheduleHistory.values());
      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving Trump schedule history:', err.message);
    }
  }

  /**
   * Clean old data (older than retention period)
   */
  cleanOldData() {
    const cutoffDate = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    let removedCount = 0;

    for (const [id, item] of this.scheduleHistory) {
      if (item.firstSeenAt < cutoffDate) {
        this.scheduleHistory.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cleaned ${removedCount} old Trump schedule items`);
      this.saveHistory();
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
        const possiblePaths = [
          '/usr/bin/google-chrome-stable',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser'
        ];

        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            launchOptions.executablePath = path;
            break;
          }
        }
      }

      this.browser = await puppeteer.launch(launchOptions);
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Parse time string to ISO timestamp
   * Example: "9:00 AM" on "Monday, December 16 2025" → ISO string
   */
  parseScheduleTime(timeStr, dateStr) {
    try {
      // Parse date: "Monday, December 16 2025"
      const dateMatch = dateStr.match(/(\w+),\s+(\w+)\s+(\d+)\s+(\d{4})/);
      if (!dateMatch) return null;

      const [, , monthName, day, year] = dateMatch;
      const monthMap = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3,
        'May': 4, 'June': 5, 'July': 6, 'August': 7,
        'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      const month = monthMap[monthName];

      // Parse time: "9:00 AM" or "2:30 PM"
      const timeMatch = timeStr.match(/(\d+):(\d+)\s+(AM|PM)/);
      if (!timeMatch) return null;

      let [, hours, minutes, period] = timeMatch;
      hours = parseInt(hours);
      minutes = parseInt(minutes);

      // Convert to 24-hour format
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      // Create date in Eastern Time (UTC-5 or UTC-4 depending on DST)
      // For simplicity, use UTC-5 as base offset
      const date = new Date(Date.UTC(year, month, day, hours + 5, minutes));

      return date.toISOString();
    } catch (err) {
      console.error('Error parsing schedule time:', err.message);
      return null;
    }
  }

  /**
   * Check if event is a substantive schedule item (not press coordination)
   */
  isOfficialScheduleItem(text) {
    const lowerText = text.toLowerCase();

    // Skip press coordination items
    const skipPatterns = [
      'pool call time',
      'in-town pool',
      'travel pool',
      'full lid',
      'protective pool',
      'lid called',
      'out-of-town',
      'gathering time'
    ];

    for (const pattern of skipPatterns) {
      if (lowerText.includes(pattern)) {
        return false;
      }
    }

    // Must have substantive content
    return text.length > 10;
  }

  /**
   * Extract schedule items from page
   */
  async extractScheduleFromPage(page) {
    const scheduleItems = await page.evaluate(() => {
      const items = [];
      let currentDate = null;

      // Find all text nodes and headers
      const allElements = document.querySelectorAll('*');

      for (const element of allElements) {
        const text = element.textContent?.trim() || '';

        // Check if this is a date header
        const dateMatch = text.match(/^(\w+),\s+(\w+)\s+(\d+)\s+(\d{4})$/);
        if (dateMatch) {
          currentDate = text;
          continue;
        }

        // Check if this is an event entry (contains time pattern)
        const eventMatch = text.match(/^(\d+:\d+\s+(?:AM|PM))\s*[|\-]\s*(.+?)(?:\s*[|\-]\s*(.+))?$/);
        if (eventMatch && currentDate) {
          const [, time, description, location] = eventMatch;
          items.push({
            date: currentDate,
            time: time.trim(),
            description: description.trim(),
            location: location?.trim() || ''
          });
        }
      }

      return items;
    });

    return scheduleItems;
  }

  /**
   * Scrape Trump's official schedule
   */
  async scrapeSchedule() {
    console.log('Scraping Trump schedule from RollCall FactBase...');

    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Navigate to calendar page
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Extract schedule items
      const rawItems = await this.extractScheduleFromPage(page);

      await page.close();

      // Process and filter items
      const processedItems = [];
      for (const item of rawItems) {
        // Check if it's an official schedule item
        if (!this.isOfficialScheduleItem(item.description)) {
          continue;
        }

        // Parse timestamp
        const timestamp = this.parseScheduleTime(item.time, item.date);
        if (!timestamp) {
          continue;
        }

        // Create unique ID
        const id = `TRUMP-${new Date(timestamp).getTime()}-${item.description.slice(0, 20).replace(/\s+/g, '-')}`;

        // Check if already in history
        if (!this.scheduleHistory.has(id)) {
          const scheduleItem = {
            id,
            title: item.description,
            country: 'USD', // Fixed as USD per requirement
            date: timestamp,
            time: item.time,
            location: item.location,
            type: 'trump_schedule',
            source: 'RollCall FactBase',
            firstSeenAt: Date.now()
          };

          this.scheduleHistory.set(id, scheduleItem);
          processedItems.push(scheduleItem);
        }
      }

      // Save history
      if (processedItems.length > 0) {
        this.saveHistory();
        console.log(`Found ${processedItems.length} new Trump schedule items`);
      }

      // Update cache
      this.lastFetch = Date.now();
      this.scheduleCache = new Map(this.scheduleHistory);

      return Array.from(this.scheduleHistory.values());

    } catch (err) {
      console.error('Error scraping Trump schedule:', err.message);
      throw err;
    }
  }

  /**
   * Get all schedule items (with caching)
   */
  async getSchedule() {
    // Return cache if still valid
    if (this.lastFetch && (Date.now() - this.lastFetch < this.cacheTimeout)) {
      console.log('Returning cached Trump schedule');
      return Array.from(this.scheduleCache.values());
    }

    try {
      return await this.scrapeSchedule();
    } catch (err) {
      console.error('Failed to scrape Trump schedule, returning cached data:', err.message);
      // Return cached data even if expired on error
      return Array.from(this.scheduleCache.values());
    }
  }

  /**
   * Get upcoming schedule items (future events only)
   */
  async getUpcomingSchedule() {
    const allItems = await this.getSchedule();
    const now = Date.now();

    return allItems
      .filter(item => new Date(item.date).getTime() > now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}

// Export singleton instance
module.exports = new TrumpScheduleScraper();
