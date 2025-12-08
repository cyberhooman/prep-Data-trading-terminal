const database = require('./database');

/**
 * X (Twitter) API News Scraper for @FinancialJuice
 * Fetches tweets from FinancialJuice's X account instead of web scraping
 */
class XNewsScraper {
  constructor() {
    this.username = 'financialjuice'; // X handle without @
    this.newsCache = [];
    this.lastFetch = null;
    this.cacheTimeout = 300000; // 5 minutes cache - critical news doesn't appear often
    this.newsHistory = new Map();
    this.retentionDays = 7; // Keep news for 1 week
    this.database = database;

    // Critical keywords that mark news as high-priority
    this.criticalKeywords = [
      'breaking', 'alert', 'urgent', 'emergency',
      'fed', 'fomc', 'powell', 'interest rate',
      'gdp', 'inflation', 'cpi', 'ppi', 'nfp',
      'dollar', 'crash', 'surge', 'plunge'
    ];

    this.init();
  }

  async init() {
    try {
      await this.database.createNewsHistoryTable();
      await this.loadHistory();
    } catch (error) {
      console.error('Error initializing X scraper:', error);
    }
  }

  async loadHistory() {
    try {
      const historyArray = await this.database.loadNewsHistory();
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

  async saveHistory() {
    try {
      const historyArray = Array.from(this.newsHistory.values());
      await this.database.saveNewsHistory(historyArray);
    } catch (error) {
      console.error('Error saving news history:', error.message);
    }
  }

  /**
   * Check if tweet text contains critical keywords
   */
  isCriticalNews(text) {
    const lowerText = text.toLowerCase();
    return this.criticalKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Determine if news is active/important based on engagement
   */
  isActiveNews(tweet) {
    // Consider news active if it has good engagement or contains economic data
    const hasEconomicData = /\b(actual|forecast|previous)\b/i.test(tweet.text);
    const hasHighEngagement = (tweet.retweet_count || 0) > 10 || (tweet.favorite_count || 0) > 20;
    return hasEconomicData || hasHighEngagement;
  }

  /**
   * Extract economic data from tweet text
   */
  extractEconomicData(text) {
    const data = {};

    const actualMatch = text.match(/actual[:\s]+([0-9.%\-+]+)/i);
    const forecastMatch = text.match(/forecast[:\s]+([0-9.%\-+]+)/i);
    const previousMatch = text.match(/previous[:\s]+([0-9.%\-+]+)/i);

    if (actualMatch) data.actual = actualMatch[1];
    if (forecastMatch) data.forecast = forecastMatch[1];
    if (previousMatch) data.previous = previousMatch[1];

    return Object.keys(data).length > 0 ? data : null;
  }

  /**
   * Extract tags/categories from tweet
   */
  extractTags(text) {
    const tags = [];

    // Extract hashtags
    const hashtags = text.match(/#\w+/g) || [];
    hashtags.forEach(tag => tags.push(tag.substring(1)));

    // Extract currency mentions
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
    currencies.forEach(curr => {
      if (text.includes(curr)) tags.push(curr);
    });

    // Extract market categories
    const categories = ['Forex', 'Bonds', 'Stocks', 'Commodities', 'Crypto'];
    categories.forEach(cat => {
      if (text.toLowerCase().includes(cat.toLowerCase())) tags.push(cat);
    });

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Fetch tweets from @FinancialJuice using X API v2
   */
  async fetchTweetsFromX() {
    const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;

    if (!bearerToken) {
      console.error('X_BEARER_TOKEN not found in environment variables');
      throw new Error('X API Bearer Token not configured');
    }

    try {
      // X API v2 endpoint to get user timeline
      // First, get user ID
      const userResponse = await fetch(
        `https://api.twitter.com/2/users/by/username/${this.username}`,
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`
          }
        }
      );

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user: ${userResponse.statusText}`);
      }

      const userData = await userResponse.json();
      const userId = userData.data.id;

      // Fetch recent tweets (last 50)
      const tweetsResponse = await fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=50&tweet.fields=created_at,public_metrics,entities`,
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`
          }
        }
      );

      if (!tweetsResponse.ok) {
        throw new Error(`Failed to fetch tweets: ${tweetsResponse.statusText}`);
      }

      const tweetsData = await tweetsResponse.json();
      return tweetsData.data || [];

    } catch (error) {
      console.error('Error fetching from X API:', error.message);
      throw error;
    }
  }

  /**
   * Get latest high-impact news from X
   */
  async getLatestNews() {
    try {
      // Check cache first
      if (this.lastFetch && Date.now() - this.lastFetch < this.cacheTimeout) {
        console.log('Returning cached X news data');
        return this.newsCache;
      }

      console.log('Fetching fresh news from X API...');
      const tweets = await this.fetchTweetsFromX();

      const newsItems = tweets.map(tweet => {
        const text = tweet.text;
        const isCritical = this.isCriticalNews(text);
        const isActive = this.isActiveNews(tweet);

        return {
          headline: text.substring(0, 280), // Tweet text as headline
          timestamp: tweet.created_at,
          economicData: this.extractEconomicData(text),
          tags: this.extractTags(text),
          hasChart: false,
          link: `https://twitter.com/${this.username}/status/${tweet.id}`,
          isCritical,
          isActive,
          scrapedAt: new Date().toISOString(),
          source: 'x_api'
        };
      });

      // Filter for only critical or active items
      const filteredItems = newsItems.filter(item => item.isCritical || item.isActive);

      console.log(`Found ${tweets.length} tweets, ${filteredItems.length} are high-impact`);

      // Merge with historical items
      const now = Date.now();
      const oneWeekAgo = now - (this.retentionDays * 24 * 60 * 60 * 1000);

      // Add new items to history
      filteredItems.forEach(item => {
        const key = `${item.headline}-${item.timestamp}`;
        if (!this.newsHistory.has(key)) {
          this.newsHistory.set(key, {
            ...item,
            firstSeenAt: now
          });
        }
      });

      // Remove items older than 1 week
      for (const [key, item] of this.newsHistory.entries()) {
        if (item.firstSeenAt < oneWeekAgo) {
          this.newsHistory.delete(key);
        }
      }

      // Return all items from history
      const allItems = Array.from(this.newsHistory.values());
      allItems.sort((a, b) => b.firstSeenAt - a.firstSeenAt);

      console.log(`Returning ${allItems.length} items (including history)`);

      // Save history
      this.saveHistory();

      // Update cache
      this.newsCache = allItems;
      this.lastFetch = Date.now();

      return allItems;

    } catch (error) {
      console.error('Error in getLatestNews:', error.message);

      // Return cached data if available
      if (this.newsCache.length > 0) {
        console.log('Returning stale cache due to error');
        return this.newsCache;
      }

      throw error;
    }
  }

  clearCache() {
    this.newsCache = [];
    this.lastFetch = null;
    this.newsHistory.clear();
    this.saveHistory();
  }
}

module.exports = new XNewsScraper();
