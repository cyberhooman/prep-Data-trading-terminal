/**
 * Alphalabs Data Trading Web Server
 * ------------------------------------------------
 * Serves a web dashboard on http://localhost:3000 that shows:
 *   - Current currency strength snapshot.
 *   - Upcoming Forex Factory high-impact events with live countdown timers.
 *
 * The timers flash and play a louder tick during the final 3 minutes before an event,
 * and announce when an event starts.
 */

const express = require('express');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const compression = require('compression');

const PORT = process.env.PORT || 3000;
const FA_ECON_CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const MARKETMILK_API = 'https://marketmilk.babypips.com/api';
const FOREX_LIST_ID = 'fxcm:forex';
const DEFAULT_PERIOD = 'ONE_DAY';
const DEFAULT_STREAM = 'REAL_TIME';
const CALENDAR_CACHE_TTL = 60 * 60 * 1000 + 30 * 1000; // roughly one hour between refreshes
const CALENDAR_RATE_LIMIT_DELAY = 5 * 60 * 1000; // wait 5 minutes after a 429 before retrying

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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save', filename, err);
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

  try {
    console.log('Fetching calendar data...');
    const data = await fetchJson(FA_ECON_CAL_URL, {
      headers: {
        'User-Agent': 'MarketCountdownWeb/1.0',
        'Accept': 'application/json',
      }
    });
    
    if (!Array.isArray(data)) {
      console.error('Invalid calendar data format:', data);
      return [];
    }

    // Update cache
    calendarCache.records = data;
    calendarCache.timestamp = now;
    calendarCache.nextAllowed = now + CALENDAR_CACHE_TTL;

    return convertCalendarRecords(data);
  } catch (err) {
    console.error('Calendar fetch error:', err);
    if (Array.isArray(calendarCache.records)) {
      console.log('Using cached records');
      return convertCalendarRecords(calendarCache.records);
    }
    return [];
  }
}

/**
 * Calculate currency strength based on 24-hour price changes
 * Uses the free Frankfurter API (based on ECB data)
 */
