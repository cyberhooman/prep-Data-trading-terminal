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
    this.maxTokens = 1500; // Balanced limit for concise yet comprehensive analysis
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

      // Build request body
      const requestBody = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a macro trading analyst specializing in central bank policy and market surprise detection. PRIMARY OBJECTIVES: 1) Determine if MORE HAWKISH or DOVISH than expected, 2) Assess impact on next central bank move, 3) Identify smart money flow to ALIGN with institutions. Analyze events against CURRENT MARKET EXPECTATIONS (not just forecasts). Provide clear, concise analysis focused on actionable insights. Be comprehensive but efficient - quality over quantity.'
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

    return `You are analyzing an economic/policy release to determine if it represents a genuine market surprise within the broader macro context.

CURRENT MARKET FOCUS & EXPECTATIONS:
${marketContext}

NEWS/DATA RELEASE:
- Event: ${headline}
- Actual: ${actual || 'N/A'}
- Forecast: ${forecast || 'N/A'}
- Previous: ${previous || 'N/A'}
- Tags: ${tags ? tags.join(', ') : 'N/A'}
- Time: ${timestamp || 'Recent'}

YOUR TASK:
Analyze this event within the FULL MACRO CONTEXT and determine if it represents a BULLISH SURPRISE, BEARISH SURPRISE, or NEUTRAL event for markets.

YOUR THREE PRIMARY OBJECTIVES (MUST ADDRESS ALL THREE):
1. Was this MORE HAWKISH or MORE DOVISH than expected? (Be specific and clear)
2. How does this change the next central bank move? (Rate path, timing, terminal rate implications)
3. What is the smart money theme and flow? Your goal is to ALIGN WITH smart money, not outsmart them. Identify institutional positioning and flow.

CRITICAL ANALYSIS FRAMEWORK:

1. CENTRAL BANK POLICY STANCE ANALYSIS (if applicable):
   - Is this central bank becoming MORE HAWKISH (tightening, anti-inflation) or MORE DOVISH (easing, pro-growth)?
   - How does this compare to CURRENT MARKET EXPECTATIONS (not just forecasts)?
   - Is the hawkish/dovish shift MORE AGGRESSIVE or LESS AGGRESSIVE than markets anticipated?
   - Examples:
     * Rate hike of 50bps when market expected 25bps = MORE HAWKISH THAN EXPECTED = Bearish Surprise
     * Rate hold when market priced in hike = MORE DOVISH THAN EXPECTED = Bullish Surprise
     * Hawkish language but less aggressive than feared = LESS HAWKISH THAN EXPECTED = Bullish Surprise

2. MARKET EXPECTATIONS VS REALITY:
   - Don't just compare actual vs forecast - analyze if this SURPRISED THE MARKET
   - Consider: What was market pricing in? What was consensus view? What were recent trends?
   - A "good" number can be a bearish surprise if markets expected even better
   - A "bad" number can be a bullish surprise if markets expected worse

3. MACRO CONTEXT INTEGRATION:
   - How does this fit into the current macro narrative (recession fears, inflation concerns, growth outlook)?
   - Does this confirm or contradict the prevailing market view?
   - Will this change central bank policy trajectory expectations?
   - Does this shift the risk/reward for major asset classes?

4. POLICY SHIFT IMPLICATIONS:
   - Does this increase/decrease likelihood of rate hikes or cuts?
   - Does this change the terminal rate expectations?
   - Does this affect QT/QE expectations?
   - Does this change timing of policy pivots?

5. MARKET IMPACT ASSESSMENT:
   - Is this data point currently a MAJOR MARKET DRIVER?
   - Is the deviation large enough to move bond yields, FX, or equity markets?
   - Would this genuinely surprise professional traders and investors?

CLASSIFICATION LOGIC:
- BULLISH SURPRISE: Event is more positive/dovish/supportive than market expected (risk-on)
- BEARISH SURPRISE: Event is more negative/hawkish/restrictive than market expected (risk-off)
- NEUTRAL: Largely in-line with expectations OR too minor to matter OR conflicting signals

IMPORTANT PRINCIPLES:
✓ Always analyze RELATIVE TO CURRENT MARKET EXPECTATIONS (not just vs forecast)
✓ Consider if hawkish/dovish stance is MORE or LESS aggressive than expected
✓ Evaluate the FULL MACRO CONTEXT, not just the data point in isolation
✓ Focus on what SURPRISES the market, not just if news is objectively good/bad
✓ Distinguish between "expected hawkish" (neutral) vs "surprisingly hawkish" (bearish surprise)

OUTPUT FORMAT (JSON):
{
  "verdict": "Bullish Surprise" OR "Bearish Surprise" OR "Neutral",
  "assetImpact": {
    "USD": "Bullish" OR "Bearish" OR "Neutral",
    "Stocks": "Bullish" OR "Bearish" OR "Neutral",
    "Bonds": "Bullish" OR "Bearish" OR "Neutral",
    "Gold": "Bullish" OR "Bearish" OR "Neutral"
  },
  "reasoning": "Concise 2-3 paragraph analysis addressing the THREE PRIMARY OBJECTIVES: 1) Was this MORE HAWKISH or DOVISH than expected, 2) How this changes the next central bank move, 3) Smart money flow to align with. Include key market context and actionable insights. Be clear and focused.",
  "keyFactors": [
    "Hawkish/Dovish vs Expected: [Brief clear statement]",
    "Next CB Move Impact: [Rate path/timing implications]",
    "Smart Money Flow: [Institutional positioning theme]",
    "Market Context: [What was priced in vs reality]",
    "Key Implications: [Main takeaways for trading]"
  ]
}

CRITICAL INSTRUCTIONS:
- MANDATORY: Address all THREE PRIMARY OBJECTIVES clearly and concisely
- MANDATORY: Provide assetImpact for USD, Stocks, Bonds, and Gold based on the analysis
- Asset impact should reflect how each asset class would react to this news
- Consider: Hawkish = USD/Bonds up, Stocks/Gold down; Dovish = opposite
- Focus on actionable insights and key market context
- Be analytical but efficient - avoid unnecessary verbosity
- Each keyFactor should be 1-2 clear, focused sentences
- Reasoning should be 2-3 paragraphs maximum
- Goal: ALIGN WITH smart money flow, not outsmart it

ALWAYS answer: 1) Hawkish or Dovish vs expected? 2) Next CB move impact? 3) Smart money flow to follow?`;
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
