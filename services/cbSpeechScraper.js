/**
 * Central Bank Speech Scraper Service
 * Fetches real speeches from central bank websites and RSS feeds
 * Supports all G8 Central Banks
 */

const https = require('https');
const http = require('http');

class CBSpeechScraper {
  constructor() {
    this.speechCache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes cache

    // Central bank speech RSS feeds and web sources
    this.sources = {
      'FED': {
        name: 'Federal Reserve',
        currency: 'USD',
        rssUrl: 'https://www.federalreserve.gov/feeds/speeches.xml',
        webUrl: 'https://www.federalreserve.gov/newsevents/speeches.htm',
        speakers: ['Jerome Powell', 'John Williams', 'Christopher Waller', 'Michelle Bowman', 'Adriana Kugler', 'Lisa Cook', 'Philip Jefferson']
      },
      'ECB': {
        name: 'European Central Bank',
        currency: 'EUR',
        rssUrl: 'https://www.ecb.europa.eu/rss/press.html',
        webUrl: 'https://www.ecb.europa.eu/press/key/html/index.en.html',
        speakers: ['Christine Lagarde', 'Luis de Guindos', 'Philip Lane', 'Isabel Schnabel', 'Frank Elderson', 'Piero Cipollone']
      },
      'BOE': {
        name: 'Bank of England',
        currency: 'GBP',
        rssUrl: 'https://www.bankofengland.co.uk/rss/speeches',
        webUrl: 'https://www.bankofengland.co.uk/news/speeches',
        speakers: ['Andrew Bailey', 'Ben Broadbent', 'Sarah Breeden', 'Huw Pill', 'Megan Greene', 'Swati Dhingra']
      },
      'BOJ': {
        name: 'Bank of Japan',
        currency: 'JPY',
        rssUrl: null,
        webUrl: 'https://www.boj.or.jp/en/about/press/index.htm',
        speakers: ['Kazuo Ueda', 'Shinichi Uchida', 'Ryozo Himino', 'Hajime Takata', 'Naoki Tamura']
      },
      'BOC': {
        name: 'Bank of Canada',
        currency: 'CAD',
        rssUrl: 'https://www.bankofcanada.ca/content-type/speeches/feed/',
        webUrl: 'https://www.bankofcanada.ca/press/speeches/',
        speakers: ['Tiff Macklem', 'Carolyn Rogers', 'Sharon Kozicki', 'Nicolas Vincent', 'Rhys Mendes']
      },
      'RBA': {
        name: 'Reserve Bank of Australia',
        currency: 'AUD',
        rssUrl: null,
        webUrl: 'https://www.rba.gov.au/speeches/',
        speakers: ['Michele Bullock', 'Andrew Hauser', 'Sarah Hunter', 'Brad Jones']
      },
      'RBNZ': {
        name: 'Reserve Bank of New Zealand',
        currency: 'NZD',
        rssUrl: null,
        webUrl: 'https://www.rbnz.govt.nz/hub/publications/speeches',
        speakers: ['Adrian Orr', 'Christian Hawkesby', 'Karen Silk', 'Paul Conway']
      },
      'SNB': {
        name: 'Swiss National Bank',
        currency: 'CHF',
        rssUrl: null,
        webUrl: 'https://www.snb.ch/en/publications/communication/speeches',
        speakers: ['Martin Schlegel', 'Antoine Martin', 'Petra Tschudin']
      }
    };

    // Alternative news API sources for speech data
    this.newsAPISources = {
      centralBankWatch: 'https://www.centralbanking.com/rss/news',
      forexLive: 'https://www.forexlive.com/feed/centralbanks'
    };
  }

  /**
   * Fetch URL content with promise
   */
  async fetchUrl(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        timeout: timeout
      }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Parse RSS feed XML to extract speech items
   */
  parseRSSFeed(xml, bankCode) {
    const speeches = [];
    const bank = this.sources[bankCode];

    // Simple XML parsing for RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];

      const title = this.extractTag(item, 'title');
      const link = this.extractTag(item, 'link');
      const description = this.extractTag(item, 'description');
      const pubDate = this.extractTag(item, 'pubDate');

      // Check if this is a speech (not just any news)
      const isSpeech = /speech|remarks|testimony|statement|address|lecture/i.test(title + description);

      if (isSpeech && title) {
        // Try to detect speaker from title or description
        let speaker = 'Unknown';
        for (const s of bank.speakers) {
          const lastName = s.split(' ').pop();
          if (title.includes(s) || title.includes(lastName) ||
              description.includes(s) || description.includes(lastName)) {
            speaker = s;
            break;
          }
        }

        speeches.push({
          id: this.generateId(bankCode, title, pubDate),
          title: this.cleanText(title),
          link: link,
          description: this.cleanText(description),
          date: pubDate ? new Date(pubDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          speaker: speaker,
          centralBank: bank.name,
          bankCode: bankCode,
          currency: bank.currency,
          source: 'rss',
          fullText: null // Will be fetched on demand
        });
      }
    }

    return speeches.slice(0, 10); // Return latest 10
  }

  /**
   * Extract XML tag content
   */
  extractTag(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? (match[1] || match[2] || '').trim() : '';
  }

  /**
   * Clean text from HTML entities and tags
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate unique ID for speech
   */
  generateId(bankCode, title, date) {
    const hash = (title + date).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return `${bankCode}-${Math.abs(hash)}`;
  }

