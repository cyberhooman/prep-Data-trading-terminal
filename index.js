/**
 * Alphalabs Data Trading Web Server
 * ------------------------------------------------
 * Serves a web dashboard on http://localhost:3000 that shows:
 *   - Current currency strength snapshot.
 *   - Upcoming Forex Factory high-impact events with live countdown timers.
 *   - Critical market news from FinancialJuice with 1-week retention.
 *
 * The timers flash and play a louder tick during the final 3 minutes before an event,
 * and announce when an event starts.
 *
 * Auto-reload enabled via nodemon - server restarts on file changes.
 */

const express = require('express');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const compression = require('compression');
const session = require('express-session');
const { passport, ensureAuthenticated, findUserByEmail, createUser, createPasswordResetToken, validateResetToken, resetPassword } = require('./auth');
const financialJuiceScraper = require('./services/financialJuiceScraper');
const xNewsScraper = require('./services/xNewsScraper');
const deepseekAI = require('./services/deepseekAI');
const cbSpeechScraper = require('./services/cbSpeechScraper');
const trumpScheduleScraper = require('./services/trumpScheduleScraper');
const rateProbabilityScraper = require('./services/rateProbabilityScraper');
const emailService = require('./services/emailService');

const PORT = process.env.PORT || 3000;
const FA_ECON_CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const MARKETMILK_API = 'https://marketmilk.babypips.com/api';
const FOREX_LIST_ID = 'fxcm:forex';
const DEFAULT_PERIOD = 'ONE_DAY';
const DEFAULT_STREAM = 'REAL_TIME';
const CALENDAR_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours between refreshes (avoid rate limit)
const CALENDAR_RATE_LIMIT_DELAY = 30 * 60 * 1000; // wait 30 minutes after a 429 before retrying

const calendarCache = {
  timestamp: 0,
  records: null,
  nextAllowed: 0,
};

// Currency strength cache
const currencyStrengthCache = {
  timestamp: 0,
  data: null,
  ttl: 5 * 60 * 1000, // 5 minutes cache
};

// Simple on-disk persistence for todos and manual events so data survives restarts.
const DATA_DIR = path.join(__dirname, 'data');
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to ensure data directory', DATA_DIR, err);
  }
}

function loadJson(filename, fallback) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw || 'null') || fallback;
    }
  } catch (err) {
    console.error('Failed to load', filename, err);
  }
  return fallback;
}

function saveJson(filename, data) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    const jsonData = JSON.stringify(data, null, 2);

    // Write to a temporary file first
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, jsonData, 'utf8');

    // Verify the write was successful by reading it back
    const written = fs.readFileSync(tempPath, 'utf8');
    if (written !== jsonData) {
      throw new Error('Data verification failed - written data does not match');
    }

    // Atomic rename (replaces the original file)
    fs.renameSync(tempPath, filePath);

    console.log(`✓ Saved ${filename} successfully (${data.length || 0} items)`);
  } catch (err) {
    console.error('❌ Failed to save', filename, err);
    // Try to clean up temp file if it exists
    try {
      const tempPath = path.join(DATA_DIR, filename + '.tmp');
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw err; // Re-throw to let caller know save failed
  }
}

/**
 * Flexible HTTPS JSON fetcher using Node core modules.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string,string>, body?: string }} options
 * @returns {Promise<any>}
 */
function fetchJson(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      method,
      headers,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      port: urlObj.port || 443,
    };

    const req = https.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Request failed (${res.statusCode}): ${raw}`));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}\nResponse: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}


function convertCalendarRecords(records) {
  if (!Array.isArray(records)) {
    console.warn('Invalid records format:', records);
    return [];
  }
  
  return records
    .filter((item) => {
      if (!item || typeof item !== 'object') {
        console.warn('Invalid calendar item:', item);
        return false;
      }
      return item.impact === 'High';
    })
    .map((item) => {
      if (!item.date) {
        console.warn('Missing date for event:', item);
        return null;
      }
      const eventDate = new Date(item.date);
      if (isNaN(eventDate.getTime())) {
        console.warn('Invalid date for event:', item);
        return null;
      }
      return {
        id: `auto-${item.date}-${item.title}`,
        title: item.title,
        country: item.country,
        impact: item.impact,
        date: eventDate.toISOString(),
        source: 'auto'
      };
    })
    .filter(item => item !== null)
    .filter(item => new Date(item.date).getTime() > Date.now())
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function loadHighImpactEvents() {
  const now = Date.now();

  // Check if we should use cache (respect rate limits)
  if (now < calendarCache.nextAllowed && Array.isArray(calendarCache.records)) {
    console.log('Using cached calendar data (rate limit protection)');
    return convertCalendarRecords(calendarCache.records);
  }

  try {
    console.log('Fetching fresh calendar data...');
    const data = await fetchJson(FA_ECON_CAL_URL, {
      headers: {
        'User-Agent': 'AlphalabsTrading/1.0',
        'Accept': 'application/json',
      }
    });

    if (!Array.isArray(data)) {
      console.error('Invalid calendar data format (not an array)');
      // If we have cache, use it
      if (Array.isArray(calendarCache.records)) {
        console.log('Using cached records due to invalid format');
        return convertCalendarRecords(calendarCache.records);
      }
      return [];
    }

    // Update cache on success
    calendarCache.records = data;
    calendarCache.timestamp = now;
    calendarCache.nextAllowed = now + CALENDAR_CACHE_TTL;
    console.log(`Calendar data updated. Next refresh allowed at: ${new Date(calendarCache.nextAllowed).toLocaleString()}`);

    return convertCalendarRecords(data);
  } catch (err) {
    console.error('Calendar fetch error:', err.message);

    // If we got rate limited, increase cache time
    if (err.message.includes('429') || err.message.includes('Rate Limited')) {
      console.log('Rate limited! Extending cache time...');
      calendarCache.nextAllowed = now + CALENDAR_RATE_LIMIT_DELAY;
    }

    // Use cache if available
    if (Array.isArray(calendarCache.records)) {
      console.log(`Using cached records (${calendarCache.records.length} events)`);
      return convertCalendarRecords(calendarCache.records);
    }

    console.log('No cached data available, returning empty array');
    return [];
  }
}

/**
 * Calculate currency strength like BabyPips MarketMilk
 * Uses 28 currency pairs to determine aggregate strength
 * Based on multiple timeframes and RSI-style momentum
 */
async function loadCurrencyStrength() {
  const now = Date.now();

  // Return cached data if still fresh
  if (currencyStrengthCache.data && (now - currencyStrengthCache.timestamp) < currencyStrengthCache.ttl) {
    console.log('Using cached currency strength data');
    return currencyStrengthCache.data;
  }

  try {
    console.log('Calculating BabyPips-style currency strength from 28 pairs...');

    // Get current and historical rates for comprehensive calculation
    const currentRatesUrl = 'https://api.frankfurter.app/latest?from=USD';
    const currentData = await fetchJson(currentRatesUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Alphalabs-Trading-App' }
    });

    // Get 7-day historical data for better trend analysis
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const weekDateStr = weekAgo.toISOString().split('T')[0];
    const historicalData = await fetchJson(`https://api.frankfurter.app/${weekDateStr}?from=USD`, {
      method: 'GET',
      headers: { 'User-Agent': 'Alphalabs-Trading-App' }
    });

    if (!currentData?.rates || !historicalData?.rates) {
      throw new Error('Invalid response from API');
    }

    // Define the 8 major currencies (like BabyPips)
    const majorCurrencies = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USD'];

    // Calculate strength for each currency based on all pairs (28 pairs total)
    const strengthScores = {};

    for (const baseCurrency of majorCurrencies) {
      let totalStrength = 0;
      let pairCount = 0;

      for (const quoteCurrency of majorCurrencies) {
        if (baseCurrency === quoteCurrency) continue;

        // Calculate the pair rate change
        let currentRate, historicalRate;

        if (baseCurrency === 'USD') {
          // USD as base (USD/XXX)
          currentRate = currentData.rates[quoteCurrency];
          historicalRate = historicalData.rates[quoteCurrency];
          if (currentRate && historicalRate) {
            // If USD/XXX goes up, USD is stronger
            const change = ((currentRate - historicalRate) / historicalRate) * 100;
            totalStrength += change; // Higher rate = stronger USD
            pairCount++;
          }
        } else if (quoteCurrency === 'USD') {
          // XXX as base (XXX/USD)
          currentRate = currentData.rates[baseCurrency];
          historicalRate = historicalData.rates[baseCurrency];
          if (currentRate && historicalRate) {
            // If XXX/USD goes down, XXX is stronger
            const change = ((currentRate - historicalRate) / historicalRate) * 100;
            totalStrength -= change; // Lower rate = stronger base currency
            pairCount++;
          }
        } else {
          // Cross pair (XXX/YYY)
          const baseCurrent = currentData.rates[baseCurrency];
          const baseHistorical = historicalData.rates[baseCurrency];
          const quoteCurrent = currentData.rates[quoteCurrency];
          const quoteHistorical = historicalData.rates[quoteCurrency];

          if (baseCurrent && baseHistorical && quoteCurrent && quoteHistorical) {
            // Calculate cross rate: XXX/YYY = (XXX/USD) / (YYY/USD)
            const currentCross = quoteCurrent / baseCurrent;
            const historicalCross = quoteHistorical / baseHistorical;
            const change = ((currentCross - historicalCross) / historicalCross) * 100;
            totalStrength += change;
            pairCount++;
          }
        }
      }

      // Average strength across all pairs for this currency
      strengthScores[baseCurrency] = pairCount > 0 ? totalStrength / pairCount : 0;
    }

    // Normalize scores to 0-100 scale (like BabyPips momentum)
    const values = Object.values(strengthScores);
    const minScore = Math.min(...values);
    const maxScore = Math.max(...values);
    const range = maxScore - minScore;

    const strengthData = majorCurrencies.map(currency => {
      const rawScore = strengthScores[currency];
      const normalizedScore = range > 0 ? ((rawScore - minScore) / range) * 100 : 50;

      return {
        id: currency,
        name: currency,
        title: getCurrencyName(currency),
        value: rawScore, // Keep raw percentage for display
        momentum: Math.round(normalizedScore), // 0-100 momentum like BabyPips
        trend: rawScore > 0 ? 'bullish' : 'bearish'
      };
    });

    // Sort by raw strength (highest to lowest)
    strengthData.sort((a, b) => b.value - a.value);

    console.log('✅ Currency strength calculated from 28 pairs');
    console.log('Strongest:', strengthData[0].name, 'Weakest:', strengthData[strengthData.length - 1].name);

    // Cache the result
    currencyStrengthCache.data = strengthData;
    currencyStrengthCache.timestamp = now;

    return strengthData;
  } catch (err) {
    console.error('Failed to calculate currency strength:', err.message);
    // Return cached data if available
    if (currencyStrengthCache.data) {
      console.log('Returning stale cached currency strength data');
      return currencyStrengthCache.data;
    }
    throw new Error(`Currency strength calculation failed: ${err.message}`);
  }
}

// Helper function to get full currency names
function getCurrencyName(code) {
  const names = {
    'EUR': 'Euro',
    'GBP': 'British Pound',
    'JPY': 'Japanese Yen',
    'CHF': 'Swiss Franc',
    'CAD': 'Canadian Dollar',
    'AUD': 'Australian Dollar',
    'NZD': 'New Zealand Dollar',
    'USD': 'U.S. Dollar',
  };
  return names[code] || code;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEventDate(date) {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
    timeZoneName: 'short',
  });
}

ensureDataDir();

const todoItems = loadJson('todos.json', []);
const quickNotes = loadJson('notes.json', []);
// Account settings are now per-user, loaded on demand
const userAccountSettings = {};

