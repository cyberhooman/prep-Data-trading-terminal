# Data Trading Terminal - AlphaLabs

A professional-grade macro trading terminal providing real-time market intelligence, AI-powered analysis, and comprehensive economic data tracking. Built for institutional traders and sophisticated market participants.

## 🎯 Overview

AlphaLabs is a full-stack trading intelligence platform that combines:
- **Real-time critical market news** with AI sentiment analysis
- **Central bank speech tracking** and hawkish/dovish policy analysis
- **Economic calendar** with surprise detection
- **Currency strength analysis** across major pairs
- **Policy path framework** for institutional-grade macro analysis

## 🚀 Key Features

### 1. **Critical Market News Feed**
- **Red mark detection only**: Shows ONLY news with red visual markers on FinancialJuice
- **1-minute cache refresh** for breaking news
- **5-layer red detection**: Multi-method approach to catch all red-marked news
- **AI-powered analysis**: DeepSeek integration for instant market impact assessment
- **Policy path framework**: Analyzes news via institutional reweighting methodology
- **Source**: FinancialJuice integration with automated login

**5-Layer Red Mark Detection:**
1. **CSS class markers**: active-critical, critical, high-impact
2. **CRITICAL badge text**: 🔴 CRITICAL badge detection
3. **Inline red styles**: 13+ red color pattern matching
4. **Parent red styles**: Red background/border on parent elements
5. **Computed red styles**: Browser-computed background/border colors

**Recent Improvements:**
- Reduced cache timeout: 2min → 1min for faster breaking news
- Increased scroll iterations: 3/6 → 5/10 to catch late-breaking items
- Enhanced critical detection with 13 red color patterns
- Comprehensive logging of ALL critical headlines with timestamps
- Recency failsafe: Alerts if no critical news from last hour

### 2. **High Impact News Dashboard**
- **Keyword-based detection**: Automatically flags market-moving events
- **Multiple categories**: Supreme Court decisions, tariffs, executive orders, wars, CB decisions, sanctions, emergencies
- **Real-time tracking**: Updates every 2 minutes
- **Independent from red marks**: Separate from Critical Market News feed
- **AI analysis**: Integrated market impact assessment
- **Categories tracked**:
  - ⚖️ Supreme Court decisions & court rulings
  - 📊 Tariffs & trade wars
  - 🏛️ Executive orders & presidential decrees
  - 💣 Military actions, wars, invasions
  - 🏦 Central bank decisions & rate decisions
  - 📉 Bankruptcies, defaults, bailouts
  - ⚡ Sanctions & embargoes
  - 🚨 Emergency declarations & breaking news

### 3. **Central Bank Speech Analysis**
- **G8 Central Bank coverage**: Fed, ECB, BOE, BOJ, BOC, RBA, RBNZ, SNB
- **AI policy analysis**: Hawkish/dovish stance with policy path reweighting
- **Speaker tracking**: Monitors key central bank officials
- **Real-time detection**: Scrapes CB speeches from financial news feeds
- **Sentiment scoring**: Quantitative hawkish/dovish scale

**Analysis Framework:**
- No hallucinated expectations - only evidence-based analysis
- Policy path language: "reinforces", "de-emphasizes", "raises bar"
- Confidence disclaimers for interpretation-based insights
- Ultra-concise output (80 words) optimized for mobile

### 4. **AI-Powered Market Analysis**

**Two-Mode Analysis:**

**A. Policy/Economic News (DeepSeekAnalyzer)**
```json
{
  "pre_event_paths": ["Baseline", "Alternative", "Tail"],
  "data_signals": ["Key observations"],
  "path_reweighting": {
    "gained": ["Paths that gained credibility"],
    "lost": ["Paths that lost credibility"]
  },
  "surprise_type": "Path-shifting|Path-reinforcing|Path-constraining|In-line",
  "directional_bias": "Hawkish|Mildly Hawkish|Neutral|Dovish|Mildly Dovish",
  "verdict": "Bullish Surprise|Bearish Surprise|Neutral",
  "assetImpact": { "USD": "...", "Stocks": "...", "Bonds": "...", "Gold": "..." },
  "reasoning": "[MAX 60 words]",
  "confidence_note": "[Required if interpretation-based]"
}
```

