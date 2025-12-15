/**
 * DeepSeek AI Service for Central Bank Speech Analysis
 * Analyzes CB speeches for dovish/hawkish/neutral sentiment
 * Supports all G8 Central Banks
 */

const https = require('https');

class DeepSeekAI {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseUrl = 'api.deepseek.com';
    this.model = 'deepseek-chat';
    this.analysisCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes cache

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

      const data = JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 2000
      });

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

    const systemPrompt = `You are an expert monetary policy analyst and forex trader specializing in central bank communications. Your task is to analyze central bank speeches and determine their monetary policy stance IN THE CONTEXT OF CURRENT MACRO CONDITIONS.

CURRENT MACRO CONTEXT (December 2024):
- Global inflation has been moderating but remains above most CB targets
- Fed has begun cutting rates but pace is data-dependent
- ECB has started easing cycle amid weak European growth
- BOE cautious on cuts due to sticky UK services inflation
- BOJ ended negative rates, cautiously normalizing policy
- Markets pricing in rate cuts for 2025 across most G8 central banks
- Key themes: disinflation progress, labor market cooling, growth concerns, tariff/trade uncertainty

ANALYSIS FRAMEWORK - INTERPRET RELATIVE TO MARKET EXPECTATIONS:
- HAWKISH: More restrictive than market expects - pushing back on rate cut expectations, emphasizing inflation risks, signaling patience on cuts
  - In current context: Any resistance to priced-in cuts, emphasis on inflation not being defeated, upside risks to prices
- DOVISH: More accommodative than market expects - supporting rate cuts, downplaying inflation, emphasizing growth/employment risks
  - In current context: Faster/deeper cuts than priced, concerns about overtightening, focus on labor market weakness
- NEUTRAL: In line with market expectations, balanced risks
  - In current context: Data-dependent, no strong signal either direction

KEY ANALYSIS PRINCIPLES:
1. Context matters: "Inflation is still above target" is neutral if everyone knows that - only hawkish if emphasized as reason to delay cuts
2. Relative to expectations: A "patient" Fed when markets expect 6 cuts is hawkish; same language when expecting 2 cuts is neutral
3. Look for surprises: What in this speech would move markets? That reveals the real signal
4. Consider the speaker: Hawks sounding dovish or doves sounding hawkish is more significant

Provide your analysis in the following JSON format:
{
  "sentiment": "HAWKISH" | "DOVISH" | "NEUTRAL",
  "score": <number from -100 (very dovish) to +100 (very hawkish)>,
  "confidence": <percentage 0-100>,
  "summary": "<2-3 sentence summary focusing on what's NEW or SURPRISING vs market expectations>",
  "keyQuotes": [
    {
      "quote": "<exact quote from the speech>",
      "interpretation": "<why this quote matters in current macro context>",
      "sentiment": "HAWKISH" | "DOVISH" | "NEUTRAL"
    }
  ],
  "policyImplications": {
    "rateOutlook": "<how this changes rate expectations vs what's priced>",
    "inflationView": "<speaker's view on inflation relative to consensus>",
    "growthView": "<speaker's view on growth relative to consensus>",
    "marketImpact": "<expected FX/rates impact and direction>"
  },
  "reasoning": "<detailed explanation of your analysis, explicitly referencing current macro context>"
}`;

    const userPrompt = `Analyze the following ${centralBank} speech by ${speaker} from ${date}:

---
${speechText}
---

Provide a detailed analysis of the monetary policy stance with specific quotes and citations from the speech.`;

    try {
      const response = await this.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      const content = response.choices[0].message.content;

      // Try to parse as JSON
      let analysis;
      try {
        // Extract JSON from response (might be wrapped in markdown code blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        // If JSON parsing fails, create a structured response from the text
        analysis = {
          sentiment: 'NEUTRAL',
          score: 0,
          confidence: 50,
          summary: content.substring(0, 500),
          keyQuotes: [],
          policyImplications: {},
          reasoning: content,
          rawResponse: content
        };
      }

      // Add metadata
      analysis.speaker = speaker;
      analysis.centralBank = centralBank;
      analysis.date = date;
      analysis.analyzedAt = new Date().toISOString();

      // Cache the result
      this.analysisCache.set(cacheKey, {
        timestamp: Date.now(),
        data: analysis
      });

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
   * Clear the analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
  }
}

module.exports = new DeepSeekAI();
