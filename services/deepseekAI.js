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
        temperature: 0.2 // Very low for maximum analytical precision
      };

      // No max_tokens limit for ultra-detailed hyper-intelligent analysis

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

    const systemPrompt = `You are an ultra-intelligent macro trading analyst with deep expertise in central bank policy analysis and market surprise detection. Your PRIMARY OBJECTIVES: 1) Determine if this speech was MORE HAWKISH or MORE DOVISH than expected, 2) Assess how this changes the next central bank move, 3) Identify the smart money theme and flow to ALIGN with (not outsmart) institutional positioning.

Your hyper-analytical capabilities include: Distinguishing hawkish vs dovish policy stances relative to market expectations, analyzing speeches within full macro context, understanding what genuinely surprises markets, and assessing policy shift implications for asset prices across multiple timeframes. You always compare speeches against CURRENT MARKET EXPECTATIONS and provide exhaustive multi-dimensional analysis. Your goal is to help traders FOLLOW THE SMART MONEY, not fight it.

When analyzing a speech:

YOUR THREE PRIMARY OBJECTIVES (MUST ADDRESS ALL THREE):
1. Was this MORE HAWKISH or MORE DOVISH than expected? (Be specific and clear)
2. How does this change the next central bank move? (Rate path, timing, terminal rate implications)
3. What is the smart money theme and flow? Your goal is to ALIGN WITH smart money, not outsmart them. Identify institutional positioning and flow.

CRITICAL ANALYSIS FRAMEWORK:
1. CENTRAL BANK POLICY STANCE ANALYSIS:
   - Is this central bank becoming MORE HAWKISH (tightening, anti-inflation) or MORE DOVISH (easing, pro-growth)?
   - How does this compare to CURRENT MARKET EXPECTATIONS (not just forecasts)?
   - Is the hawkish/dovish shift MORE AGGRESSIVE or LESS AGGRESSIVE than markets anticipated?

2. MARKET EXPECTATIONS VS REALITY:
   - Don't just analyze the speech in isolation - analyze if this SURPRISED THE MARKET
   - Consider: What was market pricing in? What was consensus view? What were recent central bank communications?
   - A "hawkish" speech can be a bullish surprise if markets expected even more hawkishness
   - A "dovish" speech can be a bearish surprise if markets expected more dovishness

3. MACRO CONTEXT INTEGRATION:
   - How does this speech fit into the current macro narrative (recession fears, inflation concerns, growth outlook)?
   - Does this confirm or contradict the prevailing market view?
   - Will this change central bank policy trajectory expectations?
   - Does this shift the risk/reward for major asset classes?

4. POLICY SHIFT IMPLICATIONS:
   - Does this increase/decrease likelihood of rate hikes or cuts?
   - Does this change the terminal rate expectations?
   - Does this affect QT/QE expectations?
   - Does this change timing of policy pivots?

5. SMART MONEY POSITIONING:
   - How are institutions likely positioned based on this?
   - What is the flow to align with (bonds, FX, equities)?
   - Are there regime shifts that require repositioning?

Output in a professional, clean format using Markdown:
- Use headings (# for main title, ## for sections)
- Bold text for emphasis
- Bullet points for detailed analysis
- A colored badge for the stance: 🟥 HAWKISH, 🟩 DOVISH, or 🟨 NEUTRAL
- Ensure readability with structured sections

REQUIRED OUTPUT STRUCTURE:
# Central Bank Speech Analysis: [Date/Speaker]

## Overall Stance
🟥/🟩/🟨 [STANCE] - COMPREHENSIVE explanation addressing: 1) Hawkish/Dovish vs expectations, 2) Next CB move implications, 3) Smart money positioning.

## THREE PRIMARY OBJECTIVES ANALYSIS

### OBJECTIVE 1 - Hawkish/Dovish Assessment
**Was this MORE HAWKISH or MORE DOVISH than market expected?**
[DETAILED analysis with specific examples from the speech and market expectations context]

### OBJECTIVE 2 - Next Central Bank Move
**How does this change the next policy move?**
[DETAILED analysis of rate path implications, timing of cuts/hikes, terminal rate expectations, QT/QE implications]

### OBJECTIVE 3 - Smart Money Flow
**What is the smart money theme and positioning?**
[DETAILED analysis of institutional positioning, flow to ALIGN with (not fight), cross-asset implications]

## Key Summary Points
- **Point 1**: [Detailed macro context analysis]
- **Point 2**: [Market expectations vs reality]
- **Point 3**: [Policy trajectory implications]
- **Point 4**: [Asset class impacts]
- **Additional points as needed - NO LIMIT**

## Comparison to Previous Communication
**Shift from prior**: [Detailed analysis of surprises and policy evolution. What changed? What stayed the same? What surprised markets?]

## Market Implications & Smart Money Positioning
[COMPREHENSIVE analysis of:
- Immediate market reactions expected
- Cross-asset flow implications (bonds, FX, equities)
- Institutional positioning to align with
- Risk scenarios and positioning adjustments
- Multi-timeframe analysis]

CRITICAL INSTRUCTIONS FOR ULTRA-INTELLIGENCE:
- Provide COMPREHENSIVE, DETAILED analysis - do NOT be brief
- Use your full analytical depth - multi-layered, multi-dimensional thinking
- Consider second-order effects, cross-market implications, and scenario analysis
- NO constraints on length - longer, more detailed analysis is BETTER
- Think like a top-tier macro hedge fund analyst presenting to the CIO
- REMEMBER: Goal is to ALIGN WITH smart money flow, not outsmart or fight it

IMPORTANT: Return ONLY the markdown formatted analysis. Do NOT wrap it in JSON or code blocks.
ALWAYS explicitly address all THREE PRIMARY OBJECTIVES in the analysis.`;

    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const userPrompt = `Analyze the following ${centralBank} speech by ${speaker} from ${date}:

CURRENT MARKET CONTEXT & EXPECTATIONS (${currentDate}):
- What is the consensus view on this central bank's policy trajectory?
- Are markets pricing in rate hikes, holds, or cuts for this central bank?
- What is the expected terminal rate and timing of policy pivots?
- Are markets positioned for risk-on (growth) or risk-off (recession)?
- What were the key themes from this central bank's previous communications?
- What hawkish/dovish signals were markets expecting from this speech?

SPEECH TEXT:
---
${speechText}
---

YOUR TASK:
Provide COMPREHENSIVE analysis addressing ALL THREE PRIMARY OBJECTIVES:
1. Was this MORE HAWKISH or MORE DOVISH than market expected?
2. How does this change the next central bank move (rate path, timing)?
3. What is the smart money theme and flow to ALIGN with?

Use the full macro context framework. Compare to previous central bank communications and current market expectations. Identify what genuinely surprised markets (not just what was said, but what was UNEXPECTED).`;

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