**B. Central Bank Speeches (DeepSeekAI)**
```markdown
# [Speaker] - [Date]

🟥/🟩/🟨 **[HAWKISH/DOVISH/NEUTRAL]**

**Path Shift:** [Which path gained/lost credibility]
**Market Impact:** [USD, bonds, equities transmission]

**Note:** [Confidence disclaimer if interpretation-based]
```

**Anti-Hallucination Framework:**
- ❌ FORBIDDEN: "market expected X", consensus numbers, numeric forecasts
- ✅ REQUIRED: Policy path reasoning, evidence-based language
- ✅ Structured JSON output for traceability
- ✅ Confidence notes when interpreting vs stating facts

### 5. **Economic Calendar**
- **Real-time data**: Major economic releases (GDP, CPI, Employment, etc.)
- **Surprise detection**: Actual vs Forecast comparison
- **Impact classification**: High/Medium/Low importance
- **Historical tracking**: 7-day news retention
- **Multi-currency coverage**: USD, EUR, GBP, JPY, CAD, AUD, NZD, CHF

### 6. **Currency Strength Dashboard**
- **Real-time FX rates** via Twelve Data API
- **Relative strength analysis** across major pairs
- **Visual heatmaps** for quick pattern recognition
- **Cross-pair analysis** for trading opportunities

### 7. **User Management**
- **Google OAuth 2.0** authentication
- **Session management** with secure cookies
- **User preferences** and watchlists
- **Role-based access** control

## 🛠️ Technology Stack

### Backend
- **Node.js + Express** - REST API server
- **Puppeteer** - Headless browser for web scraping
- **DeepSeek AI** - LLM for policy/market analysis
- **SQLite** - Lightweight database for news history
- **Passport.js** - Authentication middleware

### Frontend
- **React** - UI components
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first styling
- **Lucide Icons** - Icon system

### Infrastructure
- **Railway** - Cloud hosting platform
- **Google Chrome** - Headless browser (apt installed)
- **Environment-based config** - Dev/Prod separation

## 📦 Installation

### Prerequisites
```bash
Node.js 18+
npm or yarn
Google Chrome (for Puppeteer)
```

### Setup

1. **Clone repository**
```bash
git clone <repository-url>
cd "Data trading Alphalabs"
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create `.env` file in root:
```env
# Server
PORT=3001
NODE_ENV=development

# Authentication
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SESSION_SECRET=your_random_session_secret

# Financial Data APIs
DEEPSEEK_API_KEY=your_deepseek_api_key
TWELVE_DATA_API_KEY=your_twelve_data_api_key

# Financial News
FINANCIALJUICE_EMAIL=your_financialjuice_email
FINANCIALJUICE_PASSWORD=your_financialjuice_password

# Memory Management (Optional)
LOW_MEMORY_MODE=false
```

4. **Run development server**
```bash
npm run dev
```

5. **Access application**
```
http://localhost:3001
```

## 🚀 Deployment

### Railway Deployment

See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed deployment instructions.

**Quick Deploy:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

**Required Railway Configuration:**
- Add all environment variables via Railway dashboard
- Install Google Chrome via apt packages:
  ```
  google-chrome-stable
  ```
- Set memory limits if needed: `LOW_MEMORY_MODE=true`

## 📖 API Documentation

### Financial News Endpoints

**Get Critical Market News**
```http
GET /api/financial-news
```

**Get All News (Including Non-Critical)**
```http
GET /api/financial-news/all
```

**Get CB Speeches**
```http
GET /api/cb-speeches
```

**Analyze News with AI**
```http
POST /api/analyze-news
Content-Type: application/json

