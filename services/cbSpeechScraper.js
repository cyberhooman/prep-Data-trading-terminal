/**
 * Central Bank Speech Scraper Service
 * Extracts CB speeches and press conferences from Financial Juice feed
 * Data retained for 1 week only
 */

const fs = require('fs');
const path = require('path');

class CBSpeechScraper {
  constructor() {
    this.speechCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.retentionDays = 7; // Keep data for 1 week
    this.cbContentHistory = new Map();
    this.historyFile = path.join(__dirname, '../data/cb-speech-history.json');

    // Central bank info for detection
    this.centralBanks = {
      'FED': {
        name: 'Federal Reserve',
        currency: 'USD',
        keywords: ['fed', 'fomc', 'federal reserve', 'powell', 'williams', 'waller', 'bowman', 'jefferson', 'cook', 'kugler', 'barr'],
        speakers: ['Powell', 'Williams', 'Waller', 'Bowman', 'Jefferson', 'Cook', 'Kugler', 'Barr']
      },
      'ECB': {
        name: 'European Central Bank',
        currency: 'EUR',
        keywords: ['ecb', 'european central bank', 'lagarde', 'de guindos', 'lane', 'schnabel', 'elderson', 'cipollone'],
        speakers: ['Lagarde', 'de Guindos', 'Lane', 'Schnabel', 'Elderson', 'Cipollone']
      },
      'BOE': {
        name: 'Bank of England',
        currency: 'GBP',
        keywords: ['boe', 'bank of england', 'bailey', 'broadbent', 'breeden', 'pill', 'greene', 'dhingra', 'mann', 'taylor', 'mpc'],
        speakers: ['Bailey', 'Broadbent', 'Breeden', 'Pill', 'Greene', 'Dhingra', 'Mann', 'Taylor']
      },
      'BOC': {
        name: 'Bank of Canada',
        currency: 'CAD',
        keywords: ['boc', 'bank of canada', 'macklem', 'rogers', 'kozicki', 'gravelle'],
        speakers: ['Macklem', 'Rogers', 'Kozicki', 'Gravelle']
      },
      'RBA': {
        name: 'Reserve Bank of Australia',
        currency: 'AUD',
        keywords: ['rba', 'reserve bank of australia', 'bullock', 'hauser', 'hunter', 'kent', 'jones'],
        speakers: ['Bullock', 'Hauser', 'Hunter', 'Kent', 'Jones']
      },
      'BOJ': {
        name: 'Bank of Japan',
        currency: 'JPY',
        keywords: ['boj', 'bank of japan', 'ueda', 'uchida', 'adachi', 'nakamura'],
        speakers: ['Ueda', 'Uchida', 'Adachi', 'Nakamura']
      },
      'SNB': {
        name: 'Swiss National Bank',
        currency: 'CHF',
        keywords: ['snb', 'swiss national bank', 'jordan', 'schlegel'],
        speakers: ['Jordan', 'Schlegel']
      },
      'RBNZ': {
        name: 'Reserve Bank of New Zealand',
        currency: 'NZD',
        keywords: ['rbnz', 'reserve bank of new zealand', 'orr', 'hawkesby'],
        speakers: ['Orr', 'Hawkesby']
      }
    };

    // Load history on startup
    this.loadHistory();
  }

