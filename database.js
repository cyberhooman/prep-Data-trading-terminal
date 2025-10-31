/**
 * SQLite Database Module - Optimized for Performance
 * ------------------------------------------------
 * - Single connection with WAL mode for concurrent reads
 * - Prepared statements for faster queries
 * - Transaction batching for bulk operations
 * - Automatic cleanup of old data
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'trading.db');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database with optimized settings
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // Faster writes, still safe
db.pragma('cache_size = -64000'); // 64MB cache
db.pragma('temp_store = MEMORY'); // Store temp tables in memory
db.pragma('mmap_size = 30000000000'); // Memory-mapped I/O

// Create tables with proper indexes
db.exec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    note TEXT,
    pnl REAL,
    mood TEXT,
    tags TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
  CREATE INDEX IF NOT EXISTS idx_journal_created ON journal_entries(created_at);

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    type TEXT DEFAULT 'note',
    timestamp TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notes_timestamp ON notes(timestamp);

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    country TEXT NOT NULL,
    date TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

  CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);
`);

// Prepared statements for faster queries
const statements = {
  // Journal
  insertJournalEntry: db.prepare(`
    INSERT INTO journal_entries (id, date, title, note, pnl, mood, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getJournalEntriesByMonth: db.prepare(`
    SELECT * FROM journal_entries
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `),
  deleteJournalEntry: db.prepare('DELETE FROM journal_entries WHERE id = ?'),

  // Todos
  insertTodo: db.prepare('INSERT INTO todos (id, text, completed) VALUES (?, ?, ?)'),
  getAllTodos: db.prepare('SELECT * FROM todos ORDER BY created_at DESC'),
  toggleTodo: db.prepare('UPDATE todos SET completed = NOT completed WHERE id = ?'),
  deleteTodo: db.prepare('DELETE FROM todos WHERE id = ?'),

  // Notes
  insertNote: db.prepare('INSERT INTO notes (id, text, type, timestamp) VALUES (?, ?, ?, ?)'),
  getRecentNotes: db.prepare(`
    SELECT * FROM notes
    WHERE timestamp >= datetime('now', '-1 day')
    ORDER BY timestamp DESC
  `),
  deleteNote: db.prepare('DELETE FROM notes WHERE id = ?'),

  // Events
  insertEvent: db.prepare('INSERT INTO events (id, title, country, date) VALUES (?, ?, ?, ?)'),
  getUpcomingEvents: db.prepare(`
    SELECT * FROM events
    WHERE date > datetime('now')
    ORDER BY date ASC
  `),
  deleteEvent: db.prepare('DELETE FROM events WHERE id = ?'),

  // Cache
  setCache: db.prepare('INSERT OR REPLACE INTO api_cache (key, value, expires_at) VALUES (?, ?, ?)'),
  getCache: db.prepare('SELECT value FROM api_cache WHERE key = ? AND expires_at > ?'),
  cleanExpiredCache: db.prepare('DELETE FROM api_cache WHERE expires_at <= ?'),
};

// Optimize with transactions for bulk operations
const insertJournalEntries = db.transaction((entries) => {
  for (const entry of entries) {
    statements.insertJournalEntry.run(
      entry.id,
      entry.date,
      entry.title,
      entry.note,
      entry.pnl,
      entry.mood,
      entry.tags
    );
  }
});

// Auto-cleanup old cache every hour
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  statements.cleanExpiredCache.run(now);
}, 60 * 60 * 1000);

// Journal API
const journal = {
  create(entry) {
    const tagsJson = Array.isArray(entry.tags) ? JSON.stringify(entry.tags) : entry.tags;
    statements.insertJournalEntry.run(
      entry.id,
      entry.date,
      entry.title,
      entry.note || null,
      entry.pnl || null,
      entry.mood || null,
      tagsJson
    );
    return { ...entry, tags: JSON.parse(tagsJson) };
  },

  getByMonth(startDate, endDate) {
    const rows = statements.getJournalEntriesByMonth.all(startDate, endDate);
    return rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      pnl: row.pnl || null
    }));
  },

  delete(id) {
    statements.deleteJournalEntry.run(id);
  }
};

// Todo API
const todos = {
  create(todo) {
    statements.insertTodo.run(todo.id, todo.text, todo.completed ? 1 : 0);
    return todo;
  },

  getAll() {
    return statements.getAllTodos.all().map(row => ({
      ...row,
      completed: Boolean(row.completed)
    }));
  },

  toggle(id) {
    statements.toggleTodo.run(id);
  },

  delete(id) {
    statements.deleteTodo.run(id);
  }
};

// Notes API
const notes = {
  create(note) {
    statements.insertNote.run(note.id, note.text, note.type, note.timestamp);
    return note;
  },

  getRecent() {
    return statements.getRecentNotes.all();
  },

  delete(id) {
    statements.deleteNote.run(id);
  }
};

// Events API
const events = {
  create(event) {
    statements.insertEvent.run(event.id, event.title, event.country, event.date);
    return event;
  },

  getUpcoming() {
    return statements.getUpcomingEvents.all();
  },

  delete(id) {
    statements.deleteEvent.run(id);
  }
};

// Cache API
const cache = {
  set(key, value, ttlSeconds) {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    statements.setCache.run(key, JSON.stringify(value), expiresAt);
  },

  get(key) {
    const now = Math.floor(Date.now() / 1000);
    const row = statements.getCache.get(key, now);
    return row ? JSON.parse(row.value) : null;
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

module.exports = {
  db,
  journal,
  todos,
  notes,
  events,
  cache
};
