/**
 * DeepSeek AI Service for Central Bank Speech Analysis
 * Analyzes CB speeches for dovish/hawkish/neutral sentiment within full macro context.
 * Supports all G8 Central Banks
 *
 * THREE PRIMARY OBJECTIVES (all analysis must address these):
 * 1. Was this MORE HAWKISH or MORE DOVISH than expected?
 * 2. How does this change the next central bank move?
 * 3. What is the smart money theme/flow? (Goal: ALIGN with smart money, not outsmart them)
 */

const https = require('https');

class DeepSeekAI {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseUrl = 'api.deepseek.com';
    this.model = 'deepseek-chat';
    this.analysisCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes cache
    this.maxCacheSize = 50; // Maximum cache entries

    // G8 Central Banks and their currencies
    this.centralBanks = {
      'FED': { name: 'Federal Reserve', currency: 'USD', country: 'United States', speakers: ['Jerome Powell', 'John Williams', 'Christopher Waller', 'Michelle Bowman'] },
      'ECB': { name: 'European Central Bank', currency: 'EUR', country: 'Eurozone', speakers: ['Christine Lagarde', 'Luis de Guindos', 'Philip Lane', 'Isabel Schnabel'] },
      'BOE': { name: 'Bank of England', currency: 'GBP', country: 'United Kingdom', speakers: ['Andrew Bailey', 'Ben Broadbent', 'Sarah Breeden', 'Huw Pill'] },
      'BOJ': { name: 'Bank of Japan', currency: 'JPY', country: 'Japan', speakers: ['Kazuo Ueda', 'Shinichi Uchida', 'Ryozo Himino'] },
      'BOC': { name: 'Bank of Canada', currency: 'CAD', country: 'Canada', speakers: ['Tiff Macklem', 'Carolyn Rogers', 'Sharon Kozicki'] },
      'RBA': { name: 'Reserve Bank of Australia', currency: 'AUD', country: 'Australia', speakers: ['Michele Bullock', 'Andrew Hauser', 'Sarah Hunter'] },
      'RBNZ': { name: 'Reserve Bank of New Zealand', currency: 'NZD', country: 'New Zealand', speakers: ['Adrian Orr', 'Christian Hawkesby', 'Karen Silk'] },
      'SNB': { name: 'Swiss National Bank', currency: 'CHF', country: 'Switzerland', speakers: ['Thomas Jordan', 'Martin Schlegel', 'Antoine Martin'] }
    };
  }

  /**
   * Get list of all supported central banks
   */
  getCentralBanks() {
    return this.centralBanks;
  }

  /**
   * Get central bank info by code
   */
  getCentralBankByCode(code) {
    return this.centralBanks[code.toUpperCase()] || null;
  }

  /**
   * Make a request to DeepSeek API
   */
  async makeRequest(messages) {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error('DEEPSEEK_API_KEY not configured'));
        return;
      }

      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: 0.2, // Very low for maximum analytical precision
        max_tokens: 400 // Keep responses concise
      };

      const data = JSON.stringify(requestBody);

      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.error) {
              reject(new Error(response.error.message || 'DeepSeek API error'));
            } else {
              resolve(response);
            }
          } catch (e) {
            reject(new Error('Failed to parse DeepSeek response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Analyze a central bank speech for dovish/hawkish/neutral sentiment
   * @param {string} speechText - The speech text to analyze
   * @param {string} speaker - The speaker name (e.g., "Jerome Powell", "Christine Lagarde")
   * @param {string} centralBank - The central bank (e.g., "Federal Reserve", "ECB")
   * @param {string} date - The date of the speech
   * @returns {Object} Analysis result with sentiment, score, key quotes, and reasoning
   */
  async analyzeSpeech(speechText, speaker, centralBank, date) {
    // Check cache
    const cacheKey = `${speaker}-${date}-${speechText.substring(0, 100)}`;
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('Returning cached speech analysis');
      return cached.data;
    }

    const systemPrompt = `You are a macro policy analyst specializing in central bank communication.

CORE PRINCIPLE:
You do NOT infer numeric expectations unless explicitly stated.
You reason in terms of POLICY PATHS, not forecasts.
Markets price distributions of policy paths, not single outcomes.
Surprise = CHANGE IN RELATIVE WEIGHT between plausible paths.

FORBIDDEN:
- Do NOT claim "market expected X rate cuts"
- Do NOT invent consensus numbers
- Do NOT use absolutes unless explicitly stated by central bank

REQUIRED LANGUAGE:
Use: "reinforces", "de-emphasizes", "keeps alive", "raises bar", "adds conditionality"
Avoid: "market expected", "consensus was", "priced for"

OUTPUT FORMAT (STRICT):
# [Speaker] - [Date]

🟥/🟩/🟨 **[HAWKISH/DOVISH/NEUTRAL]**

**Path Shift:** [1 sentence - which policy path gained/lost credibility]
**Next CB Move:** [1 sentence - path implication, NO numeric forecasts]
**Smart Money:** [1 sentence - institutional flow from this reweighting]

**Market Impact:** [1-2 sentences on USD, bonds, equities via policy transmission]

RULES: Max 100 words. No hallucinated expectations. Path-based reasoning only.`;

    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const userPrompt = `${centralBank} speech by ${speaker} (${date}):

${speechText}

ANALYZE:
1. Which policy paths (e.g., sustained hold, gradual easing, data-dependent pivot) were plausible BEFORE?
2. How did this speech REWEIGHT those paths?
3. What's the directional bias WITHOUT inventing numeric expectations?

Output in under 100 words using ONLY the format above. NO hallucinated market expectations.`;

    try {
      const response = await this.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      const content = response.choices[0].message.content;

      // Extract sentiment from the markdown badge
      let sentiment = 'NEUTRAL';
      let score = 0;

      if (content.includes('🟥 HAWKISH')) {
        sentiment = 'HAWKISH';
        score = 60;
      } else if (content.includes('🟩 DOVISH')) {
        sentiment = 'DOVISH';
        score = -60;
      } else if (content.includes('🟨 NEUTRAL')) {
        sentiment = 'NEUTRAL';
        score = 0;
      }

      // Create analysis object with markdown content
      const analysis = {
        sentiment: sentiment,
        score: score,
        confidence: 75, // Default confidence
        summary: content, // Full markdown content
        markdown: content, // Store the full markdown for display
        keyQuotes: [], // Not extracted from markdown format
        policyImplications: {}, // Not extracted from markdown format
        reasoning: content,
        rawResponse: content
      };

      // Add metadata
      analysis.speaker = speaker;
      analysis.centralBank = centralBank;
      analysis.date = date;
      analysis.analyzedAt = new Date().toISOString();

      // Cache the result with LRU eviction
      this.addToCache(cacheKey, analysis);

      return analysis;
    } catch (error) {
      console.error('DeepSeek analysis error:', error.message);
      throw error;
    }
  }

  /**
   * Analyze multiple speeches and compare sentiment trends
   * @param {Array} speeches - Array of {text, speaker, centralBank, date}
   * @returns {Object} Comparison analysis
   */
  async compareSpeeches(speeches) {
    const analyses = [];

    for (const speech of speeches) {
      try {
        const analysis = await this.analyzeSpeech(
          speech.text,
          speech.speaker,
          speech.centralBank,
          speech.date
        );
        analyses.push(analysis);
      } catch (error) {
        console.error(`Failed to analyze speech from ${speech.date}:`, error.message);
      }
    }

    // Calculate trend
    const scores = analyses.map(a => a.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const trend = scores.length >= 2 ?
      (scores[scores.length - 1] - scores[0] > 10 ? 'MORE_HAWKISH' :
       scores[scores.length - 1] - scores[0] < -10 ? 'MORE_DOVISH' : 'STABLE') :
      'INSUFFICIENT_DATA';

    return {
      analyses,
      summary: {
        averageScore: avgScore,
        trend,
        speechCount: analyses.length,
        dateRange: {
          from: speeches[0]?.date,
          to: speeches[speeches.length - 1]?.date
        }
      }
    };
  }

  /**
   * Quick sentiment check for a headline or short text
   * @param {string} text - Short text to analyze
   * @returns {Object} Quick sentiment result
   */
  async quickSentiment(text) {
    const systemPrompt = `You are a monetary policy analyst. Analyze the following central bank related text and respond with ONLY a JSON object:
{
  "sentiment": "HAWKISH" | "DOVISH" | "NEUTRAL",
  "score": <-100 to +100>,
  "brief": "<one sentence explanation>"
}`;

    try {
      const response = await this.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ]);

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return { sentiment: 'NEUTRAL', score: 0, brief: 'Unable to determine sentiment' };
    } catch (error) {
      console.error('Quick sentiment error:', error.message);
      throw error;
    }
  }

  /**
   * Add to cache with LRU eviction
   */
  addToCache(key, data) {
    this.analysisCache.set(key, {
      timestamp: Date.now(),
      data: data
    });

    // Evict oldest entries when cache exceeds max size
    if (this.analysisCache.size > this.maxCacheSize) {
      const entries = Array.from(this.analysisCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.ceil(this.analysisCache.size * 0.2);
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.analysisCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Clear the analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
  }
}

module.exports = new DeepSeekAI();