  /**
   * Load CB content history from file
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        this.cbContentHistory = new Map(data.map(item => [item.id, item]));
        this.cleanOldData();
        console.log(`Loaded ${this.cbContentHistory.size} CB speech/press conf items from history`);
      }
    } catch (err) {
      console.error('Error loading CB history:', err.message);
      this.cbContentHistory = new Map();
    }
  }

  /**
   * Save CB content history to file
   */
  saveHistory() {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.cbContentHistory.values());
      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error saving CB history:', err.message);
    }
  }

  /**
   * Remove data older than 1 week
   */
  cleanOldData() {
    const oneWeekAgo = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    let removed = 0;

    for (const [id, item] of this.cbContentHistory.entries()) {
      const itemTime = item.firstSeenAt || new Date(item.date).getTime();
      if (itemTime < oneWeekAgo) {
        this.cbContentHistory.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`Cleaned ${removed} CB items older than 1 week`);
      this.saveHistory();
    }
  }

  /**
   * Detect which central bank a news item is about
   */
  detectCentralBank(text) {
    const lowerText = text.toLowerCase();

    for (const [bankCode, bank] of Object.entries(this.centralBanks)) {
      for (const keyword of bank.keywords) {
        if (lowerText.includes(keyword)) {
          return { bankCode, bank };
        }
      }
    }
    return null;
  }

  /**
   * Detect speaker from text
   */
  detectSpeaker(text, bank) {
    for (const speaker of bank.speakers) {
      if (text.toLowerCase().includes(speaker.toLowerCase())) {
        return speaker;
      }
    }
    return 'Central Bank Official';
  }

  /**
   * Determine if content is a speech or press conference
   */
  detectContentType(text) {
    const lower = text.toLowerCase();

    // Press conference indicators
    if (/press conference|presser|q\s*&\s*a|rate decision|interest rate decision|policy decision|monetary policy decision/i.test(lower)) {
      return 'press_conference';
    }

    // Speech indicators
    if (/speech|remarks|testimony|address|says|said|statement/i.test(lower)) {
      return 'speech';
    }

    return 'speech'; // Default to speech
  }

  /**
   * Check if news item is CB-related speech or press conference
   */
  isCBContent(newsItem) {
    const text = `${newsItem.headline} ${newsItem.rawText || ''}`;
    const lower = text.toLowerCase();

    // Must be related to a central bank
    const cbMatch = this.detectCentralBank(text);
    if (!cbMatch) return false;

    // Must explicitly be a speech, press conference, or direct statement from CB official
    // More strict filter: requires explicit speech/presser keywords or direct quotes from named officials
    const hasExplicitSpeechKeyword = /\b(speech|remarks|testimony|press conference|presser|minutes|statement)\b/i.test(lower);
    const hasDirectQuote = /\b(says|said|comments?|speaks?|interview)\b/i.test(lower) && this.detectSpeaker(text, cbMatch.bank);
    const hasRateDecision = /\b(rate decision|policy (decision|meeting)|monetary policy|interest rate)\b/i.test(lower);

    // Exclude general news about banks/countries even if they mention CB
    const isGeneralNews = /\b(stock|futures|equity|oil|import|export|trade|gdp|employment|cpi|inflation data|retail sales)\b/i.test(lower) && !hasExplicitSpeechKeyword;

    return (hasExplicitSpeechKeyword || hasDirectQuote || hasRateDecision) && !isGeneralNews;
  }

  /**
   * Extract CB content from Financial Juice news feed
   */
  extractCBContentFromFJ(fjNews) {
    const cbItems = [];

    for (const newsItem of fjNews) {
      if (!this.isCBContent(newsItem)) continue;

      const text = `${newsItem.headline} ${newsItem.rawText || ''}`;
      const cbMatch = this.detectCentralBank(text);
      if (!cbMatch) continue;

      const { bankCode, bank } = cbMatch;
      const speaker = this.detectSpeaker(text, bank);
      const contentType = this.detectContentType(text);

      // Parse date from FJ timestamp
      let date = new Date().toISOString().split('T')[0];
      if (newsItem.timestamp) {
        try {
          const parsed = new Date(newsItem.timestamp);
          if (!isNaN(parsed.getTime())) {
            date = parsed.toISOString().split('T')[0];
          }
        } catch (e) {}
      }

      const id = `FJ-${bankCode}-${Buffer.from(newsItem.headline).toString('base64').substring(0, 16)}`;

      cbItems.push({
        id,
        title: newsItem.headline,
        link: newsItem.link || null,
        description: (newsItem.rawText || '').substring(0, 300),
        date,
        timestamp: newsItem.timestamp,
        speaker,
        centralBank: bank.name,
        bankCode,
        currency: bank.currency,
        type: contentType,
        source: 'FinancialJuice',
        isCritical: newsItem.isCritical || false,
        isActive: newsItem.isActive || false,
        firstSeenAt: newsItem.firstSeenAt || Date.now()
      });
    }

    return cbItems;
  }

  /**
   * Fetch all CB speeches from Financial Juice
   * This is called from the API endpoint
   */
  async fetchAllSpeeches(fjScraper) {
    // Clean old data first
    this.cleanOldData();

    try {
      // Get news from Financial Juice
      const fjNews = await fjScraper.getLatestNews();

      // Extract CB-related content
      const cbItems = this.extractCBContentFromFJ(fjNews);

      // Add to history
      for (const item of cbItems) {
        if (!this.cbContentHistory.has(item.id)) {
          this.cbContentHistory.set(item.id, item);
        }
      }

      // Save history
      this.saveHistory();

      // Return all items from history (includes current + past week)
      const allItems = Array.from(this.cbContentHistory.values());

      // Filter for speeches only
      const speeches = allItems.filter(item => item.type === 'speech');

      // Sort by date descending
      speeches.sort((a, b) => new Date(b.date) - new Date(a.date));

      return speeches;
    } catch (err) {
      console.error('Error fetching CB speeches from FJ:', err.message);
      // Return cached history on error
      return Array.from(this.cbContentHistory.values())
        .filter(item => item.type === 'speech')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }

  /**
   * Fetch all press conferences from Financial Juice
   */
  async fetchAllPressConferences(fjScraper) {
    // Clean old data first
    this.cleanOldData();

    try {
      // Get news from Financial Juice
      const fjNews = await fjScraper.getLatestNews();

      // Extract CB-related content
      const cbItems = this.extractCBContentFromFJ(fjNews);

      // Add to history
      for (const item of cbItems) {
        if (!this.cbContentHistory.has(item.id)) {
          this.cbContentHistory.set(item.id, item);
        }
      }

      // Save history
      this.saveHistory();

      // Return all items from history
      const allItems = Array.from(this.cbContentHistory.values());

      // Filter for press conferences only
      const pressConfs = allItems.filter(item => item.type === 'press_conference');

      // Sort by date descending
      pressConfs.sort((a, b) => new Date(b.date) - new Date(a.date));

      return pressConfs;
    } catch (err) {
      console.error('Error fetching CB press conferences from FJ:', err.message);
      return Array.from(this.cbContentHistory.values())
        .filter(item => item.type === 'press_conference')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }

  /**
   * Fetch all CB content (speeches + press conferences)
   */
  async fetchAllContent(fjScraper) {
    // Clean old data first
    this.cleanOldData();

    try {
      // Get news from Financial Juice
      const fjNews = await fjScraper.getLatestNews();

      // Extract CB-related content
      const cbItems = this.extractCBContentFromFJ(fjNews);

      console.log(`Extracted ${cbItems.length} CB items from ${fjNews.length} FJ news items`);

      // Add to history
      for (const item of cbItems) {
        if (!this.cbContentHistory.has(item.id)) {
          this.cbContentHistory.set(item.id, item);
        }
      }

      // Save history
      this.saveHistory();

      // Return all items from history
      const allItems = Array.from(this.cbContentHistory.values());

      // Sort by date descending
      allItems.sort((a, b) => new Date(b.date) - new Date(a.date));

      return allItems;
    } catch (err) {
      console.error('Error fetching CB content from FJ:', err.message);
      return Array.from(this.cbContentHistory.values())
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }

  /**
   * Fetch speeches from a specific bank
   */
  async fetchSpeechesFromBank(bankCode, fjScraper) {
    const allContent = await this.fetchAllContent(fjScraper);
    return allContent.filter(item =>
      item.bankCode === bankCode && item.type === 'speech'
    );
  }

  /**
   * Fetch press conferences from a specific bank
   */
  async fetchPressConferencesFromBank(bankCode, fjScraper) {
    const allContent = await this.fetchAllContent(fjScraper);
    return allContent.filter(item =>
      item.bankCode === bankCode && item.type === 'press_conference'
    );
  }

  /**
   * Get available sources (central banks)
   */
  getSources() {
    return Object.entries(this.centralBanks).map(([code, bank]) => ({
      code,
      name: bank.name,
      currency: bank.currency
    }));
  }

  /**
   * Clear cache and history
   */
  clearCache() {
    this.speechCache.clear();
    this.cbContentHistory.clear();
    this.saveHistory();
  }
}

module.exports = new CBSpeechScraper();
