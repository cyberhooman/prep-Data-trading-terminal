# Next.js Migration Guide for Alphalabs Trading Dashboard

## Overview
This guide will help you migrate your Express.js trading dashboard to Next.js 14 (App Router) for deployment on Vercel.

## Prerequisites
- Node.js 18+ installed
- Git repository initialized
- Vercel account (free tier works)

## Step 1: Install Next.js Dependencies

```bash
# Backup your current project first!
git add .
git commit -m "Backup before Next.js migration"

# Install Next.js and dependencies
npm install next@latest react@latest react-dom@latest
npm install --save-dev typescript @types/react @types/node @types/react-dom
npm install --save-dev @types/better-sqlite3 @types/ws
```

## Step 2: Update package.json Scripts

Replace your current scripts with:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

## Step 3: Project Structure

Create the following directory structure:

```
/
├── app/
│   ├── layout.tsx          # Root layout (already created)
│   ├── page.tsx            # Home page
│   ├── globals.css         # Global styles (already created)
│   └── api/
│       ├── events/
│       │   └── route.ts    # Events API
│       ├── todos/
│       │   └── route.ts    # Todos API
│       ├── notes/
│       │   └── route.ts    # Notes API
│       └── currency/
│           └── route.ts    # Currency strength API
├── components/
│   ├── EventCountdown.tsx
│   ├── TodoList.tsx
│   └── QuickNotes.tsx
├── lib/
│   ├── database.ts         # SQLite database functions
│   ├── forex-api.ts        # Forex Factory API
│   └── currency-api.ts     # Currency strength API
├── data/                   # Keep your existing data directory
├── public/                 # Static assets
├── next.config.js          # Next.js config (already created)
└── tsconfig.json           # TypeScript config (already created)
```

## Step 4: Key Files to Create

### 1. app/page.tsx (Main Dashboard)

```typescript
'use client'

import { useEffect, useState } from 'react'
import EventCountdown from '@/components/EventCountdown'
import TodoList from '@/components/TodoList'
import QuickNotes from '@/components/QuickNotes'

export default function Home() {
  const [events, setEvents] = useState([])
  const [currencyData, setCurrencyData] = useState(null)

  useEffect(() => {
    // Fetch initial data
    fetchEvents()
    fetchCurrency()

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchEvents()
      fetchCurrency()
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [])

  const fetchEvents = async () => {
    const res = await fetch('/api/events')
    const data = await res.json()
    setEvents(data)
  }

  const fetchCurrency = async () => {
    const res = await fetch('/api/currency')
    const data = await res.json()
    setCurrencyData(data)
  }

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1480px', margin: '0 auto' }}>
          <h1>Alphalabs Data Trading</h1>
          <p>Live currency strength snapshot and high-impact event timers</p>
        </div>
      </header>

      <main>
        <div className="bento-container">
          <div className="bento-box bento-countdown">
            <h2>⏰ Next Event Countdown</h2>
            <EventCountdown events={events} />
          </div>

          <div className="bento-box bento-notes">
            <QuickNotes />
          </div>

          <div className="bento-box bento-todos">
            <TodoList />
          </div>
        </div>

        {/* Currency Strength Table */}
        {currencyData && (
          <section>
            <h2>Currency Strength</h2>
            {/* Add your currency strength table here */}
          </section>
        )}
      </main>
    </>
  )
}
```

### 2. app/api/events/route.ts

```typescript
import { NextResponse } from 'next/server'
import { getEvents, addEvent, deleteEvent } from '@/lib/database'

export async function GET() {
  try {
    const events = await getEvents()
    return NextResponse.json(events)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const event = await addEvent(body)
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
    }
    await deleteEvent(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }
}
```

### 3. lib/database.ts

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const dbPath = path.join(DATA_DIR, 'trading.db')
const db = new Database(dbPath)

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    country TEXT NOT NULL,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Events
export function getEvents() {
  return db.prepare('SELECT * FROM events ORDER BY date ASC').all()
}

export function addEvent(event: any) {
  const stmt = db.prepare('INSERT INTO events (id, title, country, date, source) VALUES (?, ?, ?, ?, ?)')
  stmt.run(event.id, event.title, event.country, event.date, event.source)
  return event
}

export function deleteEvent(id: string) {
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
}

// Todos
export function getTodos() {
  return db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all()
}

export function addTodo(todo: any) {
  const stmt = db.prepare('INSERT INTO todos (id, task, done) VALUES (?, ?, ?)')
  stmt.run(todo.id, todo.task, todo.done || 0)
  return todo
}

export function updateTodo(id: string, done: number) {
  db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(done, id)
}

export function deleteTodo(id: string) {
  db.prepare('DELETE FROM todos WHERE id = ?').run(id)
}

// Notes
export function getNotes() {
  return db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
}

export function addNote(note: any) {
  const stmt = db.prepare('INSERT INTO notes (id, content) VALUES (?, ?)')
  stmt.run(note.id, note.content)
  return note
}