/**
 * Load CB speeches and convert to event format
 */
async function loadCBSpeeches() {
  try {
    const speeches = await cbSpeechScraper.fetchAllContent(financialJuiceScraper);
    return speeches.map(speech => ({
      id: speech.id,
      title: `${speech.speaker} (${speech.bankCode}): ${speech.title}`,
      country: speech.currency,
      date: speech.timestamp || speech.date,
      source: 'cb_speech',
      type: speech.type
    }));
  } catch (err) {
    console.error('Error loading CB speeches:', err.message);
    return [];
  }
}

/**
 * Load Trump schedule and convert to event format
 */
async function loadTrumpSchedule() {
  try {
    const schedule = await trumpScheduleScraper.getUpcomingSchedule();
    return schedule.map(item => ({
      id: item.id,
      title: item.title,
      country: item.country, // Already USD
      date: item.date,
      source: 'trump_schedule',
      type: item.type,
      location: item.location
    }));
  } catch (err) {
    console.error('Error loading Trump schedule:', err.message);
    return [];
  }
}

/**
 * Cache for gathered events
 */
let eventsCache = null;
let eventsCacheTimestamp = 0;
const EVENTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Gather all events from all sources (with caching)
 */
async function gatherEvents(forceRefresh = false) {
  // Return cached data if still valid
  const now = Date.now();
  if (!forceRefresh && eventsCache && (now - eventsCacheTimestamp) < EVENTS_CACHE_TTL) {
    console.log('Returning cached events (age: ' + Math.round((now - eventsCacheTimestamp) / 1000) + 's)');
    return eventsCache;
  }

  console.log('Gathering events from all sources...');

  let autoEvents = [];
  let cbSpeeches = [];
  let trumpSchedule = [];
  let autoError = null;

  // Load Forex Factory economic events
  try {
    const loadedEvents = await loadHighImpactEvents();
    autoEvents = Array.isArray(loadedEvents) ? loadedEvents : [];
    console.log(`Loaded ${autoEvents.length} Forex Factory events`);
  } catch (err) {
    console.error('Error loading Forex Factory events:', err);
    autoError = err.message.replace(/<[^>]+>/g, '').trim();
    autoEvents = [];
  }

  // Load CB speeches
  try {
    cbSpeeches = await loadCBSpeeches();
    console.log(`Loaded ${cbSpeeches.length} CB speech events`);
  } catch (err) {
    console.error('Error loading CB speeches:', err);
    cbSpeeches = [];
  }

  // Load Trump schedule
  try {
    trumpSchedule = await loadTrumpSchedule();
    console.log(`Loaded ${trumpSchedule.length} Trump schedule events`);
  } catch (err) {
    console.error('Error loading Trump schedule:', err);
    trumpSchedule = [];
  }

  // Combine all events and sort by date
  const combinedEvents = [...autoEvents, ...cbSpeeches, ...trumpSchedule].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  console.log(`Total combined events: ${combinedEvents.length}`);

  const result = {
    autoEvents,
    cbSpeeches,
    trumpSchedule,
    combinedEvents,
    autoError
  };

  // Update cache
  eventsCache = result;
  eventsCacheTimestamp = now;

  return result;
}

const app = express();

// Enable gzip/deflate compression
app.use(compression());

