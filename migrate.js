/**
 * Migration Script - JSON to SQLite
 * ------------------------------------------------
 * Migrates existing JSON data to optimized SQLite database
 */

const fs = require('fs');
const path = require('path');
const { journal, todos, notes, events } = require('./database');

const DATA_DIR = path.join(__dirname, 'data');

function loadJson(filename, fallback = []) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw || 'null') || fallback;
    }
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err.message);
  }
  return fallback;
}

function migrate() {
  console.log('Starting migration from JSON to SQLite...\n');

  // Migrate journal entries
  const journalData = loadJson('journal.json', []);
  if (journalData.length > 0) {
    console.log(`Migrating ${journalData.length} journal entries...`);
    journalData.forEach(entry => {
      try {
        journal.create({
          id: entry.id,
          date: entry.date,
          title: entry.title,
          note: entry.note || null,
          pnl: entry.pnl || null,
          mood: entry.mood || null,
          tags: JSON.stringify(entry.tags || [])
        });
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint')) {
          console.error(`Failed to migrate journal entry ${entry.id}:`, err.message);
        }
      }
    });
    console.log('✓ Journal entries migrated\n');
  }

  // Migrate todos
  const todosData = loadJson('todos.json', []);
  if (todosData.length > 0) {
    console.log(`Migrating ${todosData.length} todos...`);
    todosData.forEach(todo => {
      try {
        todos.create({
          id: todo.id,
          text: todo.text,
          completed: todo.completed || false
        });
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint')) {
          console.error(`Failed to migrate todo ${todo.id}:`, err.message);
        }
      }
    });
    console.log('✓ Todos migrated\n');
  }

  // Migrate notes
  const notesData = loadJson('notes.json', []);
  if (notesData.length > 0) {
    console.log(`Migrating ${notesData.length} notes...`);
    notesData.forEach(note => {
      try {
        notes.create({
          id: note.id,
          text: note.text,
          type: note.type || 'note',
          timestamp: note.timestamp
        });
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint')) {
          console.error(`Failed to migrate note ${note.id}:`, err.message);
        }
      }
    });
    console.log('✓ Notes migrated\n');
  }

  // Migrate events
  const eventsData = loadJson('events.json', []);
  if (eventsData.length > 0) {
    console.log(`Migrating ${eventsData.length} events...`);
    eventsData.forEach(event => {
      try {
        events.create({
          id: event.id,
          title: event.title,
          country: event.country,
          date: event.date
        });
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint')) {
          console.error(`Failed to migrate event ${event.id}:`, err.message);
        }
      }
    });
    console.log('✓ Events migrated\n');
  }

  console.log('Migration completed successfully! 🎉');
  console.log('\nYour data is now stored in SQLite database (data/trading.db)');
  console.log('Old JSON files are kept as backup in data/ folder');
}

// Run migration
migrate();