export function deleteNote(id: string) {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export default db
```

### 4. lib/forex-api.ts

```typescript
const FA_ECON_CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

let calendarCache: {
  timestamp: number
  records: any[] | null
  nextAllowed: number
} = {
  timestamp: 0,
  records: null,
  nextAllowed: 0,
}

export async function fetchForexCalendar() {
  const now = Date.now()
  const CACHE_TTL = 3 * 60 * 60 * 1000 // 3 hours

  // Check if cached data is still valid
  if (calendarCache.records && now - calendarCache.timestamp < CACHE_TTL) {
    return calendarCache.records
  }

  // Check rate limiting
  if (now < calendarCache.nextAllowed) {
    console.log('Rate limited, using cached data')
    return calendarCache.records || []
  }

  try {
    const response = await fetch(FA_ECON_CAL_URL, {
      headers: {
        'User-Agent': 'Alphalabs-Trading-Dashboard/2.0',
      },
    })

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait 30 minutes
        calendarCache.nextAllowed = now + 30 * 60 * 1000
        console.log('Rate limited by Forex Factory, waiting 30 minutes')
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    // Filter for high impact events
    const highImpactEvents = data.filter((event: any) =>
      event.impact === 'High' && event.date
    )

    calendarCache = {
      timestamp: now,
      records: highImpactEvents,
      nextAllowed: 0,
    }

    return highImpactEvents
  } catch (error) {
    console.error('Failed to fetch Forex calendar:', error)
    return calendarCache.records || []
  }
}
```

### 5. lib/currency-api.ts

```typescript
const MARKETMILK_API = 'https://marketmilk.babypips.com/api'
const FOREX_LIST_ID = 'fxcm:forex'

let currencyCache: {
  timestamp: number
  data: any | null
  ttl: number
} = {
  timestamp: 0,
  data: null,
  ttl: 5 * 60 * 1000, // 5 minutes
}

export async function fetchCurrencyStrength() {
  const now = Date.now()

  // Check if cached data is still valid
  if (currencyCache.data && now - currencyCache.timestamp < currencyCache.ttl) {
    return currencyCache.data
  }

  try {
    // Fetch pairs from MarketMilk API
    const response = await fetch(`${MARKETMILK_API}/lists/${FOREX_LIST_ID}/tickers?period=ONE_DAY&stream=REAL_TIME`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    // Calculate currency strength (BabyPips style)
    const strength = calculateCurrencyStrength(data)

    currencyCache = {
      timestamp: now,
      data: strength,
      ttl: 5 * 60 * 1000,
    }

    return strength
  } catch (error) {
    console.error('Failed to fetch currency strength:', error)
    return currencyCache.data || []
  }
}

function calculateCurrencyStrength(pairs: any[]) {
  // Implement BabyPips-style currency strength calculation
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']
  const strength: Record<string, { score: number, count: number }> = {}

  currencies.forEach(curr => {
    strength[curr] = { score: 0, count: 0 }
  })

  pairs.forEach((pair: any) => {
    const base = pair.symbol.slice(0, 3)
    const quote = pair.symbol.slice(3, 6)
    const change = pair.change || 0

    if (strength[base]) {
      strength[base].score += change
      strength[base].count += 1
    }
    if (strength[quote]) {
      strength[quote].score -= change
      strength[quote].count += 1
    }
  })

  // Calculate average and sort
  const result = currencies.map(curr => ({
    currency: curr,
    strength: strength[curr].count > 0
      ? (strength[curr].score / strength[curr].count) * 100
      : 0,
    momentum: strength[curr].score > 0 ? 'bullish' : 'bearish',
  }))

  return result.sort((a, b) => b.strength - a.strength)
}
```

## Step 5: Deploy to Vercel

### Option A: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

### Option B: Deploy via GitHub

1. Push your code to GitHub:
```bash
git add .
git commit -m "Migrate to Next.js for Vercel deployment"
git push origin main
```

2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "Add New Project"
4. Import your GitHub repository
5. Vercel will auto-detect Next.js
6. Click "Deploy"

### Environment Variables on Vercel

If you need any API keys or secrets, add them in:
- Vercel Dashboard → Your Project → Settings → Environment Variables

## Step 6: Post-Deployment Configuration

### Configure Custom Domain (Optional)
1. Go to your project settings on Vercel
2. Navigate to "Domains"
3. Add your custom domain

### Set up Cron Jobs (Optional)
For periodic tasks like fetching calendar data:
- Use Vercel Cron Jobs (Pro plan) or
- Use external services like GitHub Actions

## Important Notes

### Database Considerations
- **SQLite on Vercel**: SQLite won't persist across deployments on Vercel's serverless functions
- **Solutions**:
  1. **Vercel Postgres** (Recommended): Use Vercel's built-in Postgres database
  2. **Vercel KV**: For simpler key-value storage
  3. **External Database**: MongoDB Atlas, PlanetScale, Supabase

To use Vercel Postgres:
```bash
npm install @vercel/postgres
```

Then update `lib/database.ts` to use Vercel Postgres instead of SQLite.

### API Routes Best Practices
- Keep API routes lightweight
- Implement caching for external API calls
- Use Next.js built-in rate limiting
- Handle errors gracefully

### Performance Optimization
- Enable ISR (Incremental Static Regeneration) where possible
- Use `loading.tsx` for better UX
- Implement proper error boundaries
- Optimize images with `next/image`

## Troubleshooting

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Try building again
npm run build
```

### Database Issues
- If using SQLite, migrate to Vercel Postgres
- Check file system permissions in serverless environment

### API Rate Limiting
- Implement proper caching strategies
- Use edge functions for better performance

## Rollback Plan

If you need to rollback to the Express version:
```bash
git checkout HEAD~1  # Go back one commit
npm install
npm start
```

## Next Steps

1. Test locally with `npm run dev`
2. Fix any TypeScript errors
3. Test all features thoroughly
4. Deploy to Vercel
5. Monitor performance and errors in Vercel Dashboard

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [Next.js App Router](https://nextjs.org/docs/app)

## Need Help?

- Next.js Discord: https://nextjs.org/discord
- Vercel Support: https://vercel.com/support
- This migration guide repository issues

---

**Created with Claude Code**
https://claude.com/claude-code
