/**
 * DeepSeek AI Service for Macro-Aware Market Surprise Analysis
 * Analyzes economic data and central bank policy releases within full macro context.
 * Determines if events represent bullish surprises, bearish surprises, or neutral events
 * by comparing against current market expectations (not just forecasts).
 *
 * THREE PRIMARY OBJECTIVES (all analysis must address these):
 * 1. Was this MORE HAWKISH or MORE DOVISH than expected?
 * 2. How does this change the next central bank move?
 * 3. What is the smart money theme/flow? (Goal: ALIGN with smart money, not outsmart them)
 *
 * Key Features:
 * - Hawkish/Dovish central bank stance analysis relative to market expectations
 * - Macro context integration (inflation, growth, policy trajectory)
 * - Market surprise detection (more/less aggressive than anticipated)
 * - Policy shift implications for asset prices
 * - Smart money flow identification for institutional alignment
 */

const axios = require('axios');

class DeepSeekAnalyzer {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.model = 'deepseek-chat';
    this.temperature = 0.2; // Very low for maximum analytical precision
    this.maxTokens = 500; // Keep responses concise
    this.timeout = 60000; // 60 seconds timeout

    // Cache for analysis results (1 hour TTL)
    this.analysisCache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour

    // Cache for market context (30 minutes TTL)
    this.marketContextCache = null;
    this.contextCacheTTL = 30 * 60 * 1000; // 30 minutes
    this.contextCacheTimestamp = null;

    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 10000; // 10 seconds between requests
  }

  /**
   * Detect if news is monetary policy related or equity/business news
   */
  detectNewsType(newsItem) {
    const text = `${newsItem.headline} ${newsItem.rawText || ''}`.toLowerCase();

    // Monetary policy keywords
    const policyKeywords = [
      'fed', 'fomc', 'ecb', 'boe', 'boj', 'rba', 'boc', 'snb', 'rbnz',
      'central bank', 'interest rate', 'rate decision', 'monetary policy',
      'gdp', 'cpi', 'inflation', 'pce', 'employment', 'jobless', 'unemployment',
      'retail sales', 'manufacturing', 'pmi', 'ism', 'consumer confidence',
      'hawkish', 'dovish', 'rate hike', 'rate cut', 'quantitative'
    ];

    // Check if it's monetary policy news
    const isPolicyNews = policyKeywords.some(keyword => text.includes(keyword));

    return isPolicyNews ? 'policy' : 'equity';
  }

  /**
   * Main analysis function
   * @param {Object} newsItem - The news item to analyze
   * @returns {Promise<Object>} Analysis result with verdict, confidence, reasoning, and key factors
   */
  async analyzeMarketSurprise(newsItem) {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(newsItem);
      const cachedResult = this.getFromCache(cacheKey);
      if (cachedResult) {
        console.log('[DeepSeek] Returning cached analysis for:', newsItem.headline);
        return cachedResult;
      }

      // Rate limiting check
      await this.enforceRateLimit();

      // Detect news type
      const newsType = this.detectNewsType(newsItem);
      console.log('[DeepSeek] News type detected:', newsType);

      // Get current market context
      const marketContext = await this.getMarketContext();

      // Build the analysis prompt based on news type
      const prompt = newsType === 'policy'
        ? this.buildAnalysisPrompt(newsItem, marketContext)
        : this.buildEquityAnalysisPrompt(newsItem, marketContext);

      // Call DeepSeek API
      console.log('[DeepSeek] Analyzing:', newsItem.headline);

      // Choose system prompt based on news type
      const systemPrompt = newsType === 'policy'
        ? 'You are a macro trading analyst. Be ultra-concise. Answer: 1) Hawkish or dovish vs expected? 2) Next CB move impact? 3) Smart money flow? Maximum 80 words for reasoning. Each keyFactor must be 1 short sentence.'
        : 'You are an equity analyst. Be ultra-concise. Answer: 1) Sector impact? 2) Business impact? 3) Smart money view? Maximum 80 words for reasoning. Each keyFactor must be 1 short sentence.';

      // Build request body
      const requestBody = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.temperature,
        response_format: { type: 'json_object' }
      };

      // Only include max_tokens if it's set (null means unlimited)
      if (this.maxTokens !== null) {
        requestBody.max_tokens = this.maxTokens;
      }

      const response = await axios.post(
        this.apiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        }
      );

      // Parse the response
      const aiResponse = response.data.choices[0].message.content;
      const analysis = JSON.parse(aiResponse);

      // Add timestamp
      analysis.analyzedAt = new Date().toISOString();

      // Validate and normalize the response
      const validatedAnalysis = this.validateAnalysis(analysis);

      // Cache the result
      this.saveToCache(cacheKey, validatedAnalysis);

      console.log('[DeepSeek] Analysis complete:', validatedAnalysis.verdict);
      return validatedAnalysis;

    } catch (error) {
      console.error('[DeepSeek] Analysis error:', error.message);

      // Return fallback analysis on error
      return {
        verdict: 'Error',
        confidence: 'Low',
        reasoning: `Unable to complete analysis: ${error.message}. Please try again.`,
        keyFactors: ['API error occurred'],
        analyzedAt: new Date().toISOString(),
        error: true
      };
    }
  }

  /**
   * Build the analysis prompt with market context
   */
  buildAnalysisPrompt(newsItem, marketContext) {
    const { headline, economicData, tags, timestamp } = newsItem;
    const { actual, forecast, previous } = economicData || {};

    return `EVENT: ${headline}
Actual: ${actual || 'N/A'} | Forecast: ${forecast || 'N/A'} | Previous: ${previous || 'N/A'}

RESPOND IN JSON (be ultra-concise):
{
  "verdict": "Bullish Surprise" | "Bearish Surprise" | "Neutral",
  "assetImpact": { "USD": "...", "Stocks": "...", "Bonds": "...", "Gold": "..." },
  "reasoning": "[MAX 80 words] 1) Hawkish/dovish vs expected? 2) Next CB move? 3) Smart money flow?",
  "keyFactors": ["1 sentence each - max 5 factors"]
}

Keep reasoning under 80 words. Each keyFactor = 1 short sentence.`;
  }

  /**
   * Build equity/business news analysis prompt
   */
  buildEquityAnalysisPrompt(newsItem, marketContext) {
    const { headline, tags, timestamp, rawText } = newsItem;

    return `EVENT: ${headline}
${rawText ? `Details: ${rawText.substring(0, 200)}` : ''}

RESPOND IN JSON (be ultra-concise):
{
  "verdict": "Bullish" | "Bearish" | "Neutral",
  "assetImpact": { "USD": "...", "Stocks": "...", "Bonds": "...", "Gold": "..." },
  "reasoning": "[MAX 80 words] 1) Sector impact? 2) Business fundamentals? 3) Smart money view?",
  "keyFactors": ["1 sentence each - max 5 factors"]
}

Keep reasoning under 80 words. Each keyFactor = 1 short sentence.`;
  }

  /**
   * Get current market context via web search/news
   * Cached for 30 minutes to reduce API calls
   */
  async getMarketContext() {
    // Check if we have valid cached context
    if (this.marketContextCache && this.contextCacheTimestamp) {
      const age = Date.now() - this.contextCacheTimestamp;
      if (age < this.contextCacheTTL) {
        console.log('[DeepSeek] Using cached market context');
        return this.marketContextCache;
      }
    }

    try {
      // Search for current market focus
      // Using a simple approach - search recent financial news headlines
      console.log('[DeepSeek] Fetching fresh market context...');

      const searchQuery = 'current market focus central bank policy expectations today';
      const context = await this.searchMarketFocus(searchQuery);

      // Cache the context
      this.marketContextCache = context;
      this.contextCacheTimestamp = Date.now();

      return context;

    } catch (error) {
      console.error('[DeepSeek] Error fetching market context:', error.message);
      // Return fallback context
      return 'Market focus: General economic data monitoring. Central bank policy expectations in focus.';
    }
  }

  /**
   * Search for market focus using web search or news scraping
   */
  async searchMarketFocus(query) {
    // This is a placeholder - you can integrate with:
    // 1. Google News API
    // 2. Financial news RSS feeds
    // 3. Your existing FinancialJuice scraper
    // 4. Twitter/X API for trending financial topics

    // For now, return a generic but useful context
    // TODO: Integrate with actual news search API

    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    return `Market Context & Expectations (${currentDate}):

CURRENT MARKET POSITIONING:
- What is the consensus view on central bank policy trajectory?
- Are markets pricing in rate hikes, holds, or cuts?
- What is the expected terminal rate and timing of policy pivots?
- Are markets positioned for risk-on (growth) or risk-off (recession)?

KEY MACRO THEMES:
- Inflation trends: Is inflation easing as expected or proving sticky?
- Growth outlook: Recession fears vs soft landing vs no landing scenarios
- Central bank policy: Fed, ECB, BOE, BoJ stances and expected paths
- Labor market: Tight labor market concerns vs cooling employment
- Geopolitical risks: Major events affecting market sentiment

RECENT MARKET BEHAVIOR:
- Bond yields direction and what it signals about policy expectations
- Equity market positioning (growth vs value, cyclicals vs defensives)
- FX market moves indicating dovish/hawkish repricing
- Volatility levels and risk appetite indicators

WHAT WOULD SURPRISE MARKETS:
- Central banks being MORE hawkish than currently priced
- Central banks being MORE dovish than currently priced
- Inflation reaccelerating unexpectedly
- Growth deteriorating faster than anticipated
- Labor market breaking down or remaining unexpectedly tight

ANALYSIS APPROACH:
Always compare news/data against CURRENT MARKET EXPECTATIONS (not just vs forecast).
Ask: Does this make central banks MORE or LESS hawkish/dovish than markets anticipated?
Focus on: Will this surprise traders and move asset prices?

Note: This analysis evaluates whether events surprise the market within the broader macro context.`;
  }

  /**
   * Validate and normalize AI response
   */
  validateAnalysis(analysis) {
    // Normalize verdict format - accept both policy and equity formats
    const validPolicyVerdicts = ['Bullish Surprise', 'Bearish Surprise', 'Neutral'];
    const validEquityVerdicts = ['Bullish', 'Bearish', 'Neutral'];
    const allValidVerdicts = [...validPolicyVerdicts, ...validEquityVerdicts];

    if (!allValidVerdicts.includes(analysis.verdict)) {
      // Try to map common variations
      const verdictLower = analysis.verdict.toLowerCase();
      if (verdictLower.includes('bullish')) {
        // Keep as-is if it already says "Surprise", otherwise just use "Bullish"
        analysis.verdict = verdictLower.includes('surprise') ? 'Bullish Surprise' : 'Bullish';
      } else if (verdictLower.includes('bearish')) {
        analysis.verdict = verdictLower.includes('surprise') ? 'Bearish Surprise' : 'Bearish';
      } else {
        analysis.verdict = 'Neutral';
      }
    }

    // Normalize asset impact
    const validAssetSentiment = ['Bullish', 'Bearish', 'Neutral'];
    if (!analysis.assetImpact || typeof analysis.assetImpact !== 'object') {
      analysis.assetImpact = {
        USD: 'Neutral',
        Stocks: 'Neutral',
        Bonds: 'Neutral',
        Gold: 'Neutral'
      };
    } else {
      // Validate each asset
      ['USD', 'Stocks', 'Bonds', 'Gold'].forEach(asset => {
        if (!validAssetSentiment.includes(analysis.assetImpact[asset])) {
          analysis.assetImpact[asset] = 'Neutral';
        }
      });
    }

    // Ensure reasoning exists
    if (!analysis.reasoning || analysis.reasoning.length < 10) {
      analysis.reasoning = 'Analysis completed but detailed reasoning unavailable.';
    }

    // Ensure keyFactors is an array with reasonable length (3-6 factors preferred)
    if (!Array.isArray(analysis.keyFactors)) {
      analysis.keyFactors = [];
    }

    return analysis;
  }

  /**
   * Generate cache key for news item
   */
  getCacheKey(newsItem) {
    // Use headline + timestamp as cache key
    const identifier = `${newsItem.headline}-${newsItem.timestamp || 'now'}`;
    return identifier.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
  }

  /**
   * Get analysis from cache
   */
  getFromCache(key) {
    const cached = this.analysisCache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      // Cache expired
      this.analysisCache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Save analysis to cache with proper LRU eviction
   */
  saveToCache(key, data) {
    this.analysisCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean up old cache entries (keep max 50 items, remove oldest 20% when exceeded)
    const MAX_CACHE_SIZE = 50;
    if (this.analysisCache.size > MAX_CACHE_SIZE) {
      // Sort by timestamp and remove oldest 20%
      const entries = Array.from(this.analysisCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.ceil(this.analysisCache.size * 0.2);
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.analysisCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Enforce rate limiting
   */
  async enforceRateLimit() {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`[DeepSeek] Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCaches() {
    this.analysisCache.clear();
    this.marketContextCache = null;
    this.contextCacheTimestamp = null;
    console.log('[DeepSeek] Caches cleared');
  }
}

// Export singleton instance
module.exports = new DeepSeekAnalyzer();
