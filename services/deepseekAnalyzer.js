/**
 * DeepSeek AI Service for Market Surprise Analysis
 * Analyzes economic data releases to determine if they represent
 * bullish surprises, bearish surprises, or neutral events
 */

const axios = require('axios');

class DeepSeekAnalyzer {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.model = 'deepseek-chat';
    this.temperature = 0.3; // Lower for more consistent analysis
    this.maxTokens = 800;
    this.timeout = 15000; // 15 seconds

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

      // Get current market context
      const marketContext = await this.getMarketContext();

      // Build the analysis prompt
      const prompt = this.buildAnalysisPrompt(newsItem, marketContext);

      // Call DeepSeek API
      console.log('[DeepSeek] Analyzing:', newsItem.headline);
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert trading analyst specializing in identifying market-moving policy shifts and genuine surprises in economic data releases. You focus on what will surprise traders, not just whether data is good or bad.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          response_format: { type: 'json_object' }
        },
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

    return `You are analyzing an economic data release to determine if it represents a genuine market surprise.

CURRENT MARKET FOCUS:
${marketContext}

ECONOMIC DATA RELEASE:
- Event: ${headline}
- Actual: ${actual || 'N/A'}
- Forecast: ${forecast || 'N/A'}
- Previous: ${previous || 'N/A'}
- Tags: ${tags ? tags.join(', ') : 'N/A'}
- Time: ${timestamp || 'Recent'}

YOUR TASK:
Determine if this is a BULLISH SURPRISE, BEARISH SURPRISE, or NEUTRAL event.

CRITICAL CONSIDERATIONS:
1. Does the actual value deviate meaningfully from the forecast?
2. Is this indicator currently in market focus based on recent news?
3. Does this signal a potential policy shift (Fed, ECB, BOE, etc.)?
4. Would this genuinely surprise traders given current market expectations?
5. Is the surprise large enough to move markets?

IMPORTANT: We only care about SURPRISES and POLICY SHIFTS, not whether data is simply good or bad.
- If actual matches forecast → Usually NEUTRAL (no surprise)
- If deviation is small and market isn't focused on it → NEUTRAL
- Only classify as BULLISH/BEARISH SURPRISE if:
  * Significant deviation from expectations AND
  * Data point is in current market focus OR
  * Signals clear policy shift implications

OUTPUT FORMAT (JSON):
{
  "verdict": "Bullish Surprise" OR "Bearish Surprise" OR "Neutral",
  "confidence": "High" OR "Medium" OR "Low",
  "reasoning": "Detailed 2-3 sentence explanation of why this is/isn't a surprise",
  "keyFactors": ["Factor 1", "Factor 2", "Factor 3"]
}

Be concise but thorough in your reasoning. Focus on surprise element and policy shift potential.`;
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

    return `Market Context (${currentDate}):
- Central bank policy decisions and inflation data remain primary focus areas
- Traders watching for policy shift signals from Fed, ECB, and BOE
- Economic growth indicators monitored for recession signals
- Geopolitical events and energy prices impacting sentiment
- Recent market volatility increases sensitivity to surprise data

Note: This analysis focuses on whether data genuinely surprises relative to market expectations and current focus areas.`;
  }

  /**
   * Validate and normalize AI response
   */
  validateAnalysis(analysis) {
    // Normalize verdict format
    const validVerdicts = ['Bullish Surprise', 'Bearish Surprise', 'Neutral'];
    if (!validVerdicts.includes(analysis.verdict)) {
      // Try to map common variations
      const verdictLower = analysis.verdict.toLowerCase();
      if (verdictLower.includes('bullish')) {
        analysis.verdict = 'Bullish Surprise';
      } else if (verdictLower.includes('bearish')) {
        analysis.verdict = 'Bearish Surprise';
      } else {
        analysis.verdict = 'Neutral';
      }
    }

    // Normalize confidence
    const validConfidence = ['High', 'Medium', 'Low'];
    if (!validConfidence.includes(analysis.confidence)) {
      analysis.confidence = 'Medium';
    }

    // Ensure reasoning exists
    if (!analysis.reasoning || analysis.reasoning.length < 10) {
      analysis.reasoning = 'Analysis completed but detailed reasoning unavailable.';
    }

    // Ensure keyFactors is an array
    if (!Array.isArray(analysis.keyFactors)) {
      analysis.keyFactors = [];
    }

    // Limit key factors to 5
    if (analysis.keyFactors.length > 5) {
      analysis.keyFactors = analysis.keyFactors.slice(0, 5);
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
   * Save analysis to cache
   */
  saveToCache(key, data) {
    this.analysisCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean up old cache entries (keep max 100 items)
    if (this.analysisCache.size > 100) {
      const firstKey = this.analysisCache.keys().next().value;
      this.analysisCache.delete(firstKey);
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
