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

/**
 * Load high-impact Forex Factory events.
 * @returns {Promise<Array<{title:string,country:string,date:Date,impact:string,rawDate:string}>>}
 */
function convertCalendarRecords(records) {
   return records
      .filter((item) => item.impact === 'High')
      .map((item) => {
         const eventDate = new Date(item.date);
         return {
            id: `auto-${item.date}-${item.title}`,
            title: item.title,
            country: item.country,
            impact: item.impact,
            date: eventDate,
            source: 'auto',
         };
      })
      .filter((item) => item.date.getTime() > Date.now())
      .sort((a, b) => a.date - b.date);
}

async function loadHighImpactEvents() {
   const now = Date.now();
   const cacheFresh = calendarCache.records && now - calendarCache.timestamp < CALENDAR_CACHE_TTL;
   const waitRemaining = calendarCache.nextAllowed - now;

   if (cacheFresh) {
      return convertCalendarRecords(calendarCache.records);
   }

   if (waitRemaining > 0) {
      if (calendarCache.records) {
         return convertCalendarRecords(calendarCache.records);
      }
      const minutes = Math.ceil(waitRemaining / 60000);
      throw new Error(`High-impact calendar temporarily unavailable. Please try again in about ${minutes} minute(s).`);
   }

   if (!cacheFresh) {
      try {
         const data = await fetchJson(FA_ECON_CAL_URL, {
            headers: {
               'User-Agent': 'MarketCountdownWeb/1.0',
               'Accept': 'application/json',
            },
         });
         const records = Array.isArray(data) ? data : Array.isArray(data?.value) ? data.value : null;
         if (!records) {
            throw new Error('Unexpected calendar structure.');
         }
         calendarCache.records = records;
         calendarCache.timestamp = Date.now();
         calendarCache.nextAllowed = calendarCache.timestamp + CALENDAR_CACHE_TTL;
      } catch (err) {
         const rateLimited =
            /429|rate limited|request denied|too many/i.test(err.message) ||
            err.message.includes('<!DOCTYPE html>');
         if (calendarCache.records) {
            console.warn(`Calendar fetch failed (${err.message}). Falling back to cached copy.`);
            if (rateLimited) {
               calendarCache.nextAllowed = Date.now() + CALENDAR_RATE_LIMIT_DELAY;
            } else {
               calendarCache.timestamp = Date.now();
               calendarCache.nextAllowed = calendarCache.timestamp + CALENDAR_CACHE_TTL;
            }
         } else {
            if (rateLimited) {
               calendarCache.nextAllowed = Date.now() + CALENDAR_RATE_LIMIT_DELAY;
               throw new Error('High-impact calendar is temporarily rate limited. Please try again in about 5 minutes.');
            }
            throw new Error('Unable to download the high-impact calendar feed.');
         }
      }
   }

   const records = calendarCache.records || [];
   return convertCalendarRecords(records);
}

/**
 * Load MarketMilk currency strength (1 day change).
 * @returns {Promise<Array<{id:string,name:string,title:string,value:number}>>}
 */
async function loadCurrencyStrength() {
   const symbolsQuery = {
      query: `
         query ($listId: ID!) {
            symbols(listId: $listId) {
               id
               name
               title
            }
         }
      `,
      variables: { listId: FOREX_LIST_ID },
   };

   const chartQuery = {
      query: `
         query ($listId: ID!, $period: Period!, $stream: Stream!) {
            watchlistChart(
               listId: $listId,
               indicators: [{ name: "change", fields: ["pct"] }],
               normalize: false,
               period: $period,
               streamId: $stream
            ) {
               values {
                  symbolId
                  values
               }
            }
         }
      `,
      variables: { listId: FOREX_LIST_ID, period: DEFAULT_PERIOD, stream: DEFAULT_STREAM },
   };

   const [symbolsResponse, chartResponse] = await Promise.all([
      fetchJson(MARKETMILK_API, {
         method: 'POST',
         headers: {
            'User-Agent': 'MarketCountdownWeb/1.0',
            'Content-Type': 'application/json',
         },
         body: JSON.stringify(symbolsQuery),
      }),
      fetchJson(MARKETMILK_API, {
         method: 'POST',
         headers: {
            'User-Agent': 'MarketCountdownWeb/1.0',
            'Content-Type': 'application/json',
         },
         body: JSON.stringify(chartQuery),
      }),
   ]);

   const symbols = symbolsResponse?.data?.symbols ?? [];
   const timeline = chartResponse?.data?.watchlistChart?.values ?? [];
   if (!Array.isArray(symbols) || symbols.length === 0 || !Array.isArray(timeline)) {
      throw new Error('Unable to load currency strength data.');
   }

   const latestSnapshot = timeline[timeline.length - 1] || [];
   const valueMap = new Map();
   latestSnapshot.forEach((entry) => {
      const [, value] = entry.values || [];
      valueMap.set(entry.symbolId, value);
   });

   return symbols
      .map((symbol) => ({
         id: symbol.id,
         name: symbol.name,
         title: symbol.title,
         value: valueMap.get(symbol.id),
      }))
      .filter((item) => typeof item.value === 'number')
      .sort((a, b) => b.value - a.value);
}

/**
 * Escape HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/**
 * Format event time for display.
 * @param {Date} date
 * @returns {string}
 */
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
// Normalize manual events so `date` is always a Date object.
const manualEvents = loadJson('events.json', []).map((ev) => {
   try {
      if (!ev) return ev;
      // If date is already a Date, keep it; otherwise parse ISO/string to Date
      const parsed = ev.date instanceof Date ? ev.date : new Date(ev.date);
      return { ...ev, date: parsed };
   } catch (e) {
      // On parse error, leave as-is (will be filtered out later)
      return ev;
   }
});
const todoItems = loadJson('todos.json', []);
const journalEntries = loadJson('journal.json', []);

