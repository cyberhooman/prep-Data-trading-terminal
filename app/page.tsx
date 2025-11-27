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
      <header className="main-header">
        <div className="header-content">
          {/* Left: Logo & Brand */}
          <div className="header-brand">
            <div className="logo-box">
              <span className="logo-letter">A</span>
            </div>
            <div className="brand-text">
              <h1 className="brand-name">Alphalabs</h1>
              <p className="brand-tagline">DATA TRADING</p>
            </div>
          </div>

          {/* Right: User Profile & Logout */}
          <div className="header-user">
            <div className="user-profile">
              <div className="user-avatar">
                <span className="avatar-initial">F</span>
              </div>
              <div className="user-info">
                <span className="user-name">Fadly Aidil</span>
                <span className="user-email">aaidifadly12@gmail.com</span>
              </div>
            </div>
            <button className="logout-btn">
              <svg className="logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* BENTO LAYOUT: Event Countdown, Notes, Todo List */}
        <div className="bento-container" style={{ maxWidth: '1480px', margin: '0 auto 2rem' }}>
          {/* Large Event Countdown Box (Full Width) */}
          <div className="bento-box bento-countdown">
            <h2>⏰ Next Event Countdown</h2>
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
        <section>
          <h2>Upcoming High Impact News</h2>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
            Showing next 3 high-impact events from Forex Factory
          </p>
          <EventsList events={events.slice(0, 3)} />
        </section>

        {/* Currency Strength Table */}
        {currencyData && (
          <section>
            <h2>Currency Strength (7-Day Trend)</h2>
            <p style={{ marginBottom: '1.5rem', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Calculated from 28 major currency pairs • Updated every 5 minutes
            </p>
            <CurrencyStrength data={currencyData} />
          </section>
        )}

        {/* Trading Journal */}
        <section>
          <h2>Trading Journal</h2>
          <JournalCalendar />
        </section>
      </main>
    </>
  )
}