// Serve static files with caching
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  immutable: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Trust proxy for Railway deployment (required for secure cookies behind proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days - matches news retention
    domain: process.env.NODE_ENV === 'production' ? '.0xdatatrade.xyz' : undefined
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Authentication Routes
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }

  const errorMsg = req.query.error || '';

  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Login - Alphalabs Trading</title>
      <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
      <style>
        :root {
          --neon-red: #ff0055;
          --neon-green: #00ff00;
          --neon-blue: #0088ff;
          --dark-bg: #000000;
          --scan-line: rgba(255, 0, 85, 0.03);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'JetBrains Mono', monospace;
          min-height: 100vh;
          overflow: hidden;
          background: var(--dark-bg);
          color: #fff;
        }

        #shader-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          opacity: 0.85;
          background: radial-gradient(ellipse at center, #1a0033 0%, #000000 50%, #001a33 100%);
          animation: bgShift 20s ease-in-out infinite;
        }

        @keyframes bgShift {
          0%, 100% {
            background: radial-gradient(ellipse at 30% 50%, #1a0033 0%, #000000 40%, #001a33 100%);
          }
          25% {
            background: radial-gradient(ellipse at 70% 30%, #0d1a33 0%, #000000 40%, #1a0033 100%);
          }
          50% {
            background: radial-gradient(ellipse at 60% 70%, #001a33 0%, #000000 40%, #0d1a33 100%);
          }
          75% {
            background: radial-gradient(ellipse at 40% 40%, #1a0033 0%, #000000 40%, #001a33 100%);
          }
        }

        /* Scanline overlay effect */
        #shader-bg::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: repeating-linear-gradient(
            0deg,
            var(--scan-line) 0px,
            transparent 1px,
            transparent 2px,
            var(--scan-line) 3px
          );
          pointer-events: none;
          animation: scanlines 8s linear infinite;
        }

        @keyframes scanlines {
          0% { transform: translateY(0); }
          100% { transform: translateY(10px); }
        }

        .content-wrapper {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }

        .login-container {
          position: relative;
          max-width: 450px;
          width: 100%;
          animation: slideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .terminal-border {
          position: relative;
          background: rgba(15, 15, 15, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          overflow: hidden;
        }

        .terminal-header {
          display: none;
        }

        .terminal-content {
          padding: 48px 40px;
          background: transparent;
        }

        .logo {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }

        .subtitle {
          font-size: 20px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 8px;
          text-align: center;
        }

        .subtitle-2 {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
          font-weight: 400;
          margin-bottom: 32px;
          text-align: center;
        }

        .divider {
          display: flex;
          align-items: center;
          margin: 20px 0;
          color: rgba(255, 255, 255, 0.3);
          font-size: 11px;
          font-weight: 400;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
        }

        .divider span {
          padding: 0 12px;
        }

        /* Form Styles */
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-input {
          padding: 14px 16px;
          background: rgba(30, 30, 30, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          font-size: 14px;
          transition: all 0.2s ease;
          outline: none;
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .form-input:focus {
          background: rgba(40, 40, 40, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .form-input:hover:not(:focus) {
          border-color: rgba(255, 255, 255, 0.15);
        }

        .submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px 20px;
          background: rgba(30, 30, 30, 0.6);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 4px;
        }

        .submit-btn:hover {
          background: rgba(40, 40, 40, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .submit-btn:active {
          transform: scale(0.98);
        }

        .skip-btn {
          width: 100%;
          padding: 14px 20px;
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 12px;
        }

        .skip-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
        }

        .skip-btn:active {
          transform: scale(0.98);
        }

        .toggle-mode {
          text-align: center;
          margin-top: 20px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
        }

        .toggle-link {
          color: #ffffff;
          text-decoration: none;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-left: 4px;
        }

        .toggle-link:hover {
          opacity: 0.8;
        }

        .confirm-password-group {
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .confirm-password-group.show {
          max-height: 100px;
          opacity: 1;
        }

        /* Error Message */
        .error-message {
          padding: 12px 16px;
          background: rgba(255, 0, 85, 0.1);
          border: 1px solid rgba(255, 0, 85, 0.5);
          border-left: 3px solid #ff0055;
          color: #ff0055;
          font-size: 12px;
          line-height: 1.6;
          display: none;
          animation: slideDown 0.3s ease-out;
        }

        .error-message.show {
          display: block;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .error-message::before {
          content: '[ERROR] ';
          font-weight: 700;
          letter-spacing: 1px;
        }

        .google-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 14px 20px;
          background: #ffffff;
          color: #000000;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .google-btn:hover {
          background: #f5f5f5;
        }

        .google-btn:active {
          transform: scale(0.98);
        }

        .secondary-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 14px 20px;
          background: rgba(30, 30, 30, 0.6);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 12px;
        }

        .secondary-btn:hover {
          background: rgba(40, 40, 40, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .secondary-btn:active {
          transform: scale(0.98);
        }

        .google-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
        }

        .google-icon {
          width: 18px;
          height: 18px;
        }

        .btn-text {
          font-weight: 500;
        }

        .info-panel {
          margin-top: 20px;
          padding: 14px;
          background: rgba(0, 136, 255, 0.03);
          border-left: 3px solid var(--neon-red);
          font-size: 11px;
          line-height: 1.6;
        }

        .info-title {
          color: var(--neon-red);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .info-title::before {
          content: '[';
          color: var(--neon-blue);
        }

        .info-title::after {
          content: ']';
          color: var(--neon-blue);
        }

        .info-text {
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
        }

        .status-bar {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          padding-top: 14px;
          border-top: 1px solid rgba(0, 136, 255, 0.2);
          font-size: 9px;
          color: rgba(0, 136, 255, 0.6);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--neon-green);
          box-shadow: 0 0 6px var(--neon-green);
          animation: pulse 2s ease-in-out infinite;
        }

        @media (max-width: 600px) {
          .terminal-content {
            padding: 20px 16px;
          }

          .logo {
            font-size: 1.6rem;
            letter-spacing: 2px;
            margin-bottom: 12px;
          }

          /* Hide unnecessary elements on mobile */
          .subtitle,
          .prompt-line,
          .info-panel,
          .status-bar {
            display: none;
          }

          .tab-navigation {
            margin-bottom: 16px;
          }

          .tab-btn {
            font-size: 10px;
            padding: 10px 14px;
          }

          .form-group {
            margin-bottom: 14px;
          }

          .form-label {
            font-size: 10px;
            margin-bottom: 6px;
          }

          .form-input {
            padding: 10px 12px;
            font-size: 13px;
          }

          .submit-btn {
            padding: 12px 20px;
            font-size: 12px;
          }

          .toggle-mode {
            font-size: 11px;
            margin-top: 14px;
          }

          .error-message {
            padding: 10px 12px;
            font-size: 10px;
            margin-bottom: 12px;
          }
        }
      </style>
    </head>
    <body>
      <div id="shader-bg"></div>
      <div class="content-wrapper">
        <div class="login-container">
          <div class="terminal-border">
            <div class="terminal-header">
              <div class="terminal-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
              </div>
              <span>SYSTEM_AUTH.EXE</span>
            </div>

            <div class="terminal-content">
              <div class="logo">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 4L4 14L24 24L44 14L24 4Z" fill="white" opacity="0.9"/>
                  <path d="M4 24L24 34L44 24" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
                  <path d="M4 34L24 44L44 34" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
                </svg>
              </div>
              <div class="subtitle">Welcome Back</div>
              <div class="subtitle-2">Enter your credentials to access your account.</div>

              <!-- Error Message Area -->
              <div id="errorMessage" class="error-message"></div>

              <!-- OAuth Buttons (shown by default) -->
              <div id="oauthButtons">
                <!-- Google OAuth Button -->
                <a href="/auth/google" class="google-btn">
                  <div class="google-icon-wrapper">
                    <svg class="google-icon" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <span class="btn-text">Continue with Google</span>
                </a>

                <button type="button" class="secondary-btn" onclick="showEmailForm()">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  <span class="btn-text">Continue with Email</span>
                </button>

                <button type="button" class="skip-btn" onclick="window.location.href='/signup'">
                  Sign up
                </button>
              </div>

              <!-- Email Login Form (hidden by default) -->
              <div id="emailLoginForm" style="display: none;">
                <form action="/auth/login" method="POST" class="auth-form">
                  <div class="form-group">
                    <input
                      type="email"
                      name="email"
                      class="form-input"
                      placeholder="Email address"
                      required
                      autocomplete="email"
                    />
                  </div>

                  <div class="form-group">
                    <input
                      type="password"
                      name="password"
                      class="form-input"
                      placeholder="Password"
                      required
                      autocomplete="current-password"
                    />
                  </div>

                  <button type="submit" class="submit-btn">
                    Sign In
                  </button>
                </form>

                <div style="text-align: center; margin-top: 0.75rem;">
                  <a href="/forgot-password" style="color: #00D9FF; text-decoration: none; font-size: 0.9rem;">Forgot Password?</a>
                </div>

                <button type="button" class="skip-btn" onclick="showOAuthButtons()">
                  Back to other options
                </button>

                <div class="toggle-mode">
                  Don't have an account?<a href="/signup" class="toggle-link">Sign up</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Toggle between OAuth buttons and email form
        function showEmailForm() {
          document.getElementById('oauthButtons').style.display = 'none';
          document.getElementById('emailLoginForm').style.display = 'block';
        }

        function showOAuthButtons() {
          document.getElementById('emailLoginForm').style.display = 'none';
          document.getElementById('oauthButtons').style.display = 'block';
        }

        // Display error message if present
        const urlParams = new URLSearchParams(window.location.search);
        const errorMsg = urlParams.get('error');
        if (errorMsg) {
          const errorDiv = document.getElementById('errorMessage');
          errorDiv.textContent = errorMsg;
          errorDiv.classList.add('show');
        }

        // Lightweight CSS background - no heavy Three.js needed!
      </script>
    </body>
  </html>`;

  res.send(html);
});

app.get('/signup', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }

  const errorMsg = req.query.error || '';

  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sign Up - Alphalabs Trading</title>
      <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
      <style>
        :root {
          --neon-red: #ff0055;
          --neon-green: #00ff00;
          --neon-blue: #0088ff;
          --dark-bg: #000000;
          --scan-line: rgba(255, 0, 85, 0.03);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'JetBrains Mono', monospace;
          min-height: 100vh;
          overflow: hidden;
          background: var(--dark-bg);
          color: #fff;
        }

        #shader-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          opacity: 0.85;
          background: radial-gradient(ellipse at center, #1a0033 0%, #000000 50%, #001a33 100%);
          animation: bgShift 20s ease-in-out infinite;
        }

        @keyframes bgShift {
          0%, 100% {
            background: radial-gradient(ellipse at 30% 50%, #1a0033 0%, #000000 40%, #001a33 100%);
          }
          25% {
            background: radial-gradient(ellipse at 70% 30%, #0d1a33 0%, #000000 40%, #1a0033 100%);
          }
          50% {
            background: radial-gradient(ellipse at 60% 70%, #001a33 0%, #000000 40%, #0d1a33 100%);
          }
          75% {
            background: radial-gradient(ellipse at 40% 40%, #1a0033 0%, #000000 40%, #001a33 100%);
          }
        }

        /* Scanline overlay effect */
        #shader-bg::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: repeating-linear-gradient(
            0deg,
            var(--scan-line) 0px,
            transparent 1px,
            transparent 2px,
            var(--scan-line) 3px
          );
          pointer-events: none;
          animation: scanlines 8s linear infinite;
        }

        @keyframes scanlines {
          0% { transform: translateY(0); }
          100% { transform: translateY(10px); }
        }

        .content-wrapper {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }

        .login-container {
          position: relative;
          max-width: 450px;
          width: 100%;
          animation: slideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .terminal-border {
          position: relative;
          background: rgba(15, 15, 15, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          overflow: hidden;
        }

        .terminal-content {
          padding: 48px 40px;
          background: transparent;
        }

        .logo {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }

        .subtitle {
          font-size: 20px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 8px;
          text-align: center;
        }

        .subtitle-2 {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
          font-weight: 400;
          margin-bottom: 32px;
          text-align: center;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-input {
          padding: 14px 16px;
          background: rgba(30, 30, 30, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          font-size: 14px;
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s ease;
          outline: none;
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .form-input:focus {
          background: rgba(40, 40, 40, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .form-input:hover:not(:focus) {
          border-color: rgba(255, 255, 255, 0.15);
        }

        .submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px 20px;
          background: rgba(30, 30, 30, 0.6);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 8px;
          font-family: 'JetBrains Mono', monospace;
        }

        .submit-btn:hover {
          background: rgba(40, 40, 40, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .submit-btn:active {
          transform: scale(0.98);
        }

        .toggle-mode {
          text-align: center;
          margin-top: 20px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
        }

        .toggle-link {
          color: #ffffff;
          text-decoration: none;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-left: 4px;
        }

        .toggle-link:hover {
          opacity: 0.8;
        }

        .error-message {
          padding: 12px 16px;
          background: rgba(255, 0, 85, 0.1);
          border: 1px solid rgba(255, 0, 85, 0.5);
          border-left: 3px solid #ff0055;
          color: #ff0055;
          font-size: 12px;
          line-height: 1.6;
          display: none;
          animation: slideDown 0.3s ease-out;
          margin-bottom: 16px;
        }

        .error-message.show {
          display: block;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .error-message::before {
          content: '[ERROR] ';
          font-weight: 700;
          letter-spacing: 1px;
        }

        @media (max-width: 600px) {
          .terminal-content {
            padding: 20px 16px;
          }

          .subtitle-2 {
            font-size: 12px;
          }

          .form-input {
            padding: 10px 12px;
            font-size: 13px;
          }

          .submit-btn {
            padding: 12px 20px;
            font-size: 12px;
          }

          .error-message {
            padding: 10px 12px;
            font-size: 10px;
            margin-bottom: 12px;
          }
        }
      </style>
    </head>
    <body>
      <div id="shader-bg"></div>
      <div class="content-wrapper">
        <div class="login-container">
          <div class="terminal-border">
            <div class="terminal-content">
              <div class="logo">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 4L4 14L24 24L44 14L24 4Z" fill="white" opacity="0.9"/>
                  <path d="M4 24L24 34L44 24" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
                  <path d="M4 34L24 44L44 34" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
                </svg>
              </div>
              <div class="subtitle">Create Account</div>
              <div class="subtitle-2">Sign up to start trading with Alphalabs.</div>

              <div id="errorMessage" class="error-message ${errorMsg ? 'show' : ''}">${errorMsg}</div>

              <form action="/auth/register" method="POST" class="auth-form">
                <div class="form-group">
                  <input
                    type="email"
                    name="email"
                    class="form-input"
                    placeholder="Email address"
                    required
                    autocomplete="email"
                  />
                </div>

                <div class="form-group">
                  <input
                    type="password"
                    name="password"
                    class="form-input"
                    placeholder="Password (min 8 characters)"
                    required
                    minlength="8"
                    autocomplete="new-password"
                  />
                </div>

                <div class="form-group">
                  <input
                    type="password"
                    name="confirmPassword"
                    class="form-input"
                    placeholder="Confirm password"
                    required
                    minlength="8"
                    autocomplete="new-password"
                  />
                </div>

                <button type="submit" class="submit-btn">
                  Create Account
                </button>
              </form>

              <div class="toggle-mode">
                Already have an account?<a href="/login" class="toggle-link">Sign in</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Lightweight CSS background - no heavy Three.js needed!
      </script>
    </body>
  </html>`;

  res.send(html);
});

// Forgot Password Page
app.get('/forgot-password', (req, res) => {
  const errorMsg = req.query.error || '';
  const successMsg = req.query.success || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forgot Password - Alphalabs Trading</title>
  <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 100%;
    }
    h1 { color: #333; margin-bottom: 0.5rem; font-size: 1.75rem; }
    p { color: #666; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #333; font-weight: 500; }
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 1rem;
    }
    input:focus { outline: none; border-color: #667eea; }
    .btn {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .btn:hover { transform: translateY(-2px); }
    .error { background: #fee; color: #c33; padding: 0.75rem; border-radius: 5px; margin-bottom: 1rem; }
    .success { background: #efe; color: #3c3; padding: 0.75rem; border-radius: 5px; margin-bottom: 1rem; }
    .back-link { text-align: center; margin-top: 1rem; }
    .back-link a { color: #667eea; text-decoration: none; }
    .back-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Forgot Password?</h1>
    <p>Enter your email address and we'll generate a reset link for you.</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    ${successMsg ? `<div class="success">${successMsg}</div>` : ''}
    <form action="/auth/forgot-password" method="POST">
      <div class="form-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" name="email" required>
      </div>
      <button type="submit" class="btn">Send Reset Link</button>
    </form>
    <div class="back-link">
      <a href="/login">Back to Login</a>
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

// Reset Password Page
app.get('/reset-password', (req, res) => {
  const token = req.query.token || '';
  const errorMsg = req.query.error || '';

  if (!token) {
    return res.redirect('/forgot-password?error=Invalid reset link');
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - Alphalabs Trading</title>
  <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 100%;
    }
    h1 { color: #333; margin-bottom: 0.5rem; font-size: 1.75rem; }
    p { color: #666; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #333; font-weight: 500; }
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 1rem;
    }
    input:focus { outline: none; border-color: #667eea; }
    .btn {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .btn:hover { transform: translateY(-2px); }
    .error { background: #fee; color: #c33; padding: 0.75rem; border-radius: 5px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Reset Your Password</h1>
    <p>Enter your new password below.</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    <form action="/auth/reset-password" method="POST">
      <input type="hidden" name="token" value="${token}">
      <div class="form-group">
        <label for="password">New Password</label>
        <input type="password" id="password" name="password" required minlength="8">
      </div>
      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input type="password" id="confirmPassword" name="confirmPassword" required minlength="8">
      </div>
      <button type="submit" class="btn">Reset Password</button>
    </form>
  </div>
</body>
</html>`;

  res.send(html);
});

// CB Speeches Page
app.get('/cb-speeches', ensureAuthenticated, async (req, res) => {
  const user = req.user;

  const authControlsHtml = user
    ? `<div class="auth-controls">
         <div class="auth-user">
           <strong>${user.displayName || user.email}</strong>
           <span>Authenticated</span>
         </div>
         ${user.picture ? `<img src="${user.picture}" alt="User" class="auth-avatar" />` : ''}
         <a href="/logout" class="auth-button logout">Logout</a>
       </div>`
    : `<a href="/login" class="auth-button login">Login</a>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CB Speeches & Analysis - Alphalabs</title>
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js" defer></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" defer></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js" defer></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="/public/theme-2025.css?v=${Date.now()}">
    <style>
      .auth-controls {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
      }
      .auth-avatar {
        width: 38px;
        height: 38px;
        min-width: 38px;
        border-radius: 9999px;
        border: 2px solid rgba(96, 165, 250, 0.35);
        object-fit: cover;
      }
      .auth-user {
        text-align: right;
        line-height: 1.2;
      }
      .auth-user strong {
        font-size: 0.95rem;
        color: #e2e8f0;
        font-weight: 600;
      }
      .auth-user span {
        display: block;
        font-size: 0.75rem;
        color: rgba(226, 232, 240, 0.6);
      }
      .auth-button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.45rem 1rem;
        border-radius: 9999px;
        text-decoration: none;
        font-weight: 600;
        transition: background 0.2s ease, border 0.2s ease, color 0.2s ease;
      }
      .auth-button.logout {
        background: rgba(248, 113, 113, 0.2);
        border: 1px solid rgba(248, 113, 113, 0.45);
        color: #fecaca;
      }
      .auth-button.logout:hover {
        background: rgba(248, 113, 113, 0.3);
        border-color: rgba(248, 113, 113, 0.65);
        color: #fee2e2;
      }
      .nav-bar {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-left: 2rem;
      }
      .nav-link {
        padding: 0.5rem 1rem;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        font-size: 0.9rem;
        color: rgba(226, 232, 240, 0.7);
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }
      .nav-link:hover {
        background: rgba(99, 102, 241, 0.15);
        color: #c7d2fe;
        border-color: rgba(99, 102, 241, 0.3);
      }
      .nav-link.active {
        background: rgba(99, 102, 241, 0.22);
        color: #e0e7ff;
        border-color: rgba(99, 102, 241, 0.4);
      }
      @media (max-width: 768px) {
        .nav-bar {
          margin-left: 0;
          gap: 0.25rem;
        }
        .nav-link {
          padding: 0.4rem 0.7rem;
          font-size: 0.8rem;
        }
      }
    </style>
  </head>
  <body>
    <header style="padding: 1.5rem 0; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div class="header-container" style="display: flex; align-items: center; justify-content: space-between; max-width: 1480px; margin: 0 auto; gap: 1.5rem; padding: 0 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
          <a href="/" style="text-decoration: none; display: flex; align-items: center; gap: 1rem;">
            <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #00D9FF, #8B5CF6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: #0B0F19; font-family: 'Inter Tight', sans-serif;">A</div>
            <div>
              <h1 style="font-size: 1.5rem; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; font-family: 'Inter Tight', sans-serif; margin: 0;">
                Alphalabs
              </h1>
              <p style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Data Trading</p>
            </div>
          </a>
          <nav class="nav-bar">
            <a href="/" class="nav-link">Dashboard</a>
            <a href="/interest-rates" class="nav-link">Interest Rates</a>
            <a href="/currency-strength" class="nav-link">Currency Strength</a>
            <a href="/cb-speeches" class="nav-link active">CB Speeches</a>
            <a href="/weekly-calendar" class="nav-link">Weekly Calendar</a>
          </nav>
        </div>
        ${authControlsHtml}
      </div>
    </header>

    <main>
      <section style="max-width: 1480px; margin: 0 auto 1.5rem; padding: 0 1rem;">
        <div id="cb-speech-root"></div>
      </section>
    </main>

    <footer style="padding: 2rem 0; margin-top: 4rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; color: rgba(226, 232, 240, 0.5); font-size: 0.85rem;">
      Updated on demand • Powered by AI Analysis
    </footer>

    <script type="text/babel" data-presets="env,react" src="/cb-speech-analysis.jsx"></script>
    <script type="text/babel" data-presets="env,react">
      const cbroot = ReactDOM.createRoot(document.getElementById('cb-speech-root'));
      cbroot.render(React.createElement(CBSpeechAnalysis));
    </script>
  </body>
</html>`;

  res.send(html);
});

// Weekly Calendar Page
app.get('/weekly-calendar', ensureAuthenticated, async (req, res) => {
  const user = req.user;

  const authControlsHtml = user
    ? `<div class="auth-controls">
         <div class="auth-user">
           <strong>${user.displayName || user.email}</strong>
           <span>Authenticated</span>
         </div>
         ${user.picture ? `<img src="${user.picture}" alt="User" class="auth-avatar" />` : ''}
         <a href="/logout" class="auth-button logout">Logout</a>
       </div>`
    : `<a href="/login" class="auth-button login">Login</a>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Weekly Calendar - Alphalabs Data Trading</title>
    <link rel="stylesheet" href="/public/theme-2025.css" />
    <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  </head>
  <body>
    <header style="background: var(--primary-bg); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 1rem 0; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(12px);">
      <div style="max-width: 1600px; margin: 0 auto; padding: 0 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 3rem;">
          <a href="/" style="text-decoration: none; display: flex; align-items: center; gap: 1rem;">
            <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #00D9FF, #8B5CF6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: #0B0F19; font-family: 'Inter Tight', sans-serif;">A</div>
            <div>
              <h1 style="font-size: 1.5rem; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; font-family: 'Inter Tight', sans-serif; margin: 0;">
                Alphalabs
              </h1>
              <p style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Data Trading</p>
            </div>
          </a>
          <nav class="nav-bar">
            <a href="/" class="nav-link">Dashboard</a>
            <a href="/interest-rates" class="nav-link">Interest Rates</a>
            <a href="/currency-strength" class="nav-link">Currency Strength</a>
            <a href="/cb-speeches" class="nav-link">CB Speeches</a>
            <a href="/weekly-calendar" class="nav-link active">Weekly Calendar</a>
          </nav>
        </div>
        ${authControlsHtml}
      </div>
    </header>

    <main>
      <div id="weekly-calendar-root"></div>
    </main>

    <footer style="padding: 2rem 0; margin-top: 4rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; color: rgba(226, 232, 240, 0.5); font-size: 0.85rem;">
      All events auto-updated • Tracking Forex, CB Speeches & Trump Schedule
    </footer>

    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script type="text/babel" src="/weekly-calendar.jsx"></script>
  </body>
</html>`;

  res.send(html);
});

// API endpoint for weekly calendar events
app.get('/api/calendar/weekly', async (req, res) => {
  try {
    const { autoEvents, cbSpeeches, trumpSchedule, combinedEvents } = await gatherEvents();

    res.json({
      success: true,
      events: combinedEvents,
      breakdown: {
        forex: autoEvents.length,
        cbSpeeches: cbSpeeches.length,
        trumpSchedule: trumpSchedule.length
      }
    });
  } catch (err) {
    console.error('Error fetching weekly calendar events:', err);
    res.status(500).json({ error: err.message });
  }
});

// Interest Rate Probability Page
app.get('/interest-rates', ensureAuthenticated, async (req, res) => {
  const user = req.user;

  const authControlsHtml = user
    ? `<div class="auth-controls">
         <div class="auth-user">
           <strong>${user.displayName || user.email}</strong>
           <span>Authenticated</span>
         </div>
         ${user.picture ? `<img src="${user.picture}" alt="User" class="auth-avatar" />` : ''}
         <a href="/logout" class="auth-button logout">Logout</a>
       </div>`
    : `<a href="/login" class="auth-button login">Login</a>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Interest Rate Probability - Alphalabs</title>
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js" defer></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" defer></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js" defer></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="/public/theme-2025.css?v=${Date.now()}">
    <style>
      .auth-controls {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
      }
      .auth-avatar {
        width: 38px;
        height: 38px;
        min-width: 38px;
        border-radius: 9999px;
        border: 2px solid rgba(96, 165, 250, 0.35);
        object-fit: cover;
      }
      .auth-user {
        text-align: right;
        line-height: 1.2;
      }
      .auth-user strong {
        font-size: 0.95rem;
        color: #e2e8f0;
        font-weight: 600;
      }
      .auth-user span {
        display: block;
        font-size: 0.75rem;
        color: rgba(226, 232, 240, 0.6);
      }
      .auth-button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.45rem 1rem;
        border-radius: 9999px;
        text-decoration: none;
        font-weight: 600;
        transition: background 0.2s ease, border 0.2s ease, color 0.2s ease;
      }
      .auth-button.logout {
        background: rgba(248, 113, 113, 0.2);
        border: 1px solid rgba(248, 113, 113, 0.45);
        color: #fecaca;
      }
      .auth-button.logout:hover {
        background: rgba(248, 113, 113, 0.3);
        border-color: rgba(248, 113, 113, 0.65);
        color: #fee2e2;
      }
      .nav-bar {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-left: 2rem;
      }
      .nav-link {
        padding: 0.5rem 1rem;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        font-size: 0.9rem;
        color: rgba(226, 232, 240, 0.7);
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }
      .nav-link:hover {
        background: rgba(99, 102, 241, 0.15);
        color: #c7d2fe;
        border-color: rgba(99, 102, 241, 0.3);
      }
      .nav-link.active {
        background: rgba(99, 102, 241, 0.22);
        color: #e0e7ff;
        border-color: rgba(99, 102, 241, 0.4);
      }
      @media (max-width: 768px) {
        .nav-bar {
          margin-left: 0;
          gap: 0.25rem;
        }
        .nav-link {
          padding: 0.4rem 0.7rem;
          font-size: 0.8rem;
        }
      }
    </style>
  </head>
  <body>
    <header style="padding: 1.5rem 0; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div class="header-container" style="display: flex; align-items: center; justify-content: space-between; max-width: 1480px; margin: 0 auto; gap: 1.5rem; padding: 0 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
          <a href="/" style="text-decoration: none; display: flex; align-items: center; gap: 1rem;">
            <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #00D9FF, #8B5CF6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: #0B0F19; font-family: 'Inter Tight', sans-serif;">A</div>
            <div>
              <h1 style="font-size: 1.5rem; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; font-family: 'Inter Tight', sans-serif; margin: 0;">
                Alphalabs
              </h1>
              <p style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Data Trading</p>
            </div>
          </a>
          <nav class="nav-bar">
            <a href="/" class="nav-link">Dashboard</a>
            <a href="/interest-rates" class="nav-link active">Interest Rates</a>
            <a href="/currency-strength" class="nav-link">Currency Strength</a>
            <a href="/cb-speeches" class="nav-link">CB Speeches</a>
            <a href="/weekly-calendar" class="nav-link">Weekly Calendar</a>
          </nav>
        </div>
        ${authControlsHtml}
      </div>
    </header>

    <main>
      <section style="max-width: 1480px; margin: 0 auto 1.5rem; padding: 0 1rem;">
        <div id="interest-rate-root"></div>
      </section>
    </main>

    <footer style="padding: 2rem 0; margin-top: 4rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; color: rgba(226, 232, 240, 0.5); font-size: 0.85rem;">
      Updated on demand • Powered by CME FedWatch & Market Data
    </footer>

    <script type="text/babel" data-presets="env,react" src="/interest-rate-probability.jsx"></script>
    <script type="text/babel" data-presets="env,react">
      const irRoot = ReactDOM.createRoot(document.getElementById('interest-rate-root'));
      irRoot.render(React.createElement(InterestRateProbability));
    </script>
  </body>
</html>`;

  res.send(html);
});
// Currency Strength Page
app.get('/currency-strength', ensureAuthenticated, async (req, res) => {
  const user = req.user;

  const authControlsHtml = user
    ? `<div class="auth-controls">
         <div class="auth-user">
           <strong>${user.displayName || user.email}</strong>
           <span>Authenticated</span>
         </div>
         ${user.picture ? `<img src="${user.picture}" alt="User" class="auth-avatar" />` : ''}
         <a href="/logout" class="auth-button logout">Logout</a>
       </div>`
    : `<a href="/login" class="auth-button login">Login</a>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Currency Strength - Alphalabs</title>
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
    <link rel="stylesheet" href="/public/theme-2025.css?v=${Date.now()}">
  </head>
  <body>
    <header style="padding: 1.5rem 0; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div class="header-container" style="display: flex; align-items: center; justify-content: space-between; max-width: 1480px; margin: 0 auto; gap: 1.5rem; padding: 0 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
          <a href="/" style="text-decoration: none; display: flex; align-items: center; gap: 1rem;">
            <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #00D9FF, #8B5CF6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: #0B0F19; font-family: 'Inter Tight', sans-serif;">A</div>
            <div>
              <h1 style="font-size: 1.5rem; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; font-family: 'Inter Tight', sans-serif; margin: 0;">
                Alphalabs
              </h1>
              <p style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Data Trading</p>
            </div>
          </a>
          <nav class="nav-bar">
            <a href="/" class="nav-link">Dashboard</a>
            <a href="/interest-rates" class="nav-link">Interest Rates</a>
            <a href="/currency-strength" class="nav-link active">Currency Strength</a>
            <a href="/cb-speeches" class="nav-link">CB Speeches</a>
            <a href="/weekly-calendar" class="nav-link">Weekly Calendar</a>
          </nav>
        </div>
        ${authControlsHtml}
      </div>
    </header>

    <main>
      <section style="max-width: 1480px; margin: 0 auto 1.5rem; padding: 0 1rem;">
        <div id="currency-strength-root"></div>
      </section>
    </main>

    <footer style="padding: 2rem 0; margin-top: 4rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; color: rgba(226, 232, 240, 0.5); font-size: 0.85rem;">
      Updated every 4 hours • Real-time currency strength analysis
    </footer>

    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script type="text/babel" src="/currency-strength.jsx"></script>
  </body>
</html>`;

  res.send(html);
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

// Manual login route
app.post('/auth/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login?error=Invalid email or password',
    failureFlash: false
  })
);

// Manual registration route
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    // Validation
    if (!email || !password || !confirmPassword) {
      return res.redirect('/signup?error=All fields are required');
    }

    if (password.length < 8) {
      return res.redirect('/signup?error=Password must be at least 8 characters');
    }

    if (password !== confirmPassword) {
      return res.redirect('/signup?error=Passwords do not match');
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.redirect('/signup?error=Email already registered');
    }

    // Create new user
    const newUser = await createUser(email, password);

    // Log the user in automatically
    req.login(newUser, (err) => {
      if (err) {
        console.error('Auto-login error:', err);
        return res.redirect('/login?error=Registration successful, please login');
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.redirect('/signup?error=Registration failed. Please try again.');
  }
});

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

// Password Reset Routes
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.redirect('/forgot-password?error=Email is required');
    }

    const token = await createPasswordResetToken(email);

    if (!token) {
      // Don't reveal if email exists or not (security best practice)
      return res.redirect('/forgot-password?success=If that email exists, a reset link has been generated');
    }

    // Send password reset email
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await emailService.sendPasswordResetEmail(email, resetUrl);

    res.redirect(`/forgot-password?success=If that email exists, a password reset link has been sent. Please check your inbox.`);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.redirect('/forgot-password?error=An error occurred. Please try again.');
  }
});

app.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.redirect(`/reset-password?token=${token}&error=All fields are required`);
    }

    if (password.length < 8) {
      return res.redirect(`/reset-password?token=${token}&error=Password must be at least 8 characters`);
    }

    if (password !== confirmPassword) {
      return res.redirect(`/reset-password?token=${token}&error=Passwords do not match`);
    }

    // Validate token first
    const user = await validateResetToken(token);
    if (!user) {
      return res.redirect('/forgot-password?error=Invalid or expired reset token');
    }

    // Reset password
    const success = await resetPassword(token, password);

    if (success) {
      res.redirect('/login?success=Password reset successful! Please login with your new password.');
    } else {
      res.redirect('/forgot-password?error=Failed to reset password. Token may be expired.');
    }
  } catch (err) {
    console.error('Reset password error:', err);
    res.redirect('/forgot-password?error=An error occurred. Please try again.');
  }
});

// API endpoint to get high-impact news (public - no auth required)
// Uses X API as primary source, falls back to FinancialJuice scraping
app.get('/api/financial-news', async (req, res) => {
  try {
    let news = [];
    let source = 'unknown';

    // Try X API first (preferred method)
    if (process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN) {
      try {
        console.log('Fetching news from X API...');
        news = await xNewsScraper.getLatestNews();
        source = 'x_api';
        console.log(`Successfully fetched ${news.length} items from X API`);
      } catch (xErr) {
        console.error('X API failed, falling back to scraping:', xErr.message);
        // Fall back to scraping
        news = await financialJuiceScraper.getLatestNews();
        source = 'web_scraping';
      }
    } else {
      // No X API token, use scraping
      console.log('No X_BEARER_TOKEN found, using web scraping');
      news = await financialJuiceScraper.getLatestNews();
      source = 'web_scraping';
    }

    res.json({
      success: true,
      count: news.length,
      data: news,
      source,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching financial news:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch financial news',
      message: err.message
    });
  }
});

// API endpoint to force refresh financial news cache (public - no auth required)
app.post('/api/financial-news/refresh', async (req, res) => {
  try {
    let news = [];
    let source = 'unknown';

    // Clear both caches
    if (process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN) {
      xNewsScraper.clearCache();
      news = await xNewsScraper.getLatestNews();
      source = 'x_api';
    } else {
      financialJuiceScraper.clearCache();
      news = await financialJuiceScraper.getLatestNews();
      source = 'web_scraping';
    }

    res.json({
      success: true,
      count: news.length,
      data: news,
      source,
      refreshed: true,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error refreshing financial news:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh financial news',
      message: err.message
    });
  }
});

// ============================================================================
// DeepSeek AI - Central Bank Speech Analysis Endpoints
// ============================================================================

/**
 * POST /api/ai/analyze-speech
 * Analyze a central bank speech for dovish/hawkish/neutral sentiment
 * Body: { text, speaker, centralBank, date }
 */
app.post('/api/ai/analyze-speech', async (req, res) => {
  try {
    const { text, speaker, centralBank, date } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Speech text is required'
      });
    }

    const analysis = await deepseekAI.analyzeSpeech(
      text,
      speaker || 'Unknown Speaker',
      centralBank || 'Central Bank',
      date || new Date().toISOString().split('T')[0]
    );

    res.json({
      success: true,
      data: analysis
    });
  } catch (err) {
    console.error('Speech analysis error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze speech',
      message: err.message
    });
  }
});

/**
 * POST /api/ai/quick-sentiment
 * Quick sentiment check for a headline or short text
 * Body: { text }
 */
app.post('/api/ai/quick-sentiment', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const sentiment = await deepseekAI.quickSentiment(text);

    res.json({
      success: true,
      data: sentiment
    });
  } catch (err) {
    console.error('Quick sentiment error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze sentiment',
      message: err.message
    });
  }
});

/**
 * POST /api/ai/compare-speeches
 * Compare multiple speeches for sentiment trends
 * Body: { speeches: [{ text, speaker, centralBank, date }] }
 */
app.post('/api/ai/compare-speeches', async (req, res) => {
  try {
    const { speeches } = req.body;

    if (!speeches || !Array.isArray(speeches) || speeches.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array of speeches is required'
      });
    }

    const comparison = await deepseekAI.compareSpeeches(speeches);

    res.json({
      success: true,
      data: comparison
    });
  } catch (err) {
    console.error('Speech comparison error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to compare speeches',
      message: err.message
    });
  }
});

/**
 * GET /api/ai/status
 * Check if DeepSeek AI is configured and ready
 */
app.get('/api/ai/status', (req, res) => {
  const isConfigured = !!process.env.DEEPSEEK_API_KEY;
  res.json({
    success: true,
    configured: isConfigured,
    model: 'deepseek-chat',
    features: ['speech-analysis', 'quick-sentiment', 'speech-comparison']
  });
});

/**
 * GET /api/ai/central-banks
 * Get list of all supported G8 central banks
 */
app.get('/api/ai/central-banks', (req, res) => {
  res.json({
    success: true,
    data: deepseekAI.getCentralBanks()
  });
});

/**
 * GET /api/speeches
 * Fetch CB speeches and press conferences from Financial Juice
 * Data retained for 1 week only
 */
app.get('/api/speeches', async (req, res) => {
  try {
    const { bank, type } = req.query;
    let content;

    if (bank) {
      // Fetch both speeches and press conferences for specific bank
      const [speeches, pressConfs] = await Promise.all([
        cbSpeechScraper.fetchSpeechesFromBank(bank.toUpperCase(), financialJuiceScraper),
        cbSpeechScraper.fetchPressConferencesFromBank(bank.toUpperCase(), financialJuiceScraper)
      ]);
      content = [...speeches, ...pressConfs].sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      // Fetch all content (speeches + press conferences) from FJ
      content = await cbSpeechScraper.fetchAllContent(financialJuiceScraper);
    }

    // Filter by type if specified
    if (type === 'speech') {
      content = content.filter(c => c.type === 'speech');
    } else if (type === 'press_conference') {
      content = content.filter(c => c.type === 'press_conference');
    }

    res.json({
      success: true,
      count: content.length,
      source: 'FinancialJuice',
      data: content
    });
  } catch (err) {
    console.error('Speech fetch error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch speeches',
      message: err.message
    });
  }
});

/**
 * GET /api/speeches/sources
 * Get list of available central bank sources
 */
app.get('/api/speeches/sources', (req, res) => {
  res.json({
    success: true,
    data: cbSpeechScraper.getSources()
  });
});

/**
 * POST /api/speeches/analyze
 * Analyze CB speech/press conf text from Financial Juice
 */
app.post('/api/speeches/analyze', async (req, res) => {
  try {
    const { title, description, speaker, centralBank, bankCode, date, text } = req.body;

    // Use provided text, or title + description from FJ
    let speechText = text || `${title || ''} ${description || ''}`.trim();

    if (!speechText || speechText.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Not enough text to analyze'
      });
    }

    // Run AI analysis
    const analysis = await deepseekAI.analyzeSpeech(
      speechText,
      speaker || 'Unknown Speaker',
      centralBank || 'Central Bank',
      date || new Date().toISOString().split('T')[0]
    );

    res.json({
      success: true,
      data: {
        ...analysis,
        bankCode,
        source: 'FinancialJuice'
      }
    });
  } catch (err) {
    console.error('Speech analyze error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze speech',
      message: err.message
    });
  }
});

/**
 * POST /api/speeches/search
 * Search speeches by query and optionally filter by bank
 */
app.post('/api/speeches/search', async (req, res) => {
  try {
    const { query, bank } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const speeches = await cbSpeechScraper.searchSpeeches(query, bank);

    res.json({
      success: true,
      count: speeches.length,
      data: speeches
    });
  } catch (err) {
    console.error('Speech search error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to search speeches',
      message: err.message
    });
  }
});

/**
 * GET /api/interest-rates/probabilities
 * Fetch interest rate probabilities for all central banks
 */
app.get('/api/interest-rates/probabilities', async (req, res) => {
  try {
    const allData = await rateProbabilityScraper.fetchAllProbabilities();
    res.json({
      success: true,
      data: allData,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('Error fetching rate probabilities:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * GET /api/interest-rates/probabilities/:centralBank
 * Fetch interest rate probability for specific central bank
 */
app.get('/api/interest-rates/probabilities/:centralBank', async (req, res) => {
  try {
    const { centralBank } = req.params;
    const data = await rateProbabilityScraper.fetchProbabilityForBank(centralBank.toUpperCase());

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Central bank not found'
      });
    }

    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error(`Error fetching ${req.params.centralBank}:`, err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * POST /api/interest-rates/refresh
 * Force refresh of rate probability cache
 */
app.post('/api/interest-rates/refresh', async (req, res) => {
  try {
    rateProbabilityScraper.clearCache();
    const data = await rateProbabilityScraper.fetchAllProbabilities();
    res.json({
      success: true,
      data,
      message: 'Cache cleared and data refreshed'
    });
  } catch (err) {
    console.error('Error refreshing rate probabilities:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// Protect all routes except login and auth routes
app.use((req, res, next) => {
  // Allow access to login, auth, and static files
  if (req.path === '/login' || req.path.startsWith('/auth/') || req.path.startsWith('/public/')) {
    return next();
  }

  // Check if user is authenticated
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }

  next();
});

app.get('/todo-card.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'todo-card.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/animated-title.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'animated-title.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/quick-notes.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'quick-notes.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/financial-news.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'financial-news.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/cb-speech-analysis.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'cb-speech-analysis.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/interest-rate-probability.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'interest-rate-probability.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/weekly-calendar.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'weekly-calendar.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/currency-strength.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'currency-strength.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

/**
 * Account Settings API - USER ISOLATED
 * ------------------------------------------------
 * GET  /api/account-settings  → get account settings for current user
 * PUT  /api/account-settings  → { startingBalance }
 */
function getUserSettings(userId) {
  if (!userAccountSettings[userId]) {
    const filename = `account-settings-${userId}.json`;
    userAccountSettings[userId] = loadJson(filename, { startingBalance: 10000 });
  }
  return userAccountSettings[userId];
}

function saveUserSettings(userId, settings) {
  userAccountSettings[userId] = settings;
  const filename = `account-settings-${userId}.json`;
  saveJson(filename, settings);
}

app.get('/api/account-settings', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const settings = getUserSettings(req.user.id);
  res.json(settings);
});

app.put('/api/account-settings', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { startingBalance } = req.body || {};

  if (typeof startingBalance === 'number' && startingBalance >= 0) {
    const settings = getUserSettings(req.user.id);
    settings.startingBalance = startingBalance;
    saveUserSettings(req.user.id, settings);
    res.json(settings);
  } else {
    res.status(400).json({ error: 'Invalid starting balance' });
  }
});

/**
 * Quick Notes API
 * ------------------------------------------------
 * GET  /api/notes  → get today's notes
 * POST /api/notes  → { text, type }
 * DELETE /api/notes/:id
 */
app.get('/api/notes', (req, res) => {
  // Get today's notes (last 24 hours)
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const todaysNotes = quickNotes
    .filter((note) => new Date(note.timestamp).getTime() > oneDayAgo)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(todaysNotes);
});

app.post('/api/notes', (req, res) => {
  const { text, type } = req.body || {};
  const cleanText = String(text || '').trim();
  const cleanType = String(type || 'note').trim();

  if (!cleanText) {
    return res.status(400).json({ error: 'Note text is required' });
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const note = {
    id,
    text: cleanText,
    type: cleanType,
    timestamp: new Date().toISOString(),
  };
  quickNotes.push(note);
  // persist notes
  saveJson('notes.json', quickNotes);
  res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const idx = quickNotes.findIndex((n) => n.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Note not found' });
  quickNotes.splice(idx, 1);
  // persist notes after deletion
  saveJson('notes.json', quickNotes);
  res.json({ success: true });
});

app.get('/api/todos', (req, res) => {
  res.json(todoItems.map((item) => ({ id: item.id, text: item.text, done: item.completed })));
});

// Force reload todos from disk (useful for debugging/recovery)
app.post('/api/todos/reload', (req, res) => {
  try {
    const reloadedTodos = loadJson('todos.json', []);
    // Clear and repopulate the array
    todoItems.length = 0;
    todoItems.push(...reloadedTodos);
    console.log(`Reloaded ${todoItems.length} todos from disk`);
    res.json({
      success: true,
      message: `Reloaded ${todoItems.length} todos`,
      todos: todoItems.map((item) => ({ id: item.id, text: item.text, done: item.completed }))
    });
  } catch (err) {
    console.error('Failed to reload todos:', err);
    res.status(500).json({ error: 'Failed to reload todos' });
  }
});

app.post('/todos', (req, res) => {
  const { task } = req.body || {};
  const text = (task || '').trim();
  if (!text) {
    return res.redirect('/?message=' + encodeURIComponent('Please enter a to-do item.'));
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  todoItems.push({
    id,
    text,
    completed: false,
  });
  // persist todos
  saveJson('todos.json', todoItems);
  res.redirect('/?message=' + encodeURIComponent('Task added.'));
});

app.post('/api/todos', (req, res) => {
  const { text } = req.body || {};
  const trimmedText = (text || '').trim();
  if (!trimmedText) {
    return res.status(400).json({ error: 'Please enter a to-do item.' });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newItem = {
    id,
    text: trimmedText,
    completed: false,
  };
  todoItems.push(newItem);
  // persist todos
  try {
    saveJson('todos.json', todoItems);
    res.json({ id: newItem.id, text: newItem.text, done: newItem.completed });
  } catch (err) {
    // Rollback the push if save failed
    const index = todoItems.findIndex(item => item.id === id);
    if (index !== -1) todoItems.splice(index, 1);
    res.status(500).json({ error: 'Failed to save todo item' });
  }
});

app.post('/todos/toggle', (req, res) => {
  const { id } = req.body || {};
  const item = todoItems.find((todo) => todo.id === id);
  if (!item) {
    return res.redirect('/?message=' + encodeURIComponent('Task not found.'));
  }
  item.completed = !item.completed;
  // persist todos after toggle
  saveJson('todos.json', todoItems);
  res.redirect('/');
});

app.post('/api/todos/toggle', (req, res) => {
  const { id } = req.body || {};
  const item = todoItems.find((todo) => todo.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  item.completed = !item.completed;
  // persist todos after toggle
  saveJson('todos.json', todoItems);
  res.json({ id: item.id, text: item.text, done: item.completed });
});

app.post('/todos/delete', (req, res) => {
  const { id } = req.body || {};
  const index = todoItems.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return res.redirect('/?message=' + encodeURIComponent('Task not found.'));
  }
  todoItems.splice(index, 1);
  // persist todos after deletion
  saveJson('todos.json', todoItems);
  res.redirect('/?message=' + encodeURIComponent('Task removed.'));
});

app.delete('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const index = todoItems.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  const deletedItem = todoItems[index];
  todoItems.splice(index, 1);
  // persist todos after deletion
  try {
    saveJson('todos.json', todoItems);
    res.json({ success: true });
  } catch (err) {
    // Rollback deletion if save failed
    todoItems.splice(index, 0, deletedItem);
    res.status(500).json({ error: 'Failed to delete todo item' });
  }
});

app.put('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const { text } = req.body || {};
  const trimmedText = (text || '').trim();

  if (!trimmedText) {
    return res.status(400).json({ error: 'Please enter a to-do item.' });
  }

  const item = todoItems.find((todo) => todo.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const oldText = item.text;
  item.text = trimmedText;
  // persist todos after update
  try {
    saveJson('todos.json', todoItems);
    res.json({ id: item.id, text: item.text, done: item.completed });
  } catch (err) {
    // Rollback text change if save failed
    item.text = oldText;
    res.status(500).json({ error: 'Failed to update todo item' });
  }
});
// API endpoint to get all currency strength data
app.get('/api/currency-strength', async (req, res) => {
  try {
    const strengthData = await loadCurrencyStrength();

    res.json({
      success: true,
      data: strengthData,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching currency strength:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch currency strength data',
      message: err.message
    });
  }
});

// API endpoint to get strongest and weakest currency pairs
app.get('/api/currency-strength/extremes', async (req, res) => {
  try {
    const strengthData = await loadCurrencyStrength();

    if (!strengthData || strengthData.length === 0) {
      return res.status(500).json({ error: 'Unable to load currency strength data' });
    }

    // Data is already sorted by strength (strongest first)
    const strongest = strengthData[0];
    const weakest = strengthData[strengthData.length - 1];

    res.json({
      strongest: {
        currency: strongest.name,
        title: strongest.title,
        value: strongest.value,
        momentum: strongest.momentum,
        trend: strongest.trend
      },
      weakest: {
        currency: weakest.name,
        title: weakest.title,
        value: weakest.value,
        momentum: weakest.momentum,
        trend: weakest.trend
      }
    });
  } catch (err) {
    console.error('Error fetching currency extremes:', err);
    res.status(500).json({ error: 'Failed to fetch currency strength data' });
  }
});

app.get('/', async (req, res) => {
  let autoEvents = [];
  let cbSpeeches = [];
  let trumpSchedule = [];
  let combinedEvents = [];
  let errorMsg = '';
  const message = req.query.message ? String(req.query.message) : '';

  try {
    const { autoEvents: autoList, cbSpeeches: cbList, trumpSchedule: trumpList, combinedEvents: combined, autoError } =
      await gatherEvents();
    autoEvents = autoList;
    cbSpeeches = cbList;
    trumpSchedule = trumpList;
    combinedEvents = combined;
    if (autoError) {
      errorMsg = autoError;
    }
  } catch (err) {
    errorMsg = err.message;
  }

  const eventsJson = JSON.stringify(
    combinedEvents.map((event) => {
      const eventDate = new Date(event.date);
      return {
        id: event.id,
        title: event.title,
        country: event.country,
        timestamp: eventDate.getTime(),
        formatted: formatEventDate(eventDate),
        source: event.source,
      };
    })
  );
  const nextEvent = combinedEvents[0] || null;
  const nextEventJson = JSON.stringify(
    nextEvent ? {
      id: nextEvent.id,
      title: nextEvent.title,
      country: nextEvent.country,
      timestamp: new Date(nextEvent.date).getTime(),
      formatted: formatEventDate(new Date(nextEvent.date)),
      source: nextEvent.source,
    } : null
  );

  const nextEventPanel = nextEvent
    ? `
      <div class="next-event-card">
        <div class="next-event-title">
          [${escapeHtml(nextEvent.country)}] ${escapeHtml(nextEvent.title)}
          <span class="badge ${nextEvent.source === 'manual' ? 'manual' : 'auto'}">
            ${nextEvent.source === 'manual' ? 'Manual' : 'Auto'}
          </span>
        </div>
        <div class="next-event-meta">Scheduled: ${formatEventDate(new Date(nextEvent.date))}</div>
        <div class="countdown next-countdown" id="next-event-countdown">Loading...</div>
      </div>
    `
    : '<p class="next-empty">No upcoming events yet. Use the form below to add one.</p>';

  const userProfile = req.user || null;
  const userPrimaryEmail =
    userProfile && Array.isArray(userProfile.emails) && userProfile.emails.length > 0
      ? userProfile.emails[0]?.value || ''
      : '';
  const userAvatar =
    userProfile && Array.isArray(userProfile.photos) && userProfile.photos.length > 0
      ? userProfile.photos[0]?.value || ''
      : '';
  const userDisplayName = userProfile
    ? userProfile.displayName || userPrimaryEmail || 'Trader'
    : '';

  const authControlsHtml = userProfile
    ? `
          <div class="auth-controls">
            ${userAvatar ? `<img src="${escapeHtml(userAvatar)}" alt="User avatar" class="auth-avatar" />` : ''}
            <div class="auth-user">
              <strong>${escapeHtml(userDisplayName)}</strong>
              ${userPrimaryEmail ? `<span>${escapeHtml(userPrimaryEmail)}</span>` : ''}
            </div>
            <a href="/logout" class="auth-button logout" title="Sign out of this dashboard">⎋ Logout</a>
          </div>
        `
    : `
          <div class="auth-controls">
            <a href="/login" class="auth-button login" title="Sign in to your dashboard">🔑 Login</a>
          </div>
        `;

  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Alphalabs Data Trading | Live Currency Strength & Economic Events</title>
      <meta name="description" content="Real-time currency strength tracking and high-impact forex economic event countdowns. Track USD, EUR, GBP, JPY and other major currencies with live data updates.">
      <meta name="keywords" content="currency strength, forex trading, economic calendar, forex events, trading dashboard, currency pairs, forex analysis">
      <meta property="og:title" content="Alphalabs Data Trading | Live Currency Strength & Economic Events">
      <meta property="og:description" content="Real-time currency strength tracking and high-impact forex economic event countdowns.">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
      <link rel="canonical" href="http://localhost:${PORT}/">
      <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
      <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
      <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js" defer></script>
      <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" defer></script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js" defer></script>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="/public/theme-2025.css?v=${Date.now()}">
      <style>
        .auth-controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }
        .auth-avatar {
          width: 38px;
          height: 38px;
          min-width: 38px;
          border-radius: 9999px;
          border: 2px solid rgba(96, 165, 250, 0.35);
          object-fit: cover;
        }
        @media (max-width: 480px) {
          .auth-controls {
            gap: 0.5rem;
          }
          .auth-avatar {
            width: 32px;
            height: 32px;
            min-width: 32px;
          }
          .auth-user {
            display: none;
          }
          .auth-button {
            padding: 0.35rem 0.75rem;
            font-size: 0.8rem;
          }
          .header-container {
            flex-direction: row;
            gap: 0.5rem;
          }
          .header-container h1 {
            font-size: 1.5rem !important;
          }
        }
        .auth-user {
          text-align: right;
          line-height: 1.2;
        }
        .auth-user strong {
          font-size: 0.95rem;
          color: #e2e8f0;
          font-weight: 600;
        }
        .auth-user span {
          display: block;
          font-size: 0.75rem;
          color: rgba(226, 232, 240, 0.6);
        }
        .auth-button {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 1rem;
          border-radius: 9999px;
          text-decoration: none;
          font-weight: 600;
          transition: background 0.2s ease, border 0.2s ease, color 0.2s ease;
        }
        .auth-button.login {
          background: rgba(79, 70, 229, 0.22);
          border: 1px solid rgba(99, 102, 241, 0.5);
          color: #c7d2fe;
        }
        .auth-button.login:hover {
          background: rgba(99, 102, 241, 0.32);
          border-color: rgba(129, 140, 248, 0.7);
          color: #eef2ff;
        }
        .auth-button.logout {
          background: rgba(248, 113, 113, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.45);
          color: #fecaca;
        }
        .auth-button.logout:hover {
          background: rgba(248, 113, 113, 0.3);
          border-color: rgba(248, 113, 113, 0.65);
          color: #fee2e2;
        }
        .nav-bar {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin-left: 2rem;
        }
        .nav-link {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.7);
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }
        .nav-link:hover {
          background: rgba(99, 102, 241, 0.15);
          color: #c7d2fe;
          border-color: rgba(99, 102, 241, 0.3);
        }
        .nav-link.active {
          background: rgba(99, 102, 241, 0.22);
          color: #e0e7ff;
          border-color: rgba(99, 102, 241, 0.4);
        }
        @media (max-width: 768px) {
          .nav-bar {
            margin-left: 0;
            gap: 0.25rem;
          }
          .nav-link {
            padding: 0.4rem 0.7rem;
            font-size: 0.8rem;
          }
        }
      </style>
    </head>
    <body>
      <header style="padding: 1.5rem 0; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div class="header-container" style="display: flex; align-items: center; justify-content: space-between; max-width: 1480px; margin: 0 auto; gap: 1.5rem; padding: 0 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
            <a href="/" style="text-decoration: none; display: flex; align-items: center; gap: 1rem;">
              <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #00D9FF, #8B5CF6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: #0B0F19; font-family: 'Inter Tight', sans-serif;">A</div>
              <div>
                <h1 style="font-size: 1.5rem; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; font-family: 'Inter Tight', sans-serif; margin: 0;">
                  Alphalabs
                </h1>
                <p style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Data Trading</p>
              </div>
            </a>
            <nav class="nav-bar">
              <a href="/" class="nav-link ${req.path === '/' ? 'active' : ''}">Dashboard</a>
              <a href="/interest-rates" class="nav-link ${req.path === '/interest-rates' ? 'active' : ''}">Interest Rates</a>
              <a href="/currency-strength" class="nav-link ${req.path === '/currency-strength' ? 'active' : ''}">Currency Strength</a>
              <a href="/cb-speeches" class="nav-link ${req.path === '/cb-speeches' ? 'active' : ''}">CB Speeches</a>
              <a href="/weekly-calendar" class="nav-link ${req.path === '/weekly-calendar' ? 'active' : ''}">Weekly Calendar</a>
            </nav>
          </div>
          ${authControlsHtml}
        </div>
      </header>
      <main>
        ${message ? `<div class="message" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(message)}</div>` : ''}
        ${errorMsg ? `<div class="error" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(errorMsg)}</div>` : ''}

        <!-- BENTO LAYOUT: Event Countdown, Upcoming Events, Notes, Todo List -->
        <div class="bento-container" style="max-width: 1480px; margin: 0 auto 2rem;">
          <!-- Event Countdown Box (Top Left) -->
          <div class="bento-box bento-countdown">
            <h2 style="margin-bottom: 1rem; font-size: 1.3rem; font-weight: 700;">⏰ Next Event Countdown</h2>
            <div id="next-event-panel">
              ${nextEventPanel}
            </div>
          </div>

          <!-- Upcoming Events Box (Top Right) -->
          <div class="bento-box bento-events">
            <h2 style="margin-bottom: 1rem; font-size: 1.3rem; font-weight: 700;">📰 Upcoming High Impact News</h2>
            <p style="margin-bottom: 1rem; font-size: 0.85rem; color: rgba(226, 232, 240, 0.7);">
              Tracking ${autoEvents.length} economic + ${cbSpeeches.length} CB speeches + ${trumpSchedule.length} Trump events
            </p>
            <div class="events-preview">
              <div class="events-limited"></div>
            </div>
            <button id="toggle-events-btn" class="toggle-events-btn" style="margin-top: 1rem; padding: 0.6rem 1.2rem; background: rgba(251, 146, 60, 0.18); border: 1px solid rgba(251, 146, 60, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; width: 100%; color: #fdba74;">
              Show All Events
            </button>
            <div id="events-expanded" style="display: none; margin-top: 1rem;">
              <div class="events-scroll" style="max-height: 350px; overflow-y: auto; padding: 0.5rem 0;">
                <div class="events-all"></div>
              </div>
            </div>
          </div>

          <!-- Quick Notes & Warnings Box (Bottom Right) -->
          <div class="bento-box bento-notes">
            <div id="notes-root"></div>
          </div>

          <!-- Todo List Box (Bottom Left) -->
          <div class="bento-box bento-todos">
            <div id="todo-root"></div>
          </div>
        </div>

        <!-- Financial News Feed -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div id="financial-news-root"></div>
        </section>

        <!-- Interest Rate Probability -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div id="interest-rate-root"></div>
        </section>
      </main>
      <footer>
        Updated on demand • Times are shown in your local timezone • Final 3 minutes include an audible tick
      </footer>
      <script>
        const THREE_MINUTES = 3 * 60 * 1000;
        const events = ${eventsJson};
        const nextEventData = ${nextEventJson};
        let nextWarned = false;
        let nextAnnounced = false;
        let countdownSoundTimer = null;
        let sharedAudioCtx = null;

        function formatDuration(ms) {
          if (ms <= 0) return '00:00:00';
          const totalSeconds = Math.floor(ms / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          const pad = (n) => String(n).padStart(2, '0');
          return \`\${pad(hours)}:\${pad(minutes)}:\${pad(seconds)}\`;
        }

        function getAudioContext() {
          if (!sharedAudioCtx) {
            sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          }
          if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
          }
          return sharedAudioCtx;
        }

        function scheduleTick(ctx, startAt) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.00001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.00001, startAt + 0.22);
          osc.frequency.value = 880;
          osc.connect(gain).connect(ctx.destination);
          osc.start(startAt);
          osc.stop(startAt + 0.24);
        }

        function playTick() {
          const ctx = getAudioContext();
          const now = ctx.currentTime;
          scheduleTick(ctx, now);
          scheduleTick(ctx, now + 0.28);
        }

        function announceStart(title, country) {
          const ctx = getAudioContext();
          const baseTime = ctx.currentTime;
          for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const offset = baseTime + i * 0.3;
            gain.gain.setValueAtTime(0.00001, offset);
            gain.gain.exponentialRampToValueAtTime(0.3, offset + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.00001, offset + 0.25);
            osc.frequency.value = 660;
            osc.connect(gain).connect(ctx.destination);
            osc.start(offset);
            osc.stop(offset + 0.26);
          }
          if ('speechSynthesis' in window) {
            const msg = new SpeechSynthesisUtterance(\`\${country} \${title} is starting now\`);
            window.speechSynthesis.speak(msg);
          }
        }

        function startCountdownSound() {
          if (countdownSoundTimer) return;
          playTick();
          countdownSoundTimer = setInterval(() => {
            playTick();
          }, 1000);
        }

        function stopCountdownSound() {
          if (!countdownSoundTimer) return;
          clearInterval(countdownSoundTimer);
          countdownSoundTimer = null;
        }

        function createEventCard(event) {
          const card = document.createElement('div');
          card.className = 'event-card';
          card.dataset.timestamp = event.timestamp;
          card.dataset.eventId = event.id;
          const badge = event.source === 'manual' ? '<span class="badge manual">Manual</span>' : '<span class="badge auto">Auto</span>';
          card.innerHTML = \`
            <div class="event-title">[\${event.country}] \${event.title} \${badge}</div>
            <div class="event-meta">Scheduled: \${event.formatted}</div>
            <div class="countdown">Loading...</div>
            \${event.source === 'manual' ? \`<form class="delete-form" method="POST" action="/events/delete">
              <input type="hidden" name="id" value="\${event.id}">
              <button type="submit">Remove</button>
            </form>\` : ''}
          \`;
          return card;
        }

        function renderEvents() {
          // Render limited events (first 3)
          const limitedContainer = document.querySelector('.events-limited');
          const allContainer = document.querySelector('.events-all');

          if (!limitedContainer || !allContainer) return;

          limitedContainer.innerHTML = '';
          allContainer.innerHTML = '';

          if (!events || events.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'next-empty';
            empty.style.cssText = 'padding: 2rem; text-align: center; font-style: italic; color: rgba(226, 232, 240, 0.7);';
            empty.textContent = 'No upcoming events. Add one using the form below.';
            limitedContainer.appendChild(empty);
            return;
          }

          // Show first 3 events in limited view
          const limitedEvents = events.slice(0, 3);
          limitedEvents.forEach((event) => {
            const card = createEventCard(event);
            limitedContainer.appendChild(card);
          });

          // Show all events in expanded view
          events.forEach((event) => {
            const card = createEventCard(event);
            allContainer.appendChild(card);
          });

          // Hide toggle button if 3 or fewer events
          const toggleBtn = document.getElementById('toggle-events-btn');
          if (toggleBtn) {
            toggleBtn.style.display = events.length <= 3 ? 'none' : 'block';
          }
        }

        // Toggle events expand/collapse (form is now always visible)
        function setupEventsToggle() {
          const toggleBtn = document.getElementById('toggle-events-btn');
          const expandedSection = document.getElementById('events-expanded');
          let isExpanded = false;

          if (toggleBtn && expandedSection) {
            toggleBtn.addEventListener('click', () => {
              isExpanded = !isExpanded;
              expandedSection.style.display = isExpanded ? 'block' : 'none';
              toggleBtn.textContent = isExpanded ? 'Hide All Events' : 'Show All Events';
            });
          }
        }

        function updateCountdowns() {
          const now = Date.now();
          document.querySelectorAll('.event-card').forEach((card) => {
            const timestamp = Number(card.dataset.timestamp);
            const diff = timestamp - now;
            const countdownEl = card.querySelector('.countdown');

            if (diff <= 0) {
              countdownEl.textContent = 'In progress!';
              countdownEl.classList.add('started');
              card.classList.add('highlight');
              if (!card.dataset.started) {
                if (!card.dataset.primary) {
                  announceStart(card.querySelector('.event-title').textContent.replace(/\\[.*?\\]\\s*/,'').trim(), card.querySelector('.event-title').textContent.match(/\\[(.*?)\\]/)?.[1] || '');
                }
                card.dataset.started = 'true';
              }
              return;
            }

            countdownEl.textContent = formatDuration(diff);
            if (diff <= THREE_MINUTES) {
              countdownEl.classList.add('urgent');
              card.classList.add('highlight');
              if (!card.dataset.warned && !card.dataset.primary) {
                playTick();
                card.dataset.warned = 'true';
              }
            } else {
              countdownEl.classList.remove('urgent');
              card.classList.remove('highlight');
              card.dataset.warned = '';
            }
          });
        }

        function updateNextEventCountdown() {
          if (!nextEventData) return;
          const countdownEl = document.getElementById('next-event-countdown');
          if (!countdownEl) return;
          const diff = nextEventData.timestamp - Date.now();
          if (diff <= 0) {
            countdownEl.textContent = 'IN SESSION';
            countdownEl.classList.add('started');
            countdownEl.classList.remove('urgent');
            stopCountdownSound();
            if (!nextAnnounced) {
              announceStart(nextEventData.title, nextEventData.country);
              nextAnnounced = true;
            }
            return;
          }

          countdownEl.textContent = formatDuration(diff);
          if (diff <= THREE_MINUTES) {
            countdownEl.classList.add('urgent');
            if (!nextWarned) {
              startCountdownSound();
              nextWarned = true;
            }
          } else {
            countdownEl.classList.remove('urgent');
            if (nextWarned) {
              stopCountdownSound();
            }
            nextWarned = false;
          }
        }

        renderEvents();
        setupEventsToggle();
        updateCountdowns();
        updateNextEventCountdown();
        setInterval(() => {
          updateCountdowns();
          updateNextEventCountdown();
        }, 1000);

        function pad2(n) { return String(n).padStart(2, '0'); }
        function formatForDatetimeLocal(d) {
          const yyyy = d.getFullYear();
          const mm = pad2(d.getMonth() + 1);
          const dd = pad2(d.getDate());
          const hh = pad2(d.getHours());
          const mi = pad2(d.getMinutes());
          return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + mi;
        }

        function computeNextMonday(base) {
          const d = new Date(base);
          const day = d.getDay(); // Sun=0..Sat=6, want Mon=1
          const diff = (8 - (day || 7));
          d.setDate(d.getDate() + diff - 1); // move to next Monday
          return d;
        }

        function nextMarketOpen(base) {
          // Simple heuristic: next weekday at 09:00 local time
          const d = new Date(base);
          d.setDate(d.getDate() + 1);
          d.setHours(9, 0, 0, 0);
          // If weekend, push to Monday 09:00
          while ([0,6].includes(d.getDay())) {
            d.setDate(d.getDate() + 1);
          }
          return d;
        }

        // Animated title will be mounted by React component (animated-title.jsx).
      </script>
      <script type="text/babel">
        // Load the simple animated title immediately
        try {
          const root = document.getElementById('animated-title-root');
          if (root) {
            const s = document.createElement('script');
            s.type = 'text/babel';
            s.src = '/animated-title.jsx';
            document.body.appendChild(s);
          }
        } catch (e) {
          console.error('Failed to load animated title:', e);
        }
      </script>
  <script type="text/babel" data-presets="env,react" src="/todo-card.jsx"></script>
  <script type="text/babel" data-presets="env,react" src="/quick-notes.jsx"></script>
  <script type="text/babel" data-presets="env,react" src="/financial-news.jsx"></script>
  <script type="text/babel" data-presets="env,react" src="/interest-rate-probability.jsx"></script>
      <script type="text/babel" data-presets="env,react">
        const root = ReactDOM.createRoot(document.getElementById('todo-root'));
        root.render(React.createElement(TodoCard));
        const nroot = ReactDOM.createRoot(document.getElementById('notes-root'));
        nroot.render(React.createElement(QuickNotes));
        const fnroot = ReactDOM.createRoot(document.getElementById('financial-news-root'));
        fnroot.render(React.createElement(FinancialNewsFeed));
      </script>
      <script>
        // Live reload WebSocket connection
        (function() {
          const ws = new WebSocket('ws://' + window.location.host);
          ws.onopen = () => console.log('[Live Reload] Connected');
          ws.onmessage = (event) => {
            if (event.data === 'reload') {
              console.log('[Live Reload] Reloading page...');
              window.location.reload();
            }
          };
          ws.onclose = () => {
            console.log('[Live Reload] Disconnected. Retrying in 2s...');
            setTimeout(() => window.location.reload(), 2000);
          };
          ws.onerror = (err) => console.log('[Live Reload] Error:', err);
        })();
      </script>
    </body>
  </html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/next', async (req, res) => {
  let errorMsg = null;
  let nextEvent = null;

  try {
    const { combinedEvents, autoError } = await gatherEvents();
    if (autoError) {
      errorMsg = autoError;
    }
    nextEvent = combinedEvents[0] || null;
  } catch (err) {
    errorMsg = err.message;
  }

  if (!nextEvent) {
    const html = `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>No Upcoming Event</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            font-family: system-ui, sans-serif;
            background: radial-gradient(circle at top, #1e293b, #0f172a);
            color: #e2e8f0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2rem;
          }
          a {
            color: #60a5fa;
            text-decoration: none;
            font-weight: 600;
          }
          .message {
            margin-top: 1rem;
            font-size: 0.95rem;
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <h1>No event scheduled</h1>
        <p class="message">Add an event on the main dashboard to see it here.</p>
        <p><a href="/">â† Back to Dashboard</a></p>
      </body>
    </html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(nextEvent.title)} â€“ Alphalabs Data Trading</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          font-family: "Inter", system-ui, sans-serif;
          background: radial-gradient(circle at center, rgba(59, 130, 246, 0.25), #0f172a);
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          text-align: center;
        }
        h1 {
          margin-bottom: 0.25rem;
          font-size: clamp(2.5rem, 4vw, 4rem);
        }
        .meta {
          font-size: 1.1rem;
          opacity: 0.85;
          margin-bottom: 2.5rem;
        }
        @keyframes countdownGlow {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 36px 80px rgba(59, 130, 246, 0.4);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 48px 110px rgba(14, 165, 233, 0.6);
          }
        }
        .countdown {
          font-family: "Roboto Mono", "SFMono-Regular", monospace;
          font-size: clamp(4.2rem, 12vw, 9.5rem);
          letter-spacing: 0.1em;
          padding: 1.25rem 2.5rem;
          border-radius: 1.75rem;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.65), rgba(13, 148, 136, 0.25));
          border: 1px solid rgba(148, 163, 184, 0.35);
          color: #f1f5f9;
          text-shadow: 0 0 28px rgba(59, 130, 246, 0.6);
          box-shadow: 0 40px 85px rgba(15, 23, 42, 0.55);
          transition: transform 0.6s ease, color 0.4s ease, background 0.6s ease, box-shadow 0.6s ease;
        }
        .countdown.urgent {
          color: #fde68a;
          animation: countdownGlow 1.8s ease-in-out infinite;
          text-shadow: 0 0 32px rgba(253, 224, 71, 0.85);
          background: linear-gradient(135deg, rgba(249, 115, 22, 0.45), rgba(234, 179, 8, 0.35));
        }
        .countdown.started {
          color: #22c55e;
        }
        .back-link {
          margin-top: 2.5rem;
          font-size: 1rem;
          color: #93c5fd;
          text-decoration: none;
          font-weight: 600;
        }
        .back-link:hover {
          text-decoration: underline;
        }
        .error {
          margin-top: 1rem;
          font-size: 0.85rem;
          color: #fecaca;
        }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(nextEvent.title)}</h1>
      <div class="meta">
        Country: <strong>${escapeHtml(nextEvent.country)}</strong> â€¢
        Scheduled: ${escapeHtml(formatEventDate(nextEvent.date))} â€¢
        Source: ${nextEvent.source === 'manual' ? 'Manual entry' : 'Automatic calendar'}
      </div>
      <div class="countdown" id="countdown">Loading...</div>
      <a class="back-link" href="/">â† Back to Dashboard</a>
      ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ''}
      <script>
        const THREE_MINUTES = 3 * 60 * 1000;
        const eventTitle = ${JSON.stringify(nextEvent.title)};
        const eventCountry = ${JSON.stringify(nextEvent.country)};
        const eventTimestamp = ${nextEvent.date.getTime()};

        function formatDuration(ms) {
          if (ms <= 0) return '00:00:00';
          const totalSeconds = Math.floor(ms / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          const pad = (n) => String(n).padStart(2, '0');
          return \`\${pad(hours)}:\${pad(minutes)}:\${pad(seconds)}\`;
        }

        function playTick() {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          function beep(offset) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.22);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + offset);
            osc.stop(ctx.currentTime + offset + 0.23);
          }
          beep(0);
          beep(0.28);
        }

        function announceStart() {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 660;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + i * 0.35 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.26);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.35);
            osc.stop(ctx.currentTime + i * 0.35 + 0.27);
          }
          if ('speechSynthesis' in window) {
            const phrase = eventCountry + ' ' + eventTitle + ' is starting now';
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(phrase));
          }
        }

        const countdownEl = document.getElementById('countdown');
        let warned = false;
        let announced = false;

        function update() {
          const diff = eventTimestamp - Date.now();
          if (diff <= 0) {
            if (!announced) {
              announceStart();
              announced = true;
            }
            countdownEl.textContent = 'IN SESSION';
            countdownEl.classList.add('started');
            countdownEl.classList.remove('urgent');
            return;
          }

          countdownEl.textContent = formatDuration(diff);
          if (diff <= THREE_MINUTES) {
            countdownEl.classList.add('urgent');
            if (!warned) {
              playTick();
              warned = true;
            }
          } else {
            countdownEl.classList.remove('urgent');
            warned = false;
          }
        }

        update();
        setInterval(update, 1000);
      </script>
      <script>
        // Live reload WebSocket connection
        (function() {
          const ws = new WebSocket('ws://' + window.location.host);
          ws.onopen = () => console.log('[Live Reload] Connected');
          ws.onmessage = (event) => {
            if (event.data === 'reload') {
              console.log('[Live Reload] Reloading page...');
              window.location.reload();
            }
          };
          ws.onclose = () => {
            console.log('[Live Reload] Disconnected. Retrying in 2s...');
            setTimeout(() => window.location.reload(), 2000);
          };
          ws.onerror = (err) => console.log('[Live Reload] Error:', err);
        })();
      </script>
    </body>
  </html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  });

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Alphalabs data trading server running on http://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Periodic backup of todos every 30 seconds to prevent data loss
  setInterval(() => {
    try {
      saveJson('todos.json', todoItems);
      console.log(`[Auto-save] Todos backed up at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error('[Auto-save] Failed to backup todos:', err);
    }
  }, 30000); // 30 seconds

  console.log('Auto-save enabled: Todos will be backed up every 30 seconds');
});

// WebSocket server for live reload
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
  console.log('Live reload client connected');
  wsClients.add(ws);

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('Live reload client disconnected');
  });
});

function notifyReload() {
  wsClients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send('reload');
    }
  });
  console.log(`Sent reload signal to ${wsClients.size} client(s)`);
}

// Watch JSX and CSS files for changes
const watchedFiles = [
  path.join(__dirname, 'todo-card.jsx'),
  path.join(__dirname, 'quick-notes.jsx'),
  path.join(__dirname, 'animated-title.jsx'),
  path.join(__dirname, 'financial-news.jsx'),
  path.join(__dirname, 'cb-speech-analysis.jsx'),
  path.join(__dirname, 'interest-rate-probability.jsx'),
  path.join(__dirname, 'public', 'styles.css'),
];

watchedFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.watch(file, { persistent: true }, (eventType) => {
      if (eventType === 'change') {
        console.log(`File changed: ${path.basename(file)} - Reloading clients...`);
        notifyReload();
      }
    });
    console.log(`Watching: ${path.basename(file)}`);
  }
});


