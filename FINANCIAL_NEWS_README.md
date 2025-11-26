# FinancialJuice News Scraper

This module scrapes ONLY red-bordered critical news from FinancialJuice.com, filtering for the most critical market-moving events with red signal indicators.

## Features

- ✅ Scrapes ONLY red-bordered critical news items (active-critical class)
- ✅ **2-day retention** - Critical news stays visible for 2 days after first appearance
- ✅ Extracts economic data (Actual, Forecast, Previous values)
- ✅ Tags and categorization (USD, EUR, Bonds, etc.)
- ✅ Automatic deduplication
- ✅ Shows "time ago" badge for each critical alert
- ✅ 1-minute caching to reduce load
- ✅ Headless browser automation with Puppeteer

## API Endpoints

### Get Latest News
```
GET /api/financial-news
```

**Response:**
```json
{
  "success": true,
  "count": 21,
  "data": [
    {
      "headline": "US PPI YoY Actual 2.7% (Forecast 2.6%, Previous 2.6%)",
      "timestamp": "2025-11-25T17:30:00.000Z",
      "economicData": {
        "actual": "2.7%",
        "forecast": "2.6%",
        "previous": "2.6%"
      },
      "tags": ["Forex", "US Bonds", "US Indexes", "USD"],
      "hasChart": false,
      "isCritical": true,
      "isActive": true,
      "scrapedAt": "2025-11-25T18:00:00.000Z"
    }
  ],
  "lastUpdated": "2025-11-25T18:00:00.000Z"
}
```

### Force Refresh Cache
```
POST /api/financial-news/refresh
```

Clears the cache and fetches fresh data immediately.

## Usage

### Backend (Node.js)

```javascript
const financialJuiceScraper = require('./services/financialJuiceScraper');

// Get latest news
const news = await financialJuiceScraper.getLatestNews();
console.log(`Found ${news.length} high-impact news items`);

// Clear cache if needed
financialJuiceScraper.clearCache();

// Clean up (close browser) when done
await financialJuiceScraper.close();
```

### Frontend (React/Next.js)

```tsx
import FinancialNewsFeed from '@/components/FinancialNewsFeed';

export default function Dashboard() {
  return (
    <div>
      <h1>Trading Dashboard</h1>
      <FinancialNewsFeed />
    </div>
  );
}
```

## Testing

Run the test script to verify the scraper is working:

```bash
node test-scraper.js
```

Expected output:
```
Testing FinancialJuice scraper...
Fetching fresh news from FinancialJuice...
Found 46 news items before deduplication
Found 21 unique high-impact news items
✓ Scraper executed successfully
```

## Debug Mode

To see the browser and inspect what's being scraped:

```bash
node debug-scraper.js
```

This will:
- Open a visible browser window
- Take a screenshot (saved as `financialjuice-debug.png`)
- Show detailed page structure
- Stay open for 10 seconds for inspection

## Configuration

Edit `services/financialJuiceScraper.js` to adjust:

```javascript
class FinancialJuiceScraper {
  constructor() {
    this.baseUrl = 'https://www.financialjuice.com';
    this.newsCache = [];
    this.lastFetch = null;
    this.cacheTimeout = 60000; // 1 minute cache (adjust as needed)
    this.browser = null;
  }
}
```

## What Gets Scraped

The scraper filters ONLY for red-bordered critical news by looking for:

1. **Critical Items ONLY**: News marked with `active-critical` class (red border on FinancialJuice)
2. **Economic Data**: Extracts Actual/Forecast/Previous values if present
3. **Tags**: Captures associated tags like USD, EUR, Bonds, etc.

### Example News Types Captured:

- **Critical Economic Releases**: "US PPI YoY Actual 2.7% (Forecast 2.6%, Previous 2.6%)" [with red border]
- **Critical Market-Moving Headlines**: Major Fed announcements, policy changes [with red border]
- **Critical Geopolitical Events**: Major breaking news affecting markets [with red border]

**Note**: Only items with red borders (active-critical class) are included. Regular news items are filtered out.

**Important**: Red-bordered items only appear during truly critical market events (major breaking news, unexpected economic data, emergency announcements, etc.). It's normal for the feed to show 0 items most of the time. When you see items here, they are extremely high-priority signals that require immediate attention.

**2-Day Retention**: Once a critical news item appears, it will remain visible for 2 days even if it's removed from the live FinancialJuice feed. Each item shows a "🔴 X hours/days ago" badge indicating when it first appeared, so you never miss critical market events.

## Dependencies

```json
{
  "puppeteer": "^latest",
  "axios": "^latest",
  "cheerio": "^latest"
}
```

Install with:
```bash
npm install puppeteer axios cheerio
```

## Performance

- **First request**: ~3-5 seconds (launches browser, navigates, scrapes)
- **Cached requests**: Instant (within 1 minute cache window)
- **Memory usage**: ~100-200MB (Chromium browser)

## Troubleshooting

### No news items found
1. Check if FinancialJuice changed their HTML structure
2. Run `debug-scraper.js` to inspect the page
3. Update selectors in `services/financialJuiceScraper.js` if needed

### Browser errors
1. Ensure Chromium/Chrome is installed
2. Try adding more args to Puppeteer launch options
3. Check firewall/proxy settings

### High memory usage
1. Reduce cache timeout to close browser more frequently
2. Call `scraper.close()` when not needed
3. Use headless mode (already enabled by default)

## Future Enhancements

- [ ] Add filtering by specific categories (only USD news, only Bonds, etc.)
- [ ] Implement WebSocket for real-time updates
- [ ] Add sentiment analysis for headlines
- [ ] Store historical news in database
- [ ] Add alerting for specific keywords or data thresholds

## License

ISC