  /**
   * Fetch speeches from a specific central bank
   */
  async fetchSpeechesFromBank(bankCode) {
    const bank = this.sources[bankCode];
    if (!bank) {
      throw new Error(`Unknown bank code: ${bankCode}`);
    }

    // Check cache first
    const cacheKey = `speeches-${bankCode}`;
    const cached = this.speechCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`Returning cached speeches for ${bankCode}`);
      return cached.data;
    }

    let speeches = [];

    // Try RSS feed first if available
    if (bank.rssUrl) {
      try {
        console.log(`Fetching RSS for ${bankCode}: ${bank.rssUrl}`);
        const rssData = await this.fetchUrl(bank.rssUrl);
        speeches = this.parseRSSFeed(rssData, bankCode);
        console.log(`Found ${speeches.length} speeches from RSS for ${bankCode}`);
      } catch (error) {
        console.log(`RSS fetch failed for ${bankCode}: ${error.message}`);
      }
    }

    // If no RSS or RSS failed, try to scrape the web page
    if (speeches.length === 0 && bank.webUrl) {
      try {
        console.log(`Scraping web page for ${bankCode}: ${bank.webUrl}`);
        speeches = await this.scrapeWebPage(bankCode, bank.webUrl);
        console.log(`Found ${speeches.length} speeches from web for ${bankCode}`);
      } catch (error) {
        console.log(`Web scraping failed for ${bankCode}: ${error.message}`);
      }
    }

    // Cache the results
    this.speechCache.set(cacheKey, {
      timestamp: Date.now(),
      data: speeches
    });

    return speeches;
  }

  /**
   * Scrape central bank web page for speeches
   */
  async scrapeWebPage(bankCode, url) {
    const bank = this.sources[bankCode];
    const speeches = [];

    try {
      const html = await this.fetchUrl(url);

      // Generic speech link extraction patterns
      const patterns = [
        /<a[^>]*href="([^"]*)"[^>]*>([^<]*(?:speech|remarks|statement|testimony|address)[^<]*)<\/a>/gi,
        /<a[^>]*href="([^"]*(?:speech|remarks)[^"]*)"[^>]*>([^<]+)<\/a>/gi,
        /<h\d[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>.*?<\/h\d>/gi
      ];

      const seen = new Set();

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const [_, link, title] = match;

          if (seen.has(link)) continue;
          seen.add(link);

          // Skip non-speech links
          if (/\.(pdf|jpg|png|gif|css|js)$/i.test(link)) continue;
          if (/subscribe|login|search|twitter|facebook|linkedin/i.test(link)) continue;

          // Detect speaker
          let speaker = 'Unknown';
          for (const s of bank.speakers) {
            const lastName = s.split(' ').pop();
            if (title.includes(s) || title.includes(lastName)) {
              speaker = s;
              break;
            }
          }

          // Make absolute URL
          let fullLink = link;
          if (link.startsWith('/')) {
            const urlObj = new URL(url);
            fullLink = `${urlObj.protocol}//${urlObj.host}${link}`;
          } else if (!link.startsWith('http')) {
            fullLink = new URL(link, url).href;
          }

          speeches.push({
            id: this.generateId(bankCode, title, new Date().toISOString()),
            title: this.cleanText(title),
            link: fullLink,
            description: '',
            date: new Date().toISOString().split('T')[0],
            speaker: speaker,
            centralBank: bank.name,
            bankCode: bankCode,
            currency: bank.currency,
            source: 'web',
            fullText: null
          });
        }
      }
    } catch (error) {
      console.error(`Web scrape error for ${bankCode}:`, error.message);
    }

    return speeches.slice(0, 10);
  }

  /**
   * Fetch full text of a speech from its URL
   */
  async fetchSpeechFullText(speechUrl) {
    try {
      const html = await this.fetchUrl(speechUrl, 20000);

      // Try to extract main content
      let content = '';

      // Common content container patterns
      const contentPatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*(?:content|speech|article|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*id="[^"]*(?:content|speech|article|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
        /<div[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ];

      for (const pattern of contentPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          content = match[1];
          break;
        }
      }

      // If no specific container found, try to extract body content
      if (!content) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          content = bodyMatch[1];
        }
      }

      // Clean up the content
      content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Remove excessive whitespace and limit length
      content = content.substring(0, 15000); // Limit to ~15k chars

      return content || 'Unable to extract speech content. Please try viewing the original source.';
    } catch (error) {
      console.error('Failed to fetch speech text:', error.message);
      throw new Error(`Failed to fetch speech: ${error.message}`);
    }
  }

  /**
   * Fetch speeches from all central banks
   */
  async fetchAllSpeeches() {
    const allSpeeches = [];
    const bankCodes = Object.keys(this.sources);

    // Fetch in parallel with error handling
    const results = await Promise.allSettled(
      bankCodes.map(code => this.fetchSpeechesFromBank(code))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allSpeeches.push(...result.value);
      } else {
        console.log(`Failed to fetch for ${bankCodes[index]}: ${result.reason}`);
      }
    });

    // Sort by date descending
    allSpeeches.sort((a, b) => new Date(b.date) - new Date(a.date));

    return allSpeeches;
  }

  /**
   * Search speeches by speaker name or bank
   */
  async searchSpeeches(query, bankCode = null) {
    let speeches = [];

    if (bankCode) {
      speeches = await this.fetchSpeechesFromBank(bankCode);
    } else {
      speeches = await this.fetchAllSpeeches();
    }

    const queryLower = query.toLowerCase();
    return speeches.filter(s =>
      s.title.toLowerCase().includes(queryLower) ||
      s.speaker.toLowerCase().includes(queryLower) ||
      s.description.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Get available central banks
   */
  getSources() {
    return Object.entries(this.sources).map(([code, bank]) => ({
      code,
      name: bank.name,
      currency: bank.currency,
      speakers: bank.speakers,
      hasRSS: !!bank.rssUrl
    }));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.speechCache.clear();
  }
}

module.exports = new CBSpeechScraper();
