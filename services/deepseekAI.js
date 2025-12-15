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

    const systemPrompt = `You are an expert in central bank policy analysis, specializing in assessing speeches for dovish (easing-oriented), hawkish (tightening-oriented), or neutral stances on interest rates. Your goal is to provide high-level, market-focused insights without granular word-by-word breakdowns.

When analyzing a speech:
1. Focus exclusively on implications for future interest rates, economic outlook, inflation, and policy guidance.
2. Summarize key points concisely.
3. Rate the overall stance: HAWKISH (signals tighter policy, higher rates, or caution on cuts), DOVISH (signals easing, rate cuts, or optimism on inflation cooling), or NEUTRAL (no strong shift).
4. Compare to previous speeches, noting shifts or surprises that could drive market reactions—markets only move on clear, unexpected guidance; ignore vague or repeated statements.
5. Keep the entire response under 300 words.

Output in a professional, clean format using Markdown:
- Use headings (# for main title, ## for sections)
- Bold text for emphasis
- Bullet points for summaries
- A colored badge for the stance: 🟥 HAWKISH, 🟩 DOVISH, or 🟨 NEUTRAL
- Ensure readability with short paragraphs and whitespace

Example output structure:
# Central Bank Speech Analysis: [Date/Speaker]

## Overall Stance
🟩 DOVISH - Brief rationale.

## Key Summary Points
- **Bullet 1**: Main point on rates.
- **Bullet 2**: Economic outlook.

## Comparison to Previous Speech(es)
**Shift from prior**: [Details on surprises].

## Market Implications
Potential reactions based on surprises.

IMPORTANT: Return ONLY the markdown formatted analysis. Do NOT wrap it in JSON or code blocks.`;

    const userPrompt = `Analyze the following ${centralBank} speech by ${speaker} from ${date}:

Latest speech text:
---
${speechText}
---

Note: Compare to previous speeches from this central bank if you have context, otherwise focus on the current speech's market implications.`;

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
