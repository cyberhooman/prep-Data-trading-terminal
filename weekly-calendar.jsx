/**
 * Weekly Calendar Component
 * Displays events in a 7-day calendar grid (Monday-Sunday)
 * Shows country flags for easy recognition
 */

const { useState, useEffect } = React;

// Flag emojis for currency codes
const flagEmojis = {
  'USD': '🇺🇸',
  'EUR': '🇪🇺',
  'GBP': '🇬🇧',
  'CAD': '🇨🇦',
  'AUD': '🇦🇺',
  'JPY': '🇯🇵',
  'CHF': '🇨🇭',
  'NZD': '🇳🇿',
  'CNY': '🇨🇳',
  'INR': '🇮🇳',
  'BRL': '🇧🇷',
  'MXN': '🇲🇽'
};

// Event type icons
const eventTypeIcons = {
  'forex': '💱',
  'cb_speech': '🎤',
  'trump_schedule': '🏛️',
  'economic': '📊'
};

function WeeklyCalendar() {
  const [events, setEvents] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(getWeekDays());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get Monday-Sunday for current week
  function getWeekDays() {
    const today = new Date();
    const monday = new Date(today);
    // Get Monday (0 = Sunday, 1 = Monday, ... 6 = Saturday)
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day;
    });
  }

  // Navigate to previous/next week
  function navigateWeek(direction) {
    const newWeek = currentWeek.map(day => {
      const newDay = new Date(day);
      newDay.setDate(day.getDate() + (direction * 7));
      return newDay;
    });
    setCurrentWeek(newWeek);
  }

  // Fetch events for current week
  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/calendar/weekly');
        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }
        const data = await response.json();
        setEvents(data.events || []);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, [currentWeek]);

  // Get events for a specific day
  function getEventsForDay(day) {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate >= dayStart && eventDate <= dayEnd;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Check if day is today
  function isToday(day) {
    const today = new Date();
    return day.getDate() === today.getDate() &&
           day.getMonth() === today.getMonth() &&
           day.getFullYear() === today.getFullYear();
  }

  // Format time
  function formatTime(dateStr) {
    const date = new Date(dateStr);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Format day header
  function formatDayHeader(day) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      dayName: dayNames[day.getDay()],
      date: day.getDate(),
      month: monthNames[day.getMonth()]
    };
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          📅 Weekly Calendar
        </h1>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          High-impact events, CB speeches, and Trump schedule
        </p>
      </div>

      {/* Week Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigateWeek(-1)}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--secondary-bg)',
            border: '1px solid var(--secondary-border)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--text-primary)',
            transition: 'all 0.2s'
          }}
        >
          ← Previous Week
        </button>
        <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
          {formatDayHeader(currentWeek[0]).month} {currentWeek[0].getDate()} - {formatDayHeader(currentWeek[6]).month} {currentWeek[6].getDate()}, {currentWeek[0].getFullYear()}
        </div>
        <button
          onClick={() => navigateWeek(1)}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--secondary-bg)',
            border: '1px solid var(--secondary-border)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--text-primary)',
            transition: 'all 0.2s'
          }}
        >
          Next Week →
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Loading events...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(255, 51, 102, 0.1)', borderRadius: '12px', color: '#ff3366' }}>
          Error: {error}
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && !error && (
        <div className="weekly-calendar">
          {currentWeek.map((day, index) => {
            const dayHeader = formatDayHeader(day);
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);

            return (
              <div
                key={index}
                className={`calendar-day ${today ? 'today' : ''}`}
              >
                {/* Day Header */}
                <div className="calendar-day-header">
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {dayHeader.dayName}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '0.25rem' }}>
                    {dayHeader.date}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {dayHeader.month}
                  </div>
                </div>

                {/* Events for this day */}
                <div style={{ marginTop: '0.75rem' }}>
                  {dayEvents.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No events
                    </div>
                  ) : (
                    dayEvents.map((event, eventIndex) => (
                      <div
                        key={eventIndex}
                        className="calendar-event-item"
                        style={{
                          borderLeftColor: event.source === 'cb_speech' ? '#00D9FF' :
                                          event.source === 'trump_schedule' ? '#FFB800' :
                                          '#FF3366'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span className="flag" style={{ fontSize: '1.2rem' }}>
                            {flagEmojis[event.country] || '🌐'}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {formatTime(event.date)}
                          </span>
                          {event.source && (
                            <span style={{ fontSize: '0.9rem' }}>
                              {eventTypeIcons[event.source] || '📌'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
                          {event.title}
                        </div>
                        {event.location && (
                          <div style={{ fontSize: '0.65rem', marginTop: '0.25rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            📍 {event.location}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && !error && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--secondary-bg)', borderRadius: '12px', border: '1px solid var(--secondary-border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-primary)' }}>
            Legend
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '3px', height: '20px', background: '#FF3366', borderRadius: '2px' }}></div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>💱 Economic Events (Forex Factory)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '3px', height: '20px', background: '#00D9FF', borderRadius: '2px' }}></div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🎤 Central Bank Speeches</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '3px', height: '20px', background: '#FFB800', borderRadius: '2px' }}></div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🏛️ Trump Official Schedule</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Mount component
const root = ReactDOM.createRoot(document.getElementById('weekly-calendar-root'));
root.render(<WeeklyCalendar />);