async function loadCurrencyStrength() {
  const now = Date.now();

  // Return cached data if still fresh
  if (currencyStrengthCache.data && (now - currencyStrengthCache.timestamp) < currencyStrengthCache.ttl) {
    console.log('Using cached currency strength data');
    return currencyStrengthCache.data;
  }

  try {
    console.log('Fetching fresh currency strength data from Frankfurter API');

    // Get current rates
    const currentRatesUrl = 'https://api.frankfurter.app/latest?from=USD';
    const currentData = await fetchJson(currentRatesUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Alphalabs-Trading-App' }
    });

    // Get rates from 24 hours ago
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().split('T')[0];
    const historicalRatesUrl = `https://api.frankfurter.app/${dateStr}?from=USD`;
    const historicalData = await fetchJson(historicalRatesUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Alphalabs-Trading-App' }
    });

    if (!currentData?.rates || !historicalData?.rates) {
      throw new Error('Invalid response from Frankfurter API');
    }

    // Define major currencies to track
    const majorCurrencies = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USD'];

    const strengthData = [];

    // Calculate strength for each currency (except USD which is the base)
    for (const currency of majorCurrencies) {
      if (currency === 'USD') {
        // For USD, we need to calculate based on how other currencies performed
        // Average the inverse changes of all other currencies
        let totalChange = 0;
        let count = 0;

        for (const otherCurrency of majorCurrencies) {
          if (otherCurrency === 'USD') continue;

          const currentRate = currentData.rates[otherCurrency];
          const historicalRate = historicalData.rates[otherCurrency];

          if (currentRate && historicalRate) {
            // If rate increased, USD weakened (takes more of that currency to buy 1 USD)
            // So we invert: -(changePercent) = USD strength
            const changePercent = ((currentRate - historicalRate) / historicalRate) * 100;
            totalChange -= changePercent; // Invert the change
            count++;
          }
        }

        const avgChange = count > 0 ? totalChange / count : 0;

        strengthData.push({
          id: 'USD',
          name: 'USD',
          title: 'U.S. Dollar',
          value: avgChange,
        });
      } else {
        const currentRate = currentData.rates[currency];
        const historicalRate = historicalData.rates[currency];

        if (currentRate && historicalRate) {
          // Calculate percentage change
          // If rate increased (e.g., 0.85 -> 0.90), currency weakened (takes more to buy 1 USD)
          // So we invert: -(changePercent) = currency strength
          const changePercent = ((currentRate - historicalRate) / historicalRate) * 100;
          const strength = -changePercent; // Invert: negative change = stronger

          strengthData.push({
            id: currency,
            name: currency,
            title: getCurrencyName(currency),
            value: strength,
          });
        }
      }
    }

    // Sort by strength (highest to lowest)
    strengthData.sort((a, b) => b.value - a.value);

    if (strengthData.length === 0) {
      throw new Error('No currency data available');
    }

    console.log('Successfully calculated currency strength for', strengthData.length, 'currencies');

    // Cache the result
    currencyStrengthCache.data = strengthData;
    currencyStrengthCache.timestamp = now;

    return strengthData;
  } catch (err) {
    console.error('Failed to load currency strength:', err.message);
    // Return cached data if available, otherwise throw error
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
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

ensureDataDir();

let manualEvents = loadJson('events.json', []).map(event => ({
  ...event,
  date: new Date(event.date).toISOString()
}));

const todoItems = loadJson('todos.json', []);
const journalEntries = loadJson('journal.json', []);
const quickNotes = loadJson('notes.json', []);

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

app.use(express.json());

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

/**
 * Journal API (calendar POV)
 * ------------------------------------------------
 * GET  /api/journal?month=YYYY-MM  → entries for month (local time)
 * POST /api/journal                 → { dateISO, title, note, pnl, mood, tags }
 * DELETE /api/journal/:id
 */
app.get('/api/journal', (req, res) => {
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
  const entries = journalEntries
    .filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(entries);
});

app.post('/api/journal', (req, res) => {
  const { dateISO, title, note, pnl, mood, tags } = req.body || {};
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

  if (!cleanTitle || Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Provide a valid dateISO and title.' });
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const entry = {
    id,
    date: parsedDate.toISOString(),
    title: cleanTitle,
    note: cleanNote,
    pnl: Number.isFinite(cleanPnl) ? cleanPnl : null,
    mood: cleanMood || null,
    tags: cleanTags,
  };
  journalEntries.push(entry);
  // persist journal entries
  saveJson('journal.json', journalEntries);
  res.json(entry);
});

app.delete('/api/journal/:id', (req, res) => {
  const { id } = req.params;
  const idx = journalEntries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  journalEntries.splice(idx, 1);
  // persist journal entries after deletion
  saveJson('journal.json', journalEntries);
  res.json({ success: true });
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
  saveJson('todos.json', todoItems);
  res.json({ id: newItem.id, text: newItem.text, done: newItem.completed });
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
  todoItems.splice(index, 1);
  // persist todos after deletion
  saveJson('todos.json', todoItems);
  res.json({ success: true });
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
      </tr>`
    )
    .join('');

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
      <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js" defer></script>
      <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" defer></script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js" defer></script>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Roboto+Mono:wght@400;600;700&display=swap" rel="stylesheet">
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="/public/styles.css">
    </head>
    <body>
      <header>
        <div id="animated-title-root" style="position: relative; height: 3.2rem; width: 100%;"></div>
        <p>Live currency strength snapshot and high-impact event timers</p>
      </header>
      <main>
        ${message ? `<div class="message" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(message)}</div>` : ''}
        ${errorMsg ? `<div class="error" style="max-width: 1480px; margin: 0 auto 1rem;">${escapeHtml(errorMsg)}</div>` : ''}

        <!-- Large Featured Countdown at Top -->
        <section class="next-countdown-featured" style="max-width: 1480px; margin: 0 auto 1.5rem auto;">
          <div class="next-event-wrapper">
            <h2 style="margin-bottom: 1rem; font-size: 1.5rem;">Next Event Countdown</h2>
            <div id="next-event-panel">
              ${nextEventPanel}
            </div>
          </div>
        </section>

        <!-- Todo List and Quick Notes Side by Side -->
        <div class="bento-grid" style="max-width: 1480px; margin: 0 auto 1.5rem;">
          <div class="col-left">
            <div id="todo-root"></div>
          </div>
          <div class="col-right">
            <div id="notes-root"></div>
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
            Show All Events & Add Event
          </button>
          <div id="events-expanded" style="display: none; margin-top: 1rem;">
            <div class="events-scroll" style="max-height: 400px; overflow-y: auto; padding: 0.5rem 0; margin-bottom: 1rem;">
              <div class="events-all"></div>
            </div>
            <form method="POST" action="/events" class="add-event" id="add-event-form">
              <h3 style="margin-bottom: 0.75rem;">Add Event</h3>
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
          </div>
        </section>

        <!-- Currency Strength -->
        <section style="max-width: 1480px; margin: 0 auto 1.5rem; padding: 1.5rem; border-radius: 16px; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.7); box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2);">
          <h2>Currency Strength (24H Change)</h2>
          <p style="font-size: 0.9rem; color: rgba(226, 232, 240, 0.75); margin-bottom: 1rem;">Source: European Central Bank (via Frankfurter API) • Major Currencies • 24-Hour Change</p>
          <table>
            <thead>
              <tr><th>#</th><th>Currency</th><th>Change</th></tr>
            </thead>
            <tbody>
              ${strengthRows || '<tr><td colspan="3">No data available.</td></tr>'}
            </tbody>
          </table>
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

        // Toggle events expand/collapse
        function setupEventsToggle() {
          const toggleBtn = document.getElementById('toggle-events-btn');
          const expandedSection = document.getElementById('events-expanded');
          let isExpanded = false;

          if (toggleBtn && expandedSection) {
            toggleBtn.addEventListener('click', () => {
              isExpanded = !isExpanded;
              expandedSection.style.display = isExpanded ? 'block' : 'none';
              toggleBtn.textContent = isExpanded ? 'Hide Events & Form' : 'Show All Events & Add Event';
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
      <script type="text/babel" data-presets="env,react">
        const root = ReactDOM.createRoot(document.getElementById('todo-root'));
        root.render(React.createElement(TodoCard));
        const nroot = ReactDOM.createRoot(document.getElementById('notes-root'));
        nroot.render(React.createElement(QuickNotes));
        const jroot = ReactDOM.createRoot(document.getElementById('journal-root'));
        jroot.render(React.createElement(JournalCalendar));
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

const server = app.listen(PORT, () => {
  console.log(`Alphalabs data trading server running on http://localhost:${PORT}`);
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

// Watch JSX files for changes
const jsxFiles = [
  path.join(__dirname, 'todo-card.jsx'),
  path.join(__dirname, 'journal.jsx'),
  path.join(__dirname, 'quick-notes.jsx'),
  path.join(__dirname, 'animated-title.jsx'),
];

jsxFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.watch(file, { persistent: true }, (eventType) => {
      if (eventType === 'change') {
        console.log(`File changed: ${path.basename(file)}`);
        notifyReload();
      }
    });
    console.log(`Watching: ${path.basename(file)}`);
  }
});


