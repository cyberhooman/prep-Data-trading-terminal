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
const { passport, ensureAuthenticated, findUserByEmail, createUser } = require('./auth');
const financialJuiceScraper = require('./services/financialJuiceScraper');
const xNewsScraper = require('./services/xNewsScraper');
const deepseekAI = require('./services/deepseekAI');
const cbSpeechScraper = require('./services/cbSpeechScraper');

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

// Simple on-disk persistence for todos, journal and manual events so data survives restarts.
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

let manualEvents = loadJson('events.json', []).map(event => ({
  ...event,
  date: new Date(event.date).toISOString()
}));

const todoItems = loadJson('todos.json', []);
const quickNotes = loadJson('notes.json', []);
// Account settings are now per-user, loaded on demand
const userAccountSettings = {};

const journalEntryCache = new Map();
let legacyJournalLoaded = false;
let legacyJournalEntries = [];

function getJournalFilename(userId) {
  return `journal-${userId}.json`;
}

function loadLegacyJournalEntries() {
  if (!legacyJournalLoaded) {
    legacyJournalEntries = loadJson('journal.json', []).filter(Boolean);
    legacyJournalLoaded = true;
  }
  return legacyJournalEntries;
}

function getJournalEntries(userId) {
  if (!userId) return [];

  if (!journalEntryCache.has(userId)) {
    const filename = getJournalFilename(userId);
    const filePath = path.join(DATA_DIR, filename);
    let entries;

    if (fs.existsSync(filePath)) {
      entries = loadJson(filename, []);
    } else {
      const legacyMatches = loadLegacyJournalEntries().filter(
        (entry) => entry && entry.userId === userId
      );
      entries = legacyMatches.length > 0 ? legacyMatches : [];
      if (legacyMatches.length > 0) {
        saveJson(filename, entries);
      }
    }

    journalEntryCache.set(userId, entries);
  }

  return journalEntryCache.get(userId);
}

function saveJournalEntries(userId) {
  if (!userId) return;
  const filename = getJournalFilename(userId);
  const entries = journalEntryCache.get(userId) || [];
  saveJson(filename, entries);
}

