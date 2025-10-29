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

const manualEvents = [];
const todoItems = [];

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
    res.redirect('/?message=' + encodeURIComponent('Event removed.'));
  } else {
    res.redirect('/?message=' + encodeURIComponent('Event not found.'));
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
  res.redirect('/?message=' + encodeURIComponent('Task added.'));
});

app.post('/todos/toggle', (req, res) => {
  const { id } = req.body || {};
  const item = todoItems.find((todo) => todo.id === id);
  if (!item) {
    return res.redirect('/?message=' + encodeURIComponent('Task not found.'));
  }
  item.completed = !item.completed;
  res.redirect('/');
});

app.post('/todos/delete', (req, res) => {
  const { id } = req.body || {};
  const index = todoItems.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return res.redirect('/?message=' + encodeURIComponent('Task not found.'));
  }
  todoItems.splice(index, 1);
  res.redirect('/?message=' + encodeURIComponent('Task removed.'));
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
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          margin: 0;
          padding: 0;
          background: #0c1117;
          color: #f8fafc;
        }

        header {
          padding: 1.5rem;
          background: linear-gradient(135deg, #0f172a, #1e293b);
          box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.1);
        }

        h1, h2 {
          margin: 0 0 0.5rem;
        }

        main {
          padding: 1.5rem;
          display: grid;
          gap: 2rem;
        }

        section {
          background: rgba(148, 163, 184, 0.05);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        th, td {
          padding: 0.75rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
          text-align: left;
        }

        th {
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          color: rgba(226, 232, 240, 0.8);
        }

        tr:last-child td {
          border-bottom: none;
        }

        .pos { color: #10b981; }
        .neg { color: #f87171; }
        .flat { color: #e2e8f0; }

        .events {
          display: grid;
          gap: 1rem;
        }

        .event-card {
          display: grid;
          gap: 0.25rem;
          padding: 1rem;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.15);
          background: rgba(15, 23, 42, 0.6);
          position: relative;
          overflow: hidden;
        }

        .event-card.primary-card {
          border-color: rgba(59, 130, 246, 0.35);
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
        }

        .event-card::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.2), transparent 55%);
          opacity: 0;
          transition: opacity 0.4s ease;
        }

        .event-card.highlight::after {
          opacity: 1;
        }

        .event-title {
          font-weight: 600;
          font-size: 1.05rem;
        }

        .event-meta {
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.75);
        }

        .countdown {
          font-family: "SF Mono", "Roboto Mono", monospace;
          font-size: 1.4rem;
          margin-top: 0.5rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #38bdf8;
          transition: color 0.4s ease, transform 0.4s ease;
        }

        .countdown.urgent {
          color: #f97316;
          transform: scale(1.05);
        }

        .countdown.started {
          color: #22c55e;
        }

        footer {
          padding: 1rem 1.5rem;
          font-size: 0.8rem;
          color: rgba(148, 163, 184, 0.6);
          text-align: center;
        }

        .error {
          border: 1px solid rgba(248, 113, 113, 0.3);
          background: rgba(248, 113, 113, 0.08);
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          color: #fecaca;
        }

        form.add-event {
          display: grid;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        form.add-event label {
          display: flex;
          flex-direction: column;
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.8);
        }

        form.add-event input, form.add-event button {
          margin-top: 0.25rem;
        }

        input, button {
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          padding: 0.6rem 0.75rem;
          background: rgba(15, 23, 42, 0.7);
          color: inherit;
        }

        button {
          cursor: pointer;
          background: #2563eb;
          border-color: rgba(37, 99, 235, 0.6);
          font-weight: 600;
        }

        button:hover {
          background: #1d4ed8;
        }

        .delete-form {
          margin-top: 0.75rem;
        }

        .delete-form button {
          background: rgba(248, 113, 113, 0.15);
          border-color: rgba(248, 113, 113, 0.3);
        }

        .delete-form button:hover {
          background: rgba(248, 113, 113, 0.25);
        }

        .message {
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.12);
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          color: #bae6fd;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          font-size: 0.7rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-left: 0.5rem;
          padding: 0.15rem 0.4rem;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.2);
          color: #e2e8f0;
        }

        .badge.manual {
          background: rgba(59, 130, 246, 0.25);
          color: #bfdbfe;
        }

        .badge.auto {
          background: rgba(16, 185, 129, 0.25);
          color: #bbf7d0;
        }

        .next-event-wrapper {
          margin-top: 1.25rem;
          display: grid;
          gap: 0.75rem;
        }

        .next-event-wrapper h3 {
          margin: 0;
          font-size: 1rem;
          color: rgba(226, 232, 240, 0.85);
          letter-spacing: 0.02em;
        }

        .next-event-card {
          margin-top: 1rem;
          padding: 1.25rem;
          border-radius: 16px;
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.32), rgba(56, 189, 248, 0.18));
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
          display: grid;
          gap: 0.75rem;
          position: relative;
          overflow: hidden;
        }

        .next-event-card::after {
          content: '';
          position: absolute;
          inset: -40% auto auto -20%;
          width: 220px;
          height: 220px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.45), transparent 70%);
          opacity: 0.6;
          pointer-events: none;
          transform: translate3d(0, 0, 0);
        }

        .next-event-title {
          font-weight: 600;
          font-size: 1.05rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }

        .next-event-meta {
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.75);
        }

        @keyframes nextCountdownGlow {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 30px 45px rgba(59, 130, 246, 0.35);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 36px 70px rgba(14, 165, 233, 0.55);
          }
        }

        .next-countdown {
          font-family: "Roboto Mono", "SFMono-Regular", monospace;
          font-size: clamp(2.4rem, 6vw, 3.6rem);
          font-weight: 700;
          color: #f8fafc;
          padding: 1rem 1.75rem;
          border-radius: 1.2rem;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.55), rgba(56, 189, 248, 0.35));
          text-shadow: 0 0 16px rgba(59, 130, 246, 0.65);
          box-shadow: 0 30px 45px rgba(15, 23, 42, 0.5);
          transition: transform 0.6s ease, box-shadow 0.6s ease, color 0.4s ease;
          display: inline-flex;
          justify-content: center;
        }

        .next-countdown.urgent {
          color: #fde68a;
          animation: nextCountdownGlow 1.6s ease-in-out infinite;
          text-shadow: 0 0 20px rgba(253, 224, 71, 0.8);
          box-shadow: 0 40px 75px rgba(234, 179, 8, 0.48);
        }

        .next-empty {
          margin-top: 1rem;
          font-style: italic;
          color: rgba(226, 232, 240, 0.7);
        }

        .todo-section {
          display: grid;
          gap: 1rem;
        }

        form.add-todo {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        form.add-todo input[name="task"] {
          flex: 1 1 240px;
        }

        .todo-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.75rem;
        }

        .todo-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.55);
        }

        .todo-item.done {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.08);
        }

        .todo-item.done .todo-text {
          text-decoration: line-through;
          opacity: 0.75;
        }

        .todo-text {
          flex: 1;
        }

        .todo-actions {
          display: flex;
          gap: 0.5rem;
        }

        .todo-actions form {
          margin: 0;
        }

        .todo-empty {
          padding: 1rem;
          border-radius: 10px;
          border: 1px dashed rgba(148, 163, 184, 0.4);
          background: rgba(148, 163, 184, 0.08);
          text-align: center;
          font-style: italic;
          color: rgba(226, 232, 240, 0.75);
        }

        button.secondary {
          background: rgba(37, 99, 235, 0.18);
          border-color: rgba(37, 99, 235, 0.3);
        }

        button.secondary:hover {
          background: rgba(37, 99, 235, 0.26);
        }

        button.danger {
          background: rgba(248, 113, 113, 0.15);
          border-color: rgba(248, 113, 113, 0.3);
        }

        button.danger:hover {
          background: rgba(248, 113, 113, 0.24);
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Alphalabs Data Trading</h1>
        <p>Live currency strength snapshot and high-impact event timers</p>
      </header>
      <main>
        ${message ? `<div class="message">${escapeHtml(message)}</div>` : ''}
        ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ''}
        <section>
          <h2>Currency Strength (1D Change)</h2>
          <p>Source: Babypips â€¢ Watchlist: FXCM Forex â€¢ Period: 1 Day â€¢ Stream: Real-Time</p>
          <table>
            <thead>
              <tr><th>#</th><th>Currency</th><th>Change</th></tr>
            </thead>
            <tbody>
              ${strengthRows || '<tr><td colspan="3">No data available.</td></tr>'}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Upcoming High Impact News</h2>
          <p>
            Events are shown from two sources:
            <strong> automatic calendar</strong> (Forex Factory high-impact feed) and your
            <strong> manual entries</strong> using the form below. Manual items appear first.
            <br />
            Currently tracking ${manualUpcoming.length} manual and ${autoEvents.length} automatic events.
          </p>
          <div class="next-event-wrapper">
            <h3>Next Event Countdown</h3>
            <div id="next-event-panel">
              ${nextEventPanel}
            </div>
          </div>
          ${
            combinedEvents.length === 0
              ? '<p class="next-empty">No events yet. Use the form below to add the high impact releases you care about.</p>'
              : '<div class="events"></div>'
          }
          <form method="POST" action="/events" class="add-event">
            <h3>Add Event</h3>
            <label>
              Title
              <input name="title" required placeholder="Event title" />
            </label>
            <label>
              Country (e.g. USD)
              <input name="country" required maxlength="3" placeholder="Currency code" />
            </label>
            <label>
              Date & Time
              <input type="datetime-local" name="datetime" required />
            </label>
            <button type="submit">Add Event</button>
          </form>
        </section>
        <section class="todo-section">
          <h2>Trading To-Do List</h2>
          <p>Capture your trading prep and follow-up tasks in one place. Mark items done as you complete them.</p>
          <form method="POST" action="/todos" class="add-todo">
            <input name="task" required placeholder="Add a task (e.g. review USD news sentiment)" />
            <button type="submit">Add Task</button>
          </form>
          <ul class="todo-list">
            ${todoListHtml}
          </ul>
        </section>
      </main>
      <footer>
        Updated on demand â€¢ Times are shown in your local timezone â€¢ Final 3 minutes include an audible tick
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
          const container = document.querySelector('.events');
          if (!container) return;
          container.innerHTML = '';
          events.forEach((event) => container.appendChild(createEventCard(event)));
          const firstCard = container.firstElementChild;
          if (firstCard) {
            firstCard.classList.add('primary-card');
            firstCard.dataset.primary = 'true';
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
        updateCountdowns();
        updateNextEventCountdown();
        setInterval(() => {
          updateCountdowns();
          updateNextEventCountdown();
        }, 1000);
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
    </body>
  </html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  });

app.listen(PORT, () => {
  console.log(`Alphalabs data trading server running on http://localhost:${PORT}`);
});


