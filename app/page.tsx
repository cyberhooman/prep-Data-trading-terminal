'use client'

import { useEffect, useState } from 'react'
import EventCountdown from '@/components/EventCountdown'
import TodoCard from '@/components/TodoCard'
import QuickNotes from '@/components/QuickNotes'
import CurrencyStrength from '@/components/CurrencyStrength'
import EventsList from '@/components/EventsList'
import JournalCalendar from '@/components/JournalCalendar'

export default function Home() {
  const [currencyData, setCurrencyData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    // Fetch currency strength data
    fetch('/api/currency')
      .then(res => res.json())
      .then(data => setCurrencyData(data))
      .catch(err => console.error('Error fetching currency data:', err))

    // Fetch events data
    fetch('/api/events')
      .then(res => res.json())
      .then(data => setEvents(data))
      .catch(err => console.error('Error fetching events:', err))

    // Refresh data every 5 minutes
    const interval = setInterval(() => {
      fetch('/api/currency')
        .then(res => res.json())
        .then(data => setCurrencyData(data))
        .catch(err => console.error('Error fetching currency data:', err))

      fetch('/api/events')
        .then(res => res.json())
        .then(data => setEvents(data))
        .catch(err => console.error('Error fetching events:', err))
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1480px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(135deg, #60a5fa, #3b82f6, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Alphalabs Data Trading
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.7)' }}>Live currency strength snapshot and high-impact event timers</p>
        </div>
      </header>

      <main>
        {/* BENTO LAYOUT: Event Countdown, Notes, Todo List */}
        <div className="bento-container" style={{ maxWidth: '1480px', margin: '0 auto 2rem' }}>
          {/* Large Event Countdown Box (Full Width) */}
          <div className="bento-box bento-countdown">
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 700 }}>⏰ Next Event Countdown</h2>
            <EventCountdown events={events} />
          </div>

          {/* Quick Notes & Warnings Box (Left) */}
          <div className="bento-box bento-notes">
            <QuickNotes />
          </div>

          {/* Todo List Box (Right) */}
          <div className="bento-box bento-todos">
            <TodoCard />
          </div>
        </div>

        {/* Upcoming Events (Limited to 3) */}
        <section style={{ maxWidth: '1480px', margin: '0 auto 1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Upcoming High Impact News</h2>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.75)' }}>
            Showing next 3 high-impact events from Forex Factory
          </p>
          <EventsList events={events.slice(0, 3)} />
        </section>

        {/* Currency Strength Table */}
        {currencyData && (
          <section style={{ maxWidth: '1480px', margin: '0 auto 1.5rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Currency Strength (7-Day Trend)</h2>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.75)' }}>
              Calculated from 28 major currency pairs • Updated every 5 minutes
            </p>
            <CurrencyStrength data={currencyData} />
          </section>
        )}

        {/* Trading Journal */}
        <section style={{ maxWidth: '1480px', margin: '0 auto 1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Trading Journal</h2>
          <JournalCalendar />
        </section>
      </main>
    </>
  )
}