function getUpcomingEvents() {
  const now = Date.now();
  return manualEvents
    .filter((event) => {
      try {
        const eventDate = new Date(event.date);
        return !isNaN(eventDate.getTime()) && eventDate.getTime() > now;
      } catch (e) {
        console.error('Invalid date in event:', event);
        return false;
      }
    })
    .map((event) => ({
      id: event.id,
      title: event.title,
      country: event.country,
      date: event.date,
      source: 'manual'
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function gatherEvents() {
  console.log('Gathering events...');
  const manualUpcoming = getUpcomingEvents() || [];
  console.log('Manual events:', manualUpcoming);
  
  let autoEvents = [];
  let autoError = null;
  
  try {
    const loadedEvents = await loadHighImpactEvents();
    autoEvents = Array.isArray(loadedEvents) ? loadedEvents : [];
    console.log('Auto events loaded:', autoEvents);
  } catch (err) {
    console.error('Error loading auto events:', err);
    autoError = err.message.replace(/<[^>]+>/g, '').trim();
    autoEvents = [];
  }

  // Ensure both arrays are valid before combining
  const validManual = Array.isArray(manualUpcoming) ? manualUpcoming : [];
  const validAuto = Array.isArray(autoEvents) ? autoEvents : [];
  
  const combinedEvents = [...validManual, ...validAuto].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });
  
  return { manualUpcoming, autoEvents, combinedEvents, autoError };
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
      <script src="https://unpkg.com/three@0.159.0/build/three.min.js"></script>
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
        }

        #shader-bg canvas {
          display: block;
          width: 100%;
          height: 100%;
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
          background: rgba(0, 0, 0, 0.4);
          border: 2px solid var(--neon-blue);
          box-shadow:
            0 0 20px rgba(0, 136, 255, 0.4),
            inset 0 0 40px rgba(0, 136, 255, 0.05),
            0 0 80px rgba(255, 0, 85, 0.3);
          padding: 3px;
        }

        .terminal-border::before {
          content: '';
          position: absolute;
          top: -2px;
          left: -2px;
          right: -2px;
          bottom: -2px;
          background: linear-gradient(45deg, var(--neon-red), var(--neon-green), var(--neon-blue));
          z-index: -1;
          opacity: 0;
          transition: opacity 0.3s;
          filter: blur(10px);
        }

        .terminal-border:hover::before {
          opacity: 0.4;
        }

        .terminal-header {
          background: linear-gradient(135deg, rgba(0, 136, 255, 0.15), rgba(255, 0, 85, 0.1));
          border-bottom: 1px solid var(--neon-blue);
          padding: 12px 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--neon-blue);
        }

        .terminal-dots {
          display: flex;
          gap: 6px;
          margin-right: auto;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        .dot:nth-child(1) {
          background: #ff0055;
          box-shadow: 0 0 8px #ff0055;
        }

        .dot:nth-child(2) {
          background: #ffbb00;
          box-shadow: 0 0 8px #ffbb00;
          animation-delay: 0.2s;
        }

        .dot:nth-child(3) {
          background: #00ff00;
          box-shadow: 0 0 8px #00ff00;
          animation-delay: 0.4s;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }

        .terminal-content {
          padding: 32px 28px;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(8px);
        }

        .logo {
          font-family: 'Orbitron', monospace;
          font-size: 2.2rem;
          font-weight: 900;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 3px;
          background: linear-gradient(135deg, var(--neon-red) 0%, var(--neon-green) 50%, var(--neon-blue) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 0 30px rgba(0, 136, 255, 0.5);
          animation: glitch 3s ease-in-out infinite;
          position: relative;
        }

        @keyframes glitch {
          0%, 90%, 100% { transform: translate(0); }
          92% { transform: translate(-2px, 1px); }
          94% { transform: translate(2px, -1px); }
          96% { transform: translate(-1px, 2px); }
        }

        .subtitle {
          font-size: 11px;
          color: var(--neon-blue);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 20px;
          opacity: 0.8;
          font-weight: 500;
        }

        .prompt-line {
          font-size: 12px;
          color: var(--neon-green);
          margin-bottom: 20px;
          font-weight: 500;
        }

        .prompt-line::before {
          content: '> ';
          color: var(--neon-red);
          font-weight: 700;
        }

        .cursor-blink {
          display: inline-block;
          width: 8px;
          height: 16px;
          background: var(--neon-green);
          margin-left: 4px;
          animation: blink 1s step-end infinite;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        /* Tab Navigation */
        .tab-navigation {
          display: flex;
          gap: 4px;
          margin-bottom: 24px;
          border-bottom: 2px solid rgba(0, 136, 255, 0.2);
        }

        .tab-btn {
          flex: 1;
          padding: 12px 20px;
          background: rgba(0, 136, 255, 0.03);
          border: none;
          border-bottom: 2px solid transparent;
          color: rgba(0, 136, 255, 0.5);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          margin-bottom: -2px;
        }

        .tab-btn::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, var(--neon-blue), var(--neon-red));
          transform: scaleX(0);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .tab-btn:hover {
          background: rgba(0, 136, 255, 0.08);
          color: rgba(0, 136, 255, 0.8);
        }

        .tab-btn.active {
          background: rgba(0, 136, 255, 0.1);
          color: var(--neon-blue);
          border-bottom-color: var(--neon-blue);
        }

        .tab-btn.active::before {
          transform: scaleX(1);
        }

        /* Tab Content */
        .tab-content {
          display: none;
          animation: fadeIn 0.4s ease-out;
        }

        .tab-content.active {
          display: block;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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
          gap: 8px;
        }

        .form-label {
          font-size: 11px;
          color: var(--neon-blue);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
        }

        .form-label::before {
          content: '> ';
          color: var(--neon-red);
        }

        .form-input {
          padding: 14px 16px;
          background: rgba(0, 136, 255, 0.05);
          border: 1px solid rgba(0, 136, 255, 0.3);
          color: #fff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          outline: none;
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .form-input:focus {
          background: rgba(0, 136, 255, 0.1);
          border-color: var(--neon-blue);
          box-shadow:
            0 0 10px rgba(0, 136, 255, 0.3),
            inset 0 0 10px rgba(0, 136, 255, 0.05);
        }

        .form-input:hover:not(:focus) {
          border-color: rgba(0, 136, 255, 0.5);
        }

        .submit-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 18px 24px;
          background: rgba(0, 136, 255, 0.05);
          color: var(--neon-blue);
          border: 2px solid var(--neon-blue);
          font-family: 'JetBrains Mono', monospace;
          font-size: 15px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          margin-top: 8px;
        }

        .submit-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: radial-gradient(circle, rgba(0, 136, 255, 0.3), transparent);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }

        .submit-btn:hover::before {
          width: 300px;
          height: 300px;
        }

        .submit-btn:hover {
          background: rgba(0, 136, 255, 0.15);
          box-shadow:
            0 0 20px rgba(0, 136, 255, 0.4),
            inset 0 0 20px rgba(0, 136, 255, 0.1);
          transform: translateY(-2px);
          border-color: var(--neon-green);
          color: var(--neon-green);
        }

        .submit-btn:active {
          transform: translateY(0);
        }

        .toggle-mode {
          text-align: center;
          margin-top: 16px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .toggle-link {
          color: var(--neon-red);
          text-decoration: none;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          border-bottom: 1px solid transparent;
        }

        .toggle-link:hover {
          color: var(--neon-blue);
          border-bottom-color: var(--neon-blue);
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
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 18px 24px;
          background: rgba(0, 136, 255, 0.05);
          color: var(--neon-blue);
          border: 2px solid var(--neon-blue);
          font-family: 'JetBrains Mono', monospace;
          font-size: 15px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }

        .google-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: radial-gradient(circle, rgba(0, 136, 255, 0.3), transparent);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }

        .google-btn:hover::before {
          width: 300px;
          height: 300px;
        }

        .google-btn:hover {
          background: rgba(0, 136, 255, 0.15);
          box-shadow:
            0 0 20px rgba(0, 136, 255, 0.4),
            inset 0 0 20px rgba(0, 136, 255, 0.1);
          transform: translateY(-2px);
          border-color: var(--neon-green);
          color: var(--neon-green);
        }

        .google-btn:active {
          transform: translateY(0);
        }

        .google-icon-wrapper {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }

        .google-icon {
          width: 20px;
          height: 20px;
          filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
        }

        .btn-text {
          position: relative;
          z-index: 1;
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
              <div class="logo">ALPHALABS</div>
              <div class="subtitle">Trading Terminal</div>

              <div class="prompt-line">
                Initialize authentication protocol<span class="cursor-blink"></span>
              </div>

              <!-- Error Message Area -->
              <div id="errorMessage" class="error-message"></div>

              <!-- Tab Navigation -->
              <div class="tab-navigation">
                <button class="tab-btn active" data-tab="manual">Manual Login</button>
                <button class="tab-btn" data-tab="oauth">Google OAuth</button>
              </div>

              <!-- Manual Login Tab -->
              <div id="manualTab" class="tab-content active">
                <form id="authForm" class="auth-form" onsubmit="handleFormSubmit(event)">
                  <div class="form-group">
                    <label class="form-label" for="email">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      class="form-input"
                      placeholder="user@alphalabs.io"
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="password">Password</label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      class="form-input"
                      placeholder="Enter secure password"
                      required
                      minlength="8"
                    />
                  </div>

                  <div id="confirmPasswordGroup" class="form-group confirm-password-group">
                    <label class="form-label" for="confirmPassword">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      class="form-input"
                      placeholder="Re-enter password"
                    />
                  </div>

                  <button type="submit" class="submit-btn">
                    <span class="btn-text" id="submitBtnText">[ LOGIN ]</span>
                  </button>

                  <div class="toggle-mode">
                    <span id="modeText">Don't have an account?</span>
                    <a class="toggle-link" id="toggleModeLink" onclick="toggleAuthMode(event)">Register</a>
                  </div>
                </form>
              </div>

              <!-- Google OAuth Tab -->
              <div id="oauthTab" class="tab-content">
                <a href="/auth/google" class="google-btn">
                  <div class="google-icon-wrapper">
                    <svg class="google-icon" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <span class="btn-text">Connect via Google OAuth</span>
                </a>

                <div class="info-panel">
                  <div class="info-title">OAuth Security</div>
                  <div class="info-text">
                    Encrypted authentication via Google OAuth 2.0<br/>
                    New accounts auto-generated on first authentication<br/>
                    Session tokens secured with AES-256 encryption
                  </div>
                </div>
              </div>

              <div class="status-bar">
                <div class="status-item">
                  <div class="status-indicator"></div>
                  <span>SSL Active</span>
                </div>
                <div class="status-item">
                  <div class="status-indicator"></div>
                  <span>Auth Ready</span>
                </div>
                <div class="status-item">
                  <div class="status-indicator"></div>
                  <span>Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Tab Switching
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Remove active class from all tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            btn.classList.add('active');
            document.getElementById(targetTab + 'Tab').classList.add('active');
          });
        });

        // Toggle between login and register mode
        let isRegisterMode = false;

        function toggleAuthMode(event) {
          event.preventDefault();
          isRegisterMode = !isRegisterMode;

          const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
          const submitBtnText = document.getElementById('submitBtnText');
          const modeText = document.getElementById('modeText');
          const toggleLink = document.getElementById('toggleModeLink');
          const confirmPasswordInput = document.getElementById('confirmPassword');

          if (isRegisterMode) {
            confirmPasswordGroup.classList.add('show');
            submitBtnText.textContent = '[ REGISTER ]';
            modeText.textContent = 'Already have an account?';
            toggleLink.textContent = 'Login';
            confirmPasswordInput.required = true;
          } else {
            confirmPasswordGroup.classList.remove('show');
            submitBtnText.textContent = '[ LOGIN ]';
            modeText.textContent = "Don't have an account?";
            toggleLink.textContent = 'Register';
            confirmPasswordInput.required = false;
          }

          // Clear error message when switching modes
          hideError();
        }

        // Form submission handler
        function handleFormSubmit(event) {
          event.preventDefault();
          hideError();

          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          const confirmPassword = document.getElementById('confirmPassword').value;

          // Validation
          if (isRegisterMode) {
            if (password !== confirmPassword) {
              showError('Passwords do not match. Please try again.');
              return;
            }
            if (password.length < 8) {
              showError('Password must be at least 8 characters long.');
              return;
            }
          }

          // Create form and submit to backend
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = isRegisterMode ? '/auth/register' : '/auth/login';

          const emailInput = document.createElement('input');
          emailInput.type = 'hidden';
          emailInput.name = 'email';
          emailInput.value = email;
          form.appendChild(emailInput);

          const passwordInput = document.createElement('input');
          passwordInput.type = 'hidden';
          passwordInput.name = 'password';
          passwordInput.value = password;
          form.appendChild(passwordInput);

          if (isRegisterMode) {
            const confirmPasswordInput = document.createElement('input');
            confirmPasswordInput.type = 'hidden';
            confirmPasswordInput.name = 'confirmPassword';
            confirmPasswordInput.value = confirmPassword;
            form.appendChild(confirmPasswordInput);
          }

          document.body.appendChild(form);
          form.submit();
        }

        function showError(message) {
          const errorEl = document.getElementById('errorMessage');
          errorEl.textContent = message;
          errorEl.classList.add('show');
        }

        function hideError() {
          const errorEl = document.getElementById('errorMessage');
          errorEl.classList.remove('show');
        }

        // Display server error message if present
        const serverError = '${errorMsg.replace(/'/g, "\\'")}';
        if (serverError) {
          showError(serverError);
        }

        // Shader Animation
        const container = document.getElementById('shader-bg');
        const vertexShader = \`
          void main() {
            gl_Position = vec4( position, 1.0 );
          }
        \`;
        const fragmentShader = \`
          #define TWO_PI 6.2831853072
          #define PI 3.14159265359
          precision highp float;
          uniform vec2 resolution;
          uniform float time;
          void main(void) {
            vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
            float t = time*0.05;
            float lineWidth = 0.002;
            vec3 color = vec3(0.0);
            for(int j = 0; j < 3; j++){
              for(int i=0; i < 5; i++){
                color[j] += lineWidth*float(i*i) / abs(fract(t - 0.01*float(j)+float(i)*0.01)*5.0 - length(uv) + mod(uv.x+uv.y, 0.2));
              }
            }
            gl_FragColor = vec4(color[0],color[1],color[2],1.0);
          }
        \`;
        const camera = new THREE.Camera();
        camera.position.z = 1;
        const scene = new THREE.Scene();
        const geometry = new THREE.PlaneGeometry(2, 2);
        const uniforms = {
          time: { type: "f", value: 1.0 },
          resolution: { type: "v2", value: new THREE.Vector2() }
        };
        const material = new THREE.ShaderMaterial({
          uniforms: uniforms,
          vertexShader: vertexShader,
          fragmentShader: fragmentShader
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        function onWindowResize() {
          const width = window.innerWidth;
          const height = window.innerHeight;
          renderer.setSize(width, height);
          uniforms.resolution.value.x = renderer.domElement.width;
          uniforms.resolution.value.y = renderer.domElement.height;
        }
        onWindowResize();
        window.addEventListener("resize", onWindowResize, false);
        function animate() {
          requestAnimationFrame(animate);
          uniforms.time.value += 0.05;
          renderer.render(scene, camera);
        }
        animate();
      </script>
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
      return res.redirect('/login?error=All fields are required');
    }

    if (password.length < 8) {
      return res.redirect('/login?error=Password must be at least 8 characters');
    }

    if (password !== confirmPassword) {
      return res.redirect('/login?error=Passwords do not match');
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.redirect('/login?error=Email already registered');
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
    res.redirect('/login?error=Registration failed. Please try again.');
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
 * Fetch latest speeches from all central banks or a specific bank
 */
app.get('/api/speeches', async (req, res) => {
  try {
    const { bank } = req.query;
    let speeches;

    if (bank) {
      speeches = await cbSpeechScraper.fetchSpeechesFromBank(bank.toUpperCase());
    } else {
      speeches = await cbSpeechScraper.fetchAllSpeeches();
    }

    res.json({
      success: true,
      count: speeches.length,
      data: speeches
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
 * GET /api/speeches/text
 * Fetch full text of a speech from its URL
 */
app.get('/api/speeches/text', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter is required'
      });
    }

    const text = await cbSpeechScraper.fetchSpeechFullText(url);

    res.json({
      success: true,
      data: { text, url }
    });
  } catch (err) {
    console.error('Speech text fetch error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch speech text',
      message: err.message
    });
  }
});

/**
 * POST /api/speeches/analyze
 * Fetch speech text and analyze it in one request
 */
app.post('/api/speeches/analyze', async (req, res) => {
  try {
    const { url, speaker, centralBank, bankCode, date, text } = req.body;

    let speechText = text;

    // If no text provided, try to fetch from URL
    if (!speechText && url) {
      speechText = await cbSpeechScraper.fetchSpeechFullText(url);
    }

    if (!speechText || speechText.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'Unable to fetch sufficient speech text for analysis'
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
        sourceUrl: url
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

app.post('/events', (req, res) => {
  const { title, country, datetime } = req.body || {};
  const trimmedTitle = (title || '').trim();
  const trimmedCountry = (country || '').trim().toUpperCase();
  const datetimeValue = (datetime || '').trim();

  if (!trimmedTitle || !trimmedCountry || !datetimeValue) {
    return res.redirect('/?message=' + encodeURIComponent('Please provide title, country, and date/time.'));
  }

  const date = new Date(datetimeValue);
  if (Number.isNaN(date.getTime())) {
    return res.redirect('/?message=' + encodeURIComponent('Invalid date/time supplied.'));
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  manualEvents.push({
    id,
    title: trimmedTitle,
    country: trimmedCountry.slice(0, 3),
    date: date.toISOString(),
  });

  // persist manual events
  saveJson('events.json', manualEvents);

  res.redirect('/?message=' + encodeURIComponent('Event added.'));
});

app.post('/events/delete', (req, res) => {
  const { id } = req.body || {};
  if (!id) {
    return res.redirect('/?message=' + encodeURIComponent('Missing event identifier.'));
  }
  const index = manualEvents.findIndex((event) => event.id === id);
  if (index >= 0) {
    manualEvents.splice(index, 1);
    // persist manual events after removal
    saveJson('events.json', manualEvents);
    res.redirect('/?message=' + encodeURIComponent('Event removed.'));
  } else {
    res.redirect('/?message=' + encodeURIComponent('Event not found.'));
  }
});

app.get('/todo-card.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'todo-card.jsx');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/journal.jsx', (req, res) => {
  const filePath = path.join(__dirname, 'journal.jsx');
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

/**
 * Journal API (calendar POV) - USER ISOLATED
 * ------------------------------------------------
 * GET  /api/journal?month=YYYY-MM  → entries for month (local time) for current user
 * POST /api/journal                 → { dateISO, title, note, pnl, mood, tags }
 * DELETE /api/journal/:id
 */
app.get('/api/journal', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.user.id;
  const monthParam = String(req.query.month || '').trim();
  let start, end;
  if (/^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map((v) => Number(v));
    start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    end = new Date(y, m, 0, 23, 59, 59, 999);
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  const userEntries = getJournalEntries(userId);
  const filtered = userEntries.filter((e) => {
    const d = new Date(e.date);
    return d >= start && d <= end;
  });
  filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(filtered);
});

app.post('/api/journal', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.user.id;
  const { dateISO, title, note, pnl, mood, tags, direction } = req.body || {};
  const parsedDate = new Date(String(dateISO || ''));
  const cleanTitle = String(title || '').trim();
  const cleanNote = String(note || '').trim();
  const cleanMood = String(mood || '').trim();
  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : String(tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
  const cleanPnl = Number(pnl);
  const cleanDirection = String(direction || '').toLowerCase() === 'short' ? 'short' : 'long';

  if (!cleanTitle || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Provide a valid dateISO and title.' });
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const entry = {
    id,
    userId,  // Add user ID to entry
    date: parsedDate.toISOString(),
    title: cleanTitle,
    note: cleanNote,
    pnl: Number.isFinite(cleanPnl) ? cleanPnl : null,
    mood: cleanMood || null,
    tags: cleanTags,
  };
  const userEntries = getJournalEntries(userId);
  userEntries.push(entry);
  saveJournalEntries(userId);
  res.json(entry);
});

app.put('/api/journal/:id', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.user.id;
  const { id } = req.params;
  const { title, note, pnl, mood, tags, direction } = req.body || {};
  const userEntries = getJournalEntries(userId);
  const idx = userEntries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found or access denied' });

  const cleanTitle = String(title || '').trim();
  const cleanNote = String(note || '').trim();
  const cleanMood = String(mood || '').trim();
  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : String(tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
  const cleanPnl = Number(pnl);

  if (!cleanTitle) {
    return res.status(400).json({ error: 'Title is required.' });
  }

  // Update entry
  userEntries[idx] = {
    ...userEntries[idx],
    title: cleanTitle,
    note: cleanNote,
    pnl: Number.isFinite(cleanPnl) ? cleanPnl : null,
    mood: cleanMood || null,
    tags: cleanTags,
    direction: cleanDirection,
    direction: cleanDirection,
  };

  saveJournalEntries(userId);
  res.json(userEntries[idx]);
});

app.delete('/api/journal/:id', (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.user.id;
  const { id } = req.params;
  const userEntries = getJournalEntries(userId);
  const idx = userEntries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found or access denied' });
  userEntries.splice(idx, 1);
  // persist journal entries after deletion
  saveJournalEntries(userId);
  res.json({ success: true });
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
  let strengthData = [];
  let manualUpcoming = [];
  let autoEvents = [];
  let combinedEvents = [];
  let errorMsg = '';
  const message = req.query.message ? String(req.query.message) : '';

  try {
    try {
      strengthData = await loadCurrencyStrength();
    } catch (currencyErr) {
      console.error('Currency strength loading failed:', currencyErr.message);
      errorMsg = `Currency Strength: ${currencyErr.message}`;
      strengthData = [];
    }
    const { manualUpcoming: manualList, autoEvents: autoList, combinedEvents: combined, autoError } =
      await gatherEvents();
    manualUpcoming = manualList;
    autoEvents = autoList;
    combinedEvents = combined;
    if (autoError) {
      errorMsg = errorMsg ? `${errorMsg}; ${autoError}` : autoError;
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

  const strengthRows = strengthData
    .map(
      (c, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${c.value >= 0 ? '+' : ''}${c.value.toFixed(2)}%</td>
        <td>
          <span class="momentum-badge ${c.trend}">
            ${c.momentum}
          </span>
        </td>
      </tr>`
    )
    .join('');

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
      </style>
    </head>
    <body>
      <header style="padding: 1.5rem 0; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div class="header-container" style="display: flex; align-items: center; justify-content: space-between; max-width: 1480px; margin: 0 auto; gap: 1.5rem; padding: 0 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #00D9FF, #8B5CF6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: #0B0F19; font-family: 'Inter Tight', sans-serif;">A</div>
            <div>
              <h1 style="font-size: 1.5rem; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; font-family: 'Inter Tight', sans-serif; margin: 0;">
                Alphalabs
              </h1>
              <p style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Data Trading</p>
            </div>
          </div>
          ${authControlsHtml}
        </div>
      </header>
      <main>
        ${message ? `<div class="message" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(message)}</div>` : ''}
        ${errorMsg ? `<div class="error" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(errorMsg)}</div>` : ''}

        <!-- BENTO LAYOUT: Event Countdown, Notes, Todo List -->
        <div class="bento-container" style="max-width: 1480px; margin: 0 auto 2rem;">
          <!-- Large Event Countdown Box (Full Width) -->
          <div class="bento-box bento-countdown">
            <h2 style="margin-bottom: 1rem; font-size: 1.5rem; font-weight: 700;">⏰ Next Event Countdown</h2>
            <div id="next-event-panel">
              ${nextEventPanel}
            </div>
          </div>

          <!-- Quick Notes & Warnings Box (Left) -->
          <div class="bento-box bento-notes">
            <div id="notes-root"></div>
          </div>

          <!-- Todo List Box (Right) -->
          <div class="bento-box bento-todos">
            <div id="todo-root"></div>
          </div>
        </div>

        <!-- Upcoming Events (Limited to 3) -->
        <section class="events-section" style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <h2 style="margin-bottom: 1rem;">Upcoming High Impact News</h2>
          <p style="margin-bottom: 1rem; font-size: 0.9rem; color: rgba(226, 232, 240, 0.75);">
            Currently tracking ${manualUpcoming.length} manual and ${autoEvents.length} automatic events.
          </p>
          <div class="events-preview">
            <div class="events-limited"></div>
          </div>
          <button id="toggle-events-btn" class="toggle-events-btn" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: rgba(37, 99, 235, 0.18); border: 1px solid rgba(37, 99, 235, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%;">
            Show All Events
          </button>
          <div id="events-expanded" style="display: none; margin-top: 1rem;">
            <div class="events-scroll" style="max-height: 400px; overflow-y: auto; padding: 0.5rem 0; margin-bottom: 1rem;">
              <div class="events-all"></div>
            </div>
          </div>
        </section>

        <!-- PERMANENT MANUAL EVENT FORM - ALWAYS VISIBLE -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem; padding: 1.5rem; border-radius: 16px; border: 2px solid rgba(99, 102, 241, 0.4); background: rgba(15, 23, 42, 0.85); box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2);">
          <form method="POST" action="/events" class="add-event" id="add-event-form">
            <h3 style="margin-bottom: 0.75rem; font-size: 1.25rem; color: rgb(129, 140, 248);">📝 Add Manual Event</h3>
            <div class="field-row two">
              <label>
                Title
                <input name="title" required placeholder="e.g. FOMC Press, GDP QoQ, CPI" />
              </label>
              <label>
                Country (e.g. USD)
                <input name="country" required maxlength="3" placeholder="USD / EUR / JPY" />
              </label>
            </div>
            <div class="field-row two">
              <label>
                Date
                <input id="event-date" type="date" required />
              </label>
              <label>
                Time
                <input id="event-time" type="time" step="60" required />
              </label>
            </div>
            <input id="event-datetime-hidden" type="hidden" name="datetime" />
            <div class="chips" id="dt-presets">
              <span class="chip" data-mins="30">+30m</span>
              <span class="chip" data-mins="60">+1h</span>
              <span class="chip" data-preset="tomorrow-9">Tomorrow 09:00</span>
              <span class="chip" data-preset="next-mon-830">Next Mon 08:30</span>
              <span class="chip" data-preset="market-open">Next Market Open</span>
            </div>
            <div class="tz-hint" id="tz-hint"></div>
            <button type="submit">Add Event</button>
          </form>
        </section>

        <!-- Currency Strength -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem; padding: 1.5rem; border-radius: 16px; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.7); box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2);">
          <h2>Currency Strength Meter</h2>
          <p style="font-size: 0.9rem; color: rgba(226, 232, 240, 0.75); margin-bottom: 1rem;">
            Based on 28 currency pairs • 7-Day Trend Analysis
          </p>
          <table>
            <thead>
              <tr><th>#</th><th>Currency</th><th>7D Change</th><th>Momentum</th></tr>
            </thead>
            <tbody>
              ${strengthRows || '<tr><td colspan="4">No data available.</td></tr>'}
            </tbody>
          </table>
        </section>

        <!-- Financial News Feed -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div id="financial-news-root"></div>
        </section>

        <!-- CB Speech AI Analysis -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div id="cb-speech-root"></div>
        </section>

        <!-- Trading Journal (Below Fold) -->
        <section class="full" style="max-width: 1480px; margin: 0 auto;">
          <h2 style="margin-bottom: 1rem;">Trading Journal (Calendar)</h2>
          <div id="journal-root"></div>
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

        function initEventPresets() {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
          const tzHint = document.getElementById('tz-hint');
          if (tzHint) tzHint.textContent = 'Times in ' + tz;
          const dateInput = document.getElementById('event-date');
          const timeInput = document.getElementById('event-time');
          const hiddenInput = document.getElementById('event-datetime-hidden');
          const presetRow = document.getElementById('dt-presets');
          if (!dateInput || !timeInput) return;

          function syncHidden() {
            if (!dateInput.value || !timeInput.value) return;
            const parts = dateInput.value.split('-');
            const tparts = timeInput.value.split(':');
            if (parts.length !== 3 || tparts.length < 2) return;
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(tparts[0]), Number(tparts[1]), 0, 0);
            if (hiddenInput) hiddenInput.value = d.toISOString();
          }

          dateInput.addEventListener('input', syncHidden);
          timeInput.addEventListener('input', syncHidden);

          // Initialize defaults: today, next rounded hour
          (function initDefaults() {
            const now = new Date();
            const dstr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
            dateInput.value = dstr;
            const mins = now.getMinutes();
            const nextHour = new Date(now);
            if (mins > 30) { nextHour.setHours(now.getHours() + 1, 0, 0, 0); } else { nextHour.setMinutes(30, 0, 0); }
            timeInput.value = pad2(nextHour.getHours()) + ':' + pad2(nextHour.getMinutes());
            syncHidden();
          })();

          presetRow.addEventListener('click', (e) => {
            const el = e.target.closest('.chip');
            if (!el) return;
            const now = new Date();
            let target = null;
            if (el.dataset.mins) {
              target = new Date(now.getTime() + Number(el.dataset.mins) * 60000);
            } else if (el.dataset.preset === 'tomorrow-9') {
              target = new Date(now);
              target.setDate(now.getDate() + 1);
              target.setHours(9, 0, 0, 0);
            } else if (el.dataset.preset === 'next-mon-830') {
              target = computeNextMonday(now);
              target.setHours(8, 30, 0, 0);
            } else if (el.dataset.preset === 'market-open') {
              target = nextMarketOpen(now);
            }
            if (target) {
              const dstr = target.getFullYear() + '-' + pad2(target.getMonth() + 1) + '-' + pad2(target.getDate());
              const tstr = pad2(target.getHours()) + ':' + pad2(target.getMinutes());
              dateInput.value = dstr;
              timeInput.value = tstr;
              dateInput.dispatchEvent(new Event('input', { bubbles: true }));
              timeInput.dispatchEvent(new Event('input', { bubbles: true }));
              syncHidden();
            }
          });

          const form = document.getElementById('add-event-form');
          if (form) {
            form.addEventListener('submit', function(){
              syncHidden();
            });
          }
        }

        initEventPresets();

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
  <script type="text/babel" data-presets="env,react" src="/journal.jsx"></script>
  <script type="text/babel" data-presets="env,react" src="/financial-news.jsx"></script>
  <script type="text/babel" data-presets="env,react" src="/cb-speech-analysis.jsx"></script>
      <script type="text/babel" data-presets="env,react">
        const root = ReactDOM.createRoot(document.getElementById('todo-root'));
        root.render(React.createElement(TodoCard));
        const nroot = ReactDOM.createRoot(document.getElementById('notes-root'));
        nroot.render(React.createElement(QuickNotes));
        const jroot = ReactDOM.createRoot(document.getElementById('journal-root'));
        jroot.render(React.createElement(JournalCalendar));
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
  path.join(__dirname, 'journal.jsx'),
  path.join(__dirname, 'quick-notes.jsx'),
  path.join(__dirname, 'animated-title.jsx'),
  path.join(__dirname, 'financial-news.jsx'),
  path.join(__dirname, 'cb-speech-analysis.jsx'),
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


