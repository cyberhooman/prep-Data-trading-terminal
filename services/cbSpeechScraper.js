/**
 * Central Bank Speech Scraper Service
 * Fetches real speeches from central bank RSS feeds
 */

const https = require('https');
const http = require('http');

class CBSpeechScraper {
  constructor() {
    this.speechCache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes

    // Correct RSS feed URLs for central bank speeches
    this.sources = {
      'FED': {
        name: 'Federal Reserve',
        currency: 'USD',
        rssUrl: 'https://www.federalreserve.gov/feeds/speeches.xml',
        speakers: ['Powell', 'Williams', 'Waller', 'Bowman', 'Jefferson', 'Cook', 'Kugler', 'Barr']
      },
      'ECB': {
        name: 'European Central Bank',
        currency: 'EUR',
        rssUrl: 'https://www.ecb.europa.eu/rss/press_sec.xml',
        speakers: ['Lagarde', 'de Guindos', 'Lane', 'Schnabel', 'Elderson', 'Cipollone']
      },
      'BOE': {
        name: 'Bank of England',
        currency: 'GBP',
        rssUrl: 'https://www.bankofengland.co.uk/rss/news',
        speakers: ['Bailey', 'Broadbent', 'Breeden', 'Pill', 'Greene', 'Dhingra', 'Mann', 'Taylor']
      },
      'BOC': {
        name: 'Bank of Canada',
        currency: 'CAD',
        rssUrl: 'https://www.bankofcanada.ca/content-type/speeches/feed/',
        speakers: ['Macklem', 'Rogers', 'Kozicki', 'Gravelle']
      },
      'RBA': {
        name: 'Reserve Bank of Australia',
        currency: 'AUD',
        rssUrl: 'https://www.rba.gov.au/rss/rss-cb-speeches.xml',
        speakers: ['Bullock', 'Hauser', 'Hunter', 'Kent', 'Jones']
      }
    };
  }

  /**
   * Fetch URL with proper headers
   */
  fetchUrl(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const protocol = isHttps ? https : http;

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        },
        timeout: timeout
      }, (res) => {
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
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  /**
   * Parse RSS feed and extract speech items
   */
  parseRSS(xml, bankCode) {
    const bank = this.sources[bankCode];
    const speeches = [];

    // Extract items from RSS
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];

      const title = this.extractTag(item, 'title');
      const link = this.extractTag(item, 'link') || this.extractTag(item, 'guid');
      const description = this.extractTag(item, 'description');
      const pubDate = this.extractTag(item, 'pubDate') || this.extractTag(item, 'dc:date');

      // Skip if no link or title
      if (!link || !title) continue;

      // Skip non-speech items (reports, data releases, etc.)
      const lowerTitle = title.toLowerCase();
      const lowerDesc = (description || '').toLowerCase();

      const isLikelySpeech =
        /speech|remarks|statement|testimony|address|lecture|conference|interview/i.test(title + description) ||
        bank.speakers.some(s => title.includes(s) || (description && description.includes(s)));

      const isNotSpeech =
        /data|statistics|report|publication|release|minutes|bulletin|survey|index/i.test(lowerTitle) &&
        !isLikelySpeech;

      if (isNotSpeech) continue;

      // Detect speaker
      let speaker = 'Central Bank Official';
      for (const s of bank.speakers) {
        if (title.includes(s) || (description && description.includes(s))) {
          speaker = s;
          break;
        }
      }

      // Parse date
      let date = new Date().toISOString().split('T')[0];
      if (pubDate) {
        try {
          const parsed = new Date(pubDate);
          if (!isNaN(parsed.getTime())) {
            date = parsed.toISOString().split('T')[0];
          }
        } catch (e) {}
      }

      speeches.push({
        id: `${bankCode}-${Buffer.from(link).toString('base64').substring(0, 12)}`,
        title: this.cleanText(title),
        link: link,
        description: this.cleanText(description || '').substring(0, 200),
        date: date,
        speaker: speaker,
        centralBank: bank.name,
        bankCode: bankCode,
        currency: bank.currency
      });
    }

    return speeches.slice(0, 10);
  }

  /**
   * Extract tag content from XML
   */
  extractTag(xml, tag) {
    // Handle CDATA
    const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
    const cdataMatch = xml.match(cdataRegex);
    if (cdataMatch) return cdataMatch[1].trim();

    // Handle regular content
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * Clean text from HTML
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Fetch speeches from a specific bank
   */
  async fetchSpeechesFromBank(bankCode) {
    const bank = this.sources[bankCode];
    if (!bank) return [];

    // Check cache
    const cacheKey = `speeches-${bankCode}`;
    const cached = this.speechCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      console.log(`Fetching speeches for ${bankCode} from ${bank.rssUrl}`);
      const xml = await this.fetchUrl(bank.rssUrl);
      const speeches = this.parseRSS(xml, bankCode);
      console.log(`Found ${speeches.length} speeches for ${bankCode}`);

      this.speechCache.set(cacheKey, { timestamp: Date.now(), data: speeches });
      return speeches;
    } catch (err) {
      console.error(`Failed to fetch ${bankCode} speeches:`, err.message);
      return [];
    }
  }

  /**
   * Fetch speeches from all banks
   */
  async fetchAllSpeeches() {
    const allSpeeches = [];
    const bankCodes = Object.keys(this.sources);

    const results = await Promise.allSettled(
      bankCodes.map(code => this.fetchSpeechesFromBank(code))
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allSpeeches.push(...result.value);
      }
    });

    // Sort by date descending
    allSpeeches.sort((a, b) => new Date(b.date) - new Date(a.date));
    return allSpeeches;
  }

  /**
   * Fetch full text of a speech
   */
  async fetchSpeechFullText(url) {
    try {
      const html = await this.fetchUrl(url, 20000);

      // Extract main content using various patterns
      let content = '';

      // Try specific content selectors
      const patterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*(?:article|content|speech|main-content|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
        /<div[^>]*id="[^"]*(?:content|article|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1] && match[1].length > 500) {
          content = match[1];
          break;
        }
      }

      // Fallback: extract body
      if (!content || content.length < 500) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) content = bodyMatch[1];
      }

      // Clean content
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

      if (content.length < 200) {
        throw new Error('Could not extract enough text content');
      }

      return content.substring(0, 15000);
    } catch (err) {
      console.error('Failed to fetch speech text:', err.message);
      throw new Error('Could not fetch speech text');
    }
  }

  /**
   * Get available sources
   */
  getSources() {
    return Object.entries(this.sources).map(([code, bank]) => ({
      code,
      name: bank.name,
      currency: bank.currency
    }));
  }

  clearCache() {
    this.speechCache.clear();
  }
}

module.exports = new CBSpeechScraper();