function getUpcomingEvents() {
   return manualEvents
      .filter((event) => event.date.getTime() > Date.now())
      .map((event) => ({ ...event, source: 'manual' }))
      .sort((a, b) => a.date - b.date);
}

async function gatherEvents() {
   const manualUpcoming = getUpcomingEvents();
   let autoEvents = [];
   let autoError = null;
   try {
      autoEvents = await loadHighImpactEvents();
   } catch (err) {
      autoError = err.message.replace(/<[^>]+>/g, '').trim();
   }
   const combinedEvents = [...manualUpcoming, ...autoEvents].sort((a, b) => a.date - b.date);
   return { manualUpcoming, autoEvents, combinedEvents, autoError };
}

const app = express();
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
      date,
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
   let errorMsg = null;
   const message = req.query.message ? String(req.query.message) : '';

   try {
      strengthData = await loadCurrencyStrength().catch((err) => {
         errorMsg = `Currency strength error: ${err.message}`;
         return [];
      });
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
      combinedEvents.map((event) => ({
         id: event.id,
         title: event.title,
         country: event.country,
         timestamp: event.date.getTime(),
         formatted: formatEventDate(event.date),
         source: event.source,
      })),
   );
   const nextEvent = combinedEvents[0] || null;
   const nextEventJson = JSON.stringify(
      nextEvent
         ? {
               id: nextEvent.id,
               title: nextEvent.title,
               country: nextEvent.country,
               timestamp: nextEvent.date.getTime(),
               formatted: formatEventDate(nextEvent.date),
               source: nextEvent.source,
            }
         : null,
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
            <div class="next-event-meta">Scheduled: ${escapeHtml(formatEventDate(nextEvent.date))}</div>
            <div class="countdown next-countdown" id="next-event-countdown">Loading...</div>
         </div>
      `
      : '<p class="next-empty">No upcoming events yet. Use the form below to add one.</p>';

   const todoListHtml =
      todoItems.length > 0
         ? todoItems
               .map((item) => {
                  const statusClass = item.completed ? 'todo-item done' : 'todo-item';
                  const buttonLabel = item.completed ? 'Mark Active' : 'Mark Done';
                  return `
                     <li class="${statusClass}">
                        <span class="todo-text">${escapeHtml(item.text)}</span>
                        <div class="todo-actions">
                           <form method="POST" action="/todos/toggle">
                              <input type="hidden" name="id" value="${item.id}" />
                              <button type="submit" class="secondary">${buttonLabel}</button>
                           </form>
                           <form method="POST" action="/todos/delete">
                              <input type="hidden" name="id" value="${item.id}" />
                              <button type="submit" class="danger">Remove</button>
                           </form>
                        </div>
                     </li>
                  `;
               })
               .join('')
         : '<li class="todo-empty">No tasks yet. Capture your next trading actions here.</li>';

   const strengthRows = strengthData
      .map((item, index) => {
         const rank = String(index + 1).padStart(2, ' ');
         const trendSymbol = item.value > 0 ? '&#9650;' : item.value < 0 ? '&#9660;' : '&#8226;';
         const pct = (item.value * 100).toFixed(2);
         const label = `${item.name} â€“ ${item.title}`;
         return `
            <tr>
               <td>${rank}</td>
               <td>${escapeHtml(label)}</td>
               <td class="${item.value > 0 ? 'pos' : item.value < 0 ? 'neg' : 'flat'}">${trendSymbol} ${pct}%</td>
            </tr>
         `;
      })
      .join('');

   const html = `<!DOCTYPE html>
   <html lang="en">
      <head>
         <meta charset="UTF-8" />
         <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Alphalabs Data Trading</title>
            <!-- Inline SVG favicon to avoid 404s -->
            <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' fill='%233b82f6'/><text x='8' y='11' font-size='10' text-anchor='middle' fill='white' font-family='Arial'>A</text></svg>" />

            <!-- Wallet conflict guard: detect read-only window.ethereum injected by another extension -->
            <script>
               (function(){
                  try {
                     var desc = Object.getOwnPropertyDescriptor(window, 'ethereum');
                     if (desc) {
                        var readOnly = (!!desc.get && !desc.set) || (desc.writable === false && !desc.configurable);
                        if (readOnly) {
                           console.warn('Wallet conflict detected: window.ethereum is read-only. Another wallet extension is present.');
                           window.__WALLET_CONFLICT__ = true;
                        } else {
                           window.__WALLET_CONFLICT__ = false;
                        }
                     } else {
                        window.__WALLET_CONFLICT__ = false;
                     }
                  } catch (e) {
                     try { console.error('Wallet guard error', e); } catch (_) {}
                     window.__WALLET_CONFLICT__ = false;
                  }
               })();
            </script>

         <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
         <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
         <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
         <script src="https://cdn.tailwindcss.com"></script>
         <style>
            body {
               font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
               margin: 0;
               padding: 0;
               background: #0c1117;
               color: #f8fafc;
            }
            /* ... rest of styles omitted for brevity in backup ... */
         </style>
      </head>
      <body>
         <!-- Backup of full index.js content available in repository -->
      </body>
   </html>`;

   // Save a copy of the original file for rollback purposes
   try {
      fs.writeFileSync(path.join(__dirname, 'index.js.original-backup-from-restore.txt'), html, 'utf8');
   } catch (e) {}

