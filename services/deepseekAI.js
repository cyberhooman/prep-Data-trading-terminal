/**
 * DeepSeek AI Service for Central Bank Speech Analysis
 * Analyzes CB speeches for dovish/hawkish/neutral sentiment
 */

const https = require('https');

class DeepSeekAI {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseUrl = 'api.deepseek.com';
    this.model = 'deepseek-chat';
    this.analysisCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes cache
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

    const systemPrompt = `You are an expert monetary policy analyst specializing in central bank communications. Your task is to analyze central bank speeches and determine their monetary policy stance.

ANALYSIS FRAMEWORK:
- HAWKISH: Indicates tighter monetary policy, higher interest rates, concern about inflation
  - Keywords: inflation concerns, price stability, tightening, rate hikes, restrictive policy, vigilant on inflation
- DOVISH: Indicates looser monetary policy, lower interest rates, focus on growth/employment
  - Keywords: economic slowdown, support growth, accommodative, patient, data-dependent (leaning easy), rate cuts
- NEUTRAL: Balanced view, no clear policy direction
  - Keywords: balanced risks, monitoring data, both sides of mandate, wait and see

Provide your analysis in the following JSON format:
{
  "sentiment": "HAWKISH" | "DOVISH" | "NEUTRAL",
  "score": <number from -100 (very dovish) to +100 (very hawkish)>,
  "confidence": <percentage 0-100>,
  "summary": "<2-3 sentence summary of the speech's monetary policy implications>",
  "keyQuotes": [
    {
      "quote": "<exact quote from the speech>",
      "interpretation": "<why this quote is significant>",
      "sentiment": "HAWKISH" | "DOVISH" | "NEUTRAL"
    }
  ],
  "policyImplications": {
    "rateOutlook": "<expected rate path based on this speech>",
    "inflationView": "<speaker's view on inflation>",
    "growthView": "<speaker's view on economic growth>",
    "marketImpact": "<expected impact on markets>"
  },
  "reasoning": "<detailed explanation of your analysis>"
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
