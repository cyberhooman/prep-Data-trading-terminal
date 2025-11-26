'use client'

import { useState, useEffect } from 'react'

interface Event {
  id: string
  title: string
  country: string
  impact: string
  date: string
}

interface EventCountdownProps {
  events: Event[]
}

export default function EventCountdown({ events }: EventCountdownProps) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    const updateCountdown = () => {
      if (!events || events.length === 0) {
        setNextEvent(null)
        return
      }

      const now = new Date().getTime()
      const upcomingEvents = events
        .filter(e => new Date(e.date).getTime() > now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      if (upcomingEvents.length === 0) {
        setNextEvent(null)
        return
      }

      const event = upcomingEvents[0]
      setNextEvent(event)

      const eventTime = new Date(event.date).getTime()
      const diff = eventTime - now

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 })
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft({ hours, minutes, seconds })
      setIsUrgent(diff <= 3 * 60 * 1000) // Urgent when less than 3 minutes
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [events])

  const formatTime = (value: number) => value.toString().padStart(2, '0')

  if (!nextEvent) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.125rem' }}>
          No upcoming events scheduled
        </p>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {/* Event Info */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.375rem 1rem',
          background: 'rgba(250, 93, 41, 0.9)',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.75rem'
        }}>
          {nextEvent.country} - {nextEvent.impact} Impact
        </span>
        <h3 style={{
          fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
          fontWeight: '600',
          color: '#ffffff',
          marginTop: '0.5rem'
        }}>
          {nextEvent.title}
        </h3>
      </div>

      {/* Countdown Timer */}
      <div className={`next-countdown ${isUrgent ? 'urgent' : ''}`}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem'
        }}>
          <TimeUnit value={timeLeft.hours} label="HRS" />
          <span style={{ fontSize: '0.5em', opacity: 0.5 }}>:</span>
          <TimeUnit value={timeLeft.minutes} label="MIN" />
          <span style={{ fontSize: '0.5em', opacity: 0.5 }}>:</span>
          <TimeUnit value={timeLeft.seconds} label="SEC" />
        </div>
      </div>

      {/* Scheduled Time */}
      <p style={{
        marginTop: '1.5rem',
        color: 'rgba(255,255,255,0.5)',
        fontSize: '0.875rem'
      }}>
        Scheduled: {new Date(nextEvent.date).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </p>
    </div>
  )
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ display: 'block' }}>
        {value.toString().padStart(2, '0')}
      </span>
      <span style={{
        display: 'block',
        fontSize: '0.625rem',
        fontWeight: '500',
        opacity: 0.5,
        letterSpacing: '0.1em',
        marginTop: '-0.5rem'
      }}>
        {label}
      </span>
    </div>
  )
}
