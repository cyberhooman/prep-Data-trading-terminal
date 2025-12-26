/**
 * Finnhub News Service
 * ------------------------------------------------
 * Fetches financial news from Finnhub.io API
 * Free tier: 60 API calls/minute
 */

const https = require('https');

// Cache for news data
let newsCache = {
  general: { data: [], lastFetched: 0 },
  forex: { data: [], lastFetched: 0 },
  crypto: { data: [], lastFetched: 0 }
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetch news from Finnhub API
 * @param {string} category - News category: general, forex, crypto, merger
 * @returns {Promise<Array>} - Array of news articles
 */
async function fetchNews(category = 'general') {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    console.warn('FINNHUB_API_KEY not set. Using mock data.');
    return getMockNews();
  }

  // Check cache
  const cached = newsCache[category];
  if (cached && Date.now() - cached.lastFetched < CACHE_DURATION) {
    return cached.data;
  }

  return new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/news?category=${category}&token=${apiKey}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', chunk => { data += chunk; });

      res.on('end', () => {
        try {
          const articles = JSON.parse(data);

          if (Array.isArray(articles)) {
            // Transform to consistent format
            const formattedNews = articles.slice(0, 50).map(article => ({
              id: article.id,
              title: article.headline,
              summary: article.summary,
              source: article.source,
              url: article.url,
              image: article.image,
              category: article.category,
              timestamp: new Date(article.datetime * 1000).toISOString(),
              related: article.related // Related stock symbols
            }));

            // Update cache
            newsCache[category] = {
              data: formattedNews,
              lastFetched: Date.now()
            };

            resolve(formattedNews);
          } else {
            console.error('Finnhub API error:', articles);
            resolve(getMockNews());
          }
        } catch (err) {
          console.error('Error parsing Finnhub response:', err);
          resolve(getMockNews());
        }
      });
    }).on('error', (err) => {
      console.error('Finnhub API request error:', err);
      resolve(getMockNews());
    });
  });
}

/**
 * Fetch company-specific news
 * @param {string} symbol - Stock symbol (e.g., AAPL, MSFT)
 * @returns {Promise<Array>} - Array of news articles
 */
async function fetchCompanyNews(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return [];
  }

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = weekAgo.toISOString().split('T')[0];
  const to = today.toISOString().split('T')[0];

  return new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${apiKey}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', chunk => { data += chunk; });

      res.on('end', () => {
        try {
          const articles = JSON.parse(data);

          if (Array.isArray(articles)) {
            const formattedNews = articles.slice(0, 20).map(article => ({
              id: article.id,
              title: article.headline,
              summary: article.summary,
              source: article.source,
              url: article.url,
              image: article.image,
              symbol: symbol,
              timestamp: new Date(article.datetime * 1000).toISOString()
            }));

            resolve(formattedNews);
          } else {
            resolve([]);
          }
        } catch (err) {
          console.error('Error parsing company news:', err);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error('Company news request error:', err);
      resolve([]);
    });
  });
}

/**
 * Get all news categories combined
 * @returns {Promise<Object>} - Object with news by category
 */
async function getAllNews() {
  try {
    const [general, forex, crypto] = await Promise.all([
      fetchNews('general'),
      fetchNews('forex'),
      fetchNews('crypto')
    ]);

    return {
      general,
      forex,
      crypto,
      all: [...general, ...forex, ...crypto]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100)
    };
  } catch (err) {
    console.error('Error fetching all news:', err);
    return {
      general: [],
      forex: [],
      crypto: [],
      all: getMockNews()
    };
  }
}

/**
 * Mock news data for when API key is not set
 */
function getMockNews() {
  return [
    {
      id: 1,
      title: 'Finnhub API Key Required',
      summary: 'Please set FINNHUB_API_KEY environment variable to fetch live financial news. Get your free API key at finnhub.io',
      source: 'System',
      url: 'https://finnhub.io/',
      image: null,
      category: 'general',
      timestamp: new Date().toISOString()
    },
    {
      id: 2,
      title: 'Free API Key Available',
      summary: 'Finnhub offers a generous free tier with 60 API calls per minute. Sign up at finnhub.io to get started.',
      source: 'System',
      url: 'https://finnhub.io/register',
      image: null,
      category: 'general',
      timestamp: new Date().toISOString()
    }
  ];
}

/**
 * Clear the news cache
 */
function clearCache() {
  newsCache = {
    general: { data: [], lastFetched: 0 },
    forex: { data: [], lastFetched: 0 },
    crypto: { data: [], lastFetched: 0 }
  };
}

module.exports = {
  fetchNews,
  fetchCompanyNews,
  getAllNews,
  clearCache
};
