'use client'

interface Event {
  id: string
  title: string
  country: string
  impact: string
  date: string
}

interface EventsListProps {
  events: Event[]
}

const countryFlags: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  CHF: '🇨🇭',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  NZD: '🇳🇿',
  CNY: '🇨🇳',
}

export default function EventsList({ events }: EventsListProps) {
  if (!events || events.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '3rem 2rem',
        color: 'var(--text-muted)',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)'
      }}>
        <p style={{ fontSize: '1rem' }}>No upcoming high-impact events</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', opacity: 0.7 }}>
          Check back later for updates
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {events.map((event, index) => {
        const eventDate = new Date(event.date)
        const now = new Date()
        const diffMs = eventDate.getTime() - now.getTime()
        const hoursUntil = Math.floor(diffMs / (1000 * 60 * 60))
        const minutesUntil = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

        const isToday = eventDate.toDateString() === now.toDateString()
        const isSoon = diffMs > 0 && diffMs < 60 * 60 * 1000 // Within 1 hour

        return (
          <div
            key={event.id}
            className="card animate-slide-in"
            style={{
              animationDelay: `${index * 0.1}s`,
              display: 'grid',
              gridTemplateColumns: '80px 1fr auto',
              gap: '1.5rem',
              alignItems: 'center',
              borderLeft: isSoon ? '4px solid var(--accent-primary)' : '4px solid var(--border-light)'
            }}
          >
            {/* Time Block */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                color: isSoon ? 'var(--accent-primary)' : 'var(--text-primary)'
              }}>
                {eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {isToday ? 'Today' : eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>

            {/* Event Details */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.25rem' }}>
                  {countryFlags[event.country] || '🏳️'}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}>
                  {event.country}
                </span>
                <span className="badge badge-danger" style={{ marginLeft: '0.5rem' }}>
                  {event.impact}
                </span>
              </div>
              <h4 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                margin: 0
              }}>
                {event.title}
              </h4>
            </div>

            {/* Time Until */}
            <div style={{ textAlign: 'right' }}>
              {diffMs > 0 ? (
                <div style={{
                  padding: '0.5rem 1rem',
                  background: isSoon ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: isSoon ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}>
                  {hoursUntil > 0 ? `${hoursUntil}h ${minutesUntil}m` : `${minutesUntil}m`}
                </div>
              ) : (
                <span className="badge badge-success">Live</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
