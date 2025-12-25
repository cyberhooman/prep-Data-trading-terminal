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

    // Central bank info for detection - EXPANDED speaker lists
    this.centralBanks = {
      'FED': {
        name: 'Federal Reserve',
        currency: 'USD',
        keywords: ['fed', 'fomc', 'federal reserve', 'powell', 'williams', 'waller', 'bowman', 'jefferson', 'cook', 'kugler', 'barr', 'miran', 'goolsbee', 'harker', 'bostic', 'daly', 'kashkari', 'mester', 'collins', 'logan', 'barkin', 'hammack', 'schmid'],
        speakers: ['Powell', 'Williams', 'Waller', 'Bowman', 'Jefferson', 'Cook', 'Kugler', 'Barr', 'Miran', 'Goolsbee', 'Harker', 'Bostic', 'Daly', 'Kashkari', 'Mester', 'Collins', 'Logan', 'Barkin', 'Hammack', 'Schmid']
      },
      'ECB': {
        name: 'European Central Bank',
        currency: 'EUR',
        keywords: ['ecb', 'european central bank', 'lagarde', 'de guindos', 'lane', 'schnabel', 'elderson', 'cipollone', 'centeno', 'wunsch', 'kazaks', 'villeroy', 'nagel', 'holzmann', 'knot', 'simkus', 'muller', 'vujcic', 'rehn'],
        speakers: ['Lagarde', 'de Guindos', 'Lane', 'Schnabel', 'Elderson', 'Cipollone', 'Centeno', 'Wunsch', 'Kazaks', 'Villeroy', 'Nagel', 'Holzmann', 'Knot', 'Simkus', 'Muller', 'Vujcic', 'Rehn']
      },
      'BOE': {
        name: 'Bank of England',
        currency: 'GBP',
        keywords: ['boe', 'bank of england', 'bailey', 'broadbent', 'breeden', 'pill', 'greene', 'dhingra', 'mann', 'taylor', 'mpc', 'ramsden', 'lombardelli'],
        speakers: ['Bailey', 'Broadbent', 'Breeden', 'Pill', 'Greene', 'Dhingra', 'Mann', 'Taylor', 'Ramsden', 'Lombardelli']
      },
      'BOC': {
        name: 'Bank of Canada',
        currency: 'CAD',
        keywords: ['boc', 'bank of canada', 'macklem', 'rogers', 'kozicki', 'gravelle', 'beaudry'],
        speakers: ['Macklem', 'Rogers', 'Kozicki', 'Gravelle', 'Beaudry']
      },
      'RBA': {
        name: 'Reserve Bank of Australia',
        currency: 'AUD',
        keywords: ['rba', 'reserve bank of australia', 'bullock', 'hauser', 'hunter', 'kent', 'jones', 'kohler'],
        speakers: ['Bullock', 'Hauser', 'Hunter', 'Kent', 'Jones', 'Kohler']
      },
      'BOJ': {
        name: 'Bank of Japan',
        currency: 'JPY',
        keywords: ['boj', 'bank of japan', 'ueda', 'uchida', 'adachi', 'nakamura', 'himino', 'tamura', 'nakagawa', 'noguchi', 'takata'],
        speakers: ['Ueda', 'Uchida', 'Adachi', 'Nakamura', 'Himino', 'Tamura', 'Nakagawa', 'Noguchi', 'Takata']
      },
      'SNB': {
        name: 'Swiss National Bank',
        currency: 'CHF',
        keywords: ['snb', 'swiss national bank', 'jordan', 'schlegel', 'maechler', 'moser'],
        speakers: ['Jordan', 'Schlegel', 'Maechler', 'Moser']
      },
      'RBNZ': {
        name: 'Reserve Bank of New Zealand',
        currency: 'NZD',
        keywords: ['rbnz', 'reserve bank of new zealand', 'orr', 'hawkesby', 'silk', 'conway'],
        speakers: ['Orr', 'Hawkesby', 'Silk', 'Conway']
      },
      'TRUMP': {
        name: 'White House / Trump',
        currency: 'USD',
        keywords: ['trump', 'white house', 'president trump', 'potus', 'bessent', 'treasury secretary', 'lutnick', 'tariff', 'tariffs'],
        speakers: ['Trump', 'Bessent', 'Lutnick'],
        isTrump: true
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
   * Determine if content is a speech, press conference, or Trump statement
   */
  detectContentType(text, bankCode = null) {
    const lower = text.toLowerCase();

    // Trump content - distinguish between schedule items and statements
    if (bankCode === 'TRUMP') {
      if (/tariff|trade|policy|executive order|announce/i.test(lower)) {
        return 'trump_policy';
      }
      if (/schedule|meeting|event|travel/i.test(lower)) {
        return 'trump_schedule';
      }
      return 'trump_statement';
    }

    // Press conference indicators
    if (/press conference|presser|q\s*&\s*a|rate decision|interest rate decision|policy decision|monetary policy decision/i.test(lower)) {
      return 'press_conference';
    }

    // Speech indicators
    if (/speech|remarks|testimony|address|says|said|statement|hearing|panel/i.test(lower)) {
      return 'speech';
    }

    // Scheduled future speeches
    if (/scheduled|upcoming|to speak|will speak|due to/i.test(lower)) {
      return 'scheduled_speech';
    }

    return 'speech'; // Default to speech
  }

  /**
   * Check if news item is CB-related speech or press conference
   * RELAXED filtering to capture more speeches
   */
  isCBContent(newsItem) {
    const text = `${newsItem.headline} ${newsItem.rawText || ''}`;
    const lower = text.toLowerCase();

    // Must be related to a central bank or Trump/White House
    const cbMatch = this.detectCentralBank(text);
    if (!cbMatch) return false;

    // EXCLUDE only actual promotional links (but ALLOW "upcoming" and "scheduled" - those ARE announcements)
    const isPromotionalLink = /\b(watch live|live stream|live now|livestream|click here|subscribe)\b/i.test(lower);
    const isJustTimingInfo = /^\s*\w+['']s\s+\w+\s+speaks?\s*\([0-9:]+\s*(et|gmt|utc|est|edt)\s*\)\s*$/i.test(text.trim());
    const isTooShort = text.trim().length < 20; // Reduced threshold - some headlines are brief but valid

    if (isPromotionalLink || isJustTimingInfo || isTooShort) {
      return false;
    }

    // TRUMP/WHITE HOUSE special handling - tariff and trade announcements ARE market-moving
    if (cbMatch.bank.isTrump) {
      const hasTrumpContent = /\b(tariff|trade|economy|fed|rate|dollar|china|canada|mexico|eu|import|export|deal|policy|executive order|announce|said|says|will|plan|threat|warn)\b/i.test(lower);
      return hasTrumpContent;
    }

    // EXPANDED speech detection patterns
    const hasExplicitSpeechKeyword = /\b(speech|remarks|testimony|press conference|presser|minutes|statement|address|hearing|panel|forum|summit|conference|q&a|qa)\b/i.test(lower);

    // Direct quotes from officials (says, said, comments, warns, expects, believes, sees)
    const hasDirectQuote = /\b(says|said|comments?|interview|warns?|expects?|believes?|sees?|told|tells|thinks?|noting|noted|argues?|explained?|announced?|confirmed?)\b/i.test(lower) && this.detectSpeaker(text, cbMatch.bank) !== 'Central Bank Official';

    // "Speaker: statement" format (e.g., "Fed's Miran: I haven't decided...")
    const hasColonQuote = /\b(fed's|ecb's|boe's|boc's|rba's|boj's|snb's|rbnz's|trump's?|bessent's?)\s+\w+:/i.test(lower) ||
                          (cbMatch.bank.speakers.some(speaker => new RegExp(`\\b${speaker}\\s*:`, 'i').test(text)));

    // Rate decisions and policy content
    const hasRateDecision = /\b(rate decision|policy (decision|meeting)|monetary policy|interest rate|hawkish|dovish|hike|cut|pause|hold)\b/i.test(lower);

    // Upcoming/scheduled speeches - these ARE valid announcements
    const hasScheduledSpeech = /\b(scheduled|upcoming|to speak|will speak|set to|slated|due to speak|expected to)\b/i.test(lower);

    // Official mentions "to discuss", "on economy", "at event"
    const hasOfficialActivity = /\b(to discuss|on (the )?economy|at (the )?(event|conference|summit|meeting|hearing)|before (congress|parliament|committee)|discussing)\b/i.test(lower);

    // Exclude general economic data news UNLESS it has explicit speech content
    const isGeneralDataNews = /\b(beats|misses|comes in at|actual|forecast|previous|released|data shows|report shows)\b/i.test(lower) && !hasExplicitSpeechKeyword && !hasDirectQuote;

    return (hasExplicitSpeechKeyword || hasDirectQuote || hasColonQuote || hasRateDecision || hasScheduledSpeech || hasOfficialActivity) && !isGeneralDataNews;
  }

  /**
   * Extract CB content from market news feed
   */
  extractCBContentFromFJ(fjNews) {
    const cbItems = [];

    for (const newsItem of fjNews) {
      if (!this.isCBContent(newsItem)) continue;

      const text = `${newsItem.headline} ${newsItem.rawText || ''}`;
      const lowerText = text.toLowerCase();

      // Skip items containing promotional branding
      if (lowerText.includes('financialjuice') || lowerText.includes('financial juice')) {
        continue;
      }

      const cbMatch = this.detectCentralBank(text);
      if (!cbMatch) continue;

      const { bankCode, bank } = cbMatch;
      const speaker = this.detectSpeaker(text, bank);
      const contentType = this.detectContentType(text, bankCode);

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
        source: 'Market News',
        isCritical: newsItem.isCritical || false,
        isActive: newsItem.isActive || false,
        firstSeenAt: newsItem.firstSeenAt || Date.now()
      });
    }

    return cbItems;
  }

  /**
   * Fetch all CB speeches from market news feed
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
      console.error('Error fetching CB speeches:', err.message);
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
      console.error('Error fetching CB press conferences:', err.message);
      return Array.from(this.cbContentHistory.values())
        .filter(item => item.type === 'press_conference')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }

  /**
   * Fetch all CB content (speeches + press conferences + Trump)
   */
  async fetchAllContent(fjScraper, trumpScraper = null) {
    // Clean old data first
    this.cleanOldData();

    try {
      // Get news from Financial Juice
      const fjNews = await fjScraper.getLatestNews();

      // Extract CB-related content (including Trump mentions from news)
      const cbItems = this.extractCBContentFromFJ(fjNews);

      console.log(`Extracted ${cbItems.length} CB items from ${fjNews.length} news items`);

      // Also fetch Trump schedule if scraper provided
      if (trumpScraper) {
        try {
          const trumpSchedule = await trumpScraper.getSchedule();
          console.log(`Fetched ${trumpSchedule.length} Trump schedule items`);

          // Convert Trump schedule items to CB content format
          for (const item of trumpSchedule) {
            const cbItem = {
              id: item.id,
              title: item.title,
              link: null,
              description: item.location || '',
              date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
              timestamp: item.date,
              speaker: 'Trump',
              centralBank: 'White House / Trump',
              bankCode: 'TRUMP',
              currency: 'USD',
              type: 'trump_schedule',
              source: 'RollCall FactBase',
              isCritical: true, // Trump schedule is always market-relevant
              isActive: true,
              firstSeenAt: item.firstSeenAt || Date.now()
            };

            // Add to history if not exists
            if (!this.cbContentHistory.has(cbItem.id)) {
              this.cbContentHistory.set(cbItem.id, cbItem);
            }
          }
        } catch (trumpErr) {
          console.error('Error fetching Trump schedule:', trumpErr.message);
        }
      }

      // Add FJ items to history
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
      console.error('Error fetching CB content:', err.message);
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