{
  "headline": "US GDP Growth Actual 2.8% (Forecast 2.5%, Previous 2.3%)",
  "economicData": {
    "actual": "2.8%",
    "forecast": "2.5%",
    "previous": "2.3%"
  }
}
```

### Currency Strength Endpoints

**Get Currency Strength**
```http
GET /api/currency-strength
```

**Get FX Rates**
```http
GET /api/fx-rates
```

## 🔧 Configuration

### Memory Optimization

For low-memory environments (Railway 512MB):
```env
LOW_MEMORY_MODE=true
```

**Impact:**
- Scroll iterations: 5 vs 10
- Scroll delay: 1200ms vs 1800ms
- Browser args: Optimized for low memory

### Cache Settings

**News Cache:**
- Critical news: 1 minute TTL
- All news: 1 minute TTL
- News history: 7 days retention

**Analysis Cache:**
- AI analysis: 1 hour TTL
- Market context: 30 minutes TTL
- Maximum 50 cached entries

## 🧪 Key Code Files

```
services/
├── financialJuiceScraper.js   # Critical news scraping with zero-miss guarantee
├── deepseekAI.js              # CB speech analysis (markdown output)
├── deepseekAnalyzer.js        # Market news analysis (JSON output)
├── cbSpeechScraper.js         # Central bank speech detection
├── currencyStrength.js        # FX data and strength calculations
└── database.js                # SQLite news history management

pages/
├── financial-news.jsx         # Critical market news UI (red marks only)
├── high-impact-news.jsx       # High impact news dashboard (keyword detection)
├── cb-speech-analysis.jsx     # Central bank speech analysis
├── currency-strength.jsx      # FX strength heatmap
└── macro-ai-analysis.jsx      # AI analysis interface

index.js                       # Express server & API routes
```

## 🎨 UI Features

### Dark Theme
- Professional dark mode optimized for trading
- High contrast for data readability
- Color-coded sentiment indicators

### Mobile Responsive
- Touch-optimized controls
- Condensed data views
- Ultra-concise AI analysis (60-80 words)

### Real-time Updates
- Auto-refresh every 1 minute for critical news
- WebSocket support for instant updates (optional)
- Visual indicators for new data

## 📊 Data Sources

1. **FinancialJuice** - Critical market news and CB speeches
2. **Twelve Data** - FX rates and currency data
3. **DeepSeek AI** - Market analysis and policy interpretation
4. **Economic Calendar APIs** - Scheduled releases and data

## 🔒 Security

- **HTTPS enforced** in production
- **OAuth 2.0** for authentication
- **Secure session cookies** with httpOnly flag
- **Environment variable** protection for secrets
- **Input sanitization** for all user inputs
- **No client-side API keys**

## 🐛 Troubleshooting

### Browser Issues
If Puppeteer fails to launch:
```bash
# Check Chrome installation
which google-chrome-stable

# Railway: Verify apt packages
google-chrome-stable
```

### Memory Issues
If hitting Railway memory limits:
```env
LOW_MEMORY_MODE=true
```

### Missing Critical News
Check logs for:
- `⚠️ WARNING: NO CRITICAL NEWS FOUND`
- Scroll iterations completed
- Red pattern detection results
- Recency failsafe warnings

### API Rate Limits
- DeepSeek: Caches for 1 hour
- Twelve Data: Free tier limits
- FinancialJuice: Login session management

## 📝 Recent Updates

### January 2026
- ✅ Implemented policy path framework for AI analysis
- ✅ Eliminated AI hallucination with anti-consensus rules
- ✅ Structured JSON output for market news
- ✅ Confidence disclaimers for interpretation-based analysis
- ✅ Reduced AI output: 200-300 words → 60-100 words
- ✅ Fixed critical news detection (13+ red patterns)
- ✅ Cache optimization: 2min → 1min for breaking news
- ✅ Enhanced logging for missed news debugging
- ✅ Recency failsafe for stale news detection

## 🤝 Contributing

This is a private trading terminal. Contact the development team for access.

## 📄 License

Proprietary - All rights reserved

## 🔗 Related Documentation

- [Financial News Setup](FINANCIAL_NEWS_README.md)
- [Railway Deployment](RAILWAY_DEPLOYMENT.md)
- [Google OAuth Setup](GOOGLE_AUTH_SETUP.md)
- [X/Twitter API Setup](X_API_SETUP.md)
- [Railway Environment](RAILWAY_ENV.md)

## 📧 Support

For issues or questions:
1. Check logs for error messages
2. Review environment variable configuration
3. Verify API key validity
4. Contact development team

---

**Built for institutional macro traders • Real-time intelligence • Zero compromises**
