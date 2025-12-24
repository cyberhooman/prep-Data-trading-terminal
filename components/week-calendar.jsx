function WeekCalendar() {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [currentWeekStart, setCurrentWeekStart] = React.useState(getWeekStart(new Date()));

  React.useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Adjust to Sunday
    return new Date(d.setDate(diff));
  }

  function getWeekDays(startDate) {
    // Return all 7 days of the week
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  }

  async function loadEvents() {
    try {
      const response = await fetch('/api/events');
      const result = await response.json();
      // API returns { success: true, data: [...], nextEvent: {...} }
      setEvents(result.data || result || []);
    } catch (error) {
      console.error('Error loading events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  function getEventsForDay(date) {
    // Create new Date objects to avoid mutating the original
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
      const eventDate = new Date(event.timestamp);
      return eventDate >= dayStart && eventDate <= dayEnd;
    });
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function navigateWeek(direction) {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(newStart);
  }

  function goToCurrentWeek() {
    setCurrentWeekStart(getWeekStart(new Date()));
  }

  const weekDays = getWeekDays(currentWeekStart);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) {
    return (
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
        <div style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Loading calendar...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Calendar Header with Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => navigateWeek('prev')}
            style={{ padding: '0.25rem', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', borderRadius: '0.25rem', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.target.style.background = '#334155'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
            title="Previous week"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button
            onClick={goToCurrentWeek}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              background: 'rgba(20, 184, 166, 0.2)',
              color: '#5eead4',
              border: '1px solid rgba(20, 184, 166, 0.3)',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(20, 184, 166, 0.3)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(20, 184, 166, 0.2)'}
          >
            Today
          </button>
          <button
            onClick={() => navigateWeek('next')}
            style={{ padding: '0.25rem', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', borderRadius: '0.25rem', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.target.style.background = '#334155'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
            title="Next week"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
          {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Day Headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', marginBottom: '0.5rem', flexShrink: 0 }}>
          {weekDays.map((day, index) => {
            const today = isToday(day);
            return (
              <div
                key={index}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem 0.25rem',
                  borderBottom: today ? '2px solid #14b8a6' : '1px solid #334155',
                  background: today ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                  borderRadius: today ? '0.25rem 0.25rem 0 0' : '0'
                }}
              >
                <div style={{ fontSize: '0.65rem', color: today ? '#5eead4' : '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {dayNames[day.getDay()]}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: today ? '#5eead4' : '#cbd5e1', marginTop: '0.125rem' }}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Events Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
          {weekDays.map((day, index) => {
            const dayEvents = getEventsForDay(new Date(day));
            const today = isToday(day);
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  padding: '0.5rem 0.25rem',
                  borderRadius: '0.25rem',
                  background: today ? 'rgba(20, 184, 166, 0.05)' : 'rgba(15, 23, 42, 0.5)',
                  border: today ? '1px solid rgba(20, 184, 166, 0.2)' : '1px solid #1e293b',
                  minHeight: '80px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}
              >
                {dayEvents.length === 0 ? (
                  <div style={{ fontSize: '0.6rem', color: '#475569', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem 0' }}>
                    No events
                  </div>
                ) : (
                  dayEvents.slice(0, 3).map((event, eventIndex) => (
                    <div
                      key={event.id || eventIndex}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderLeft: '3px solid #14b8a6',
                        borderRadius: '0.25rem',
                        padding: '0.375rem',
                        cursor: 'default',
                        transition: 'border-color 0.2s'
                      }}
                      title={`${formatTime(event.timestamp)} - ${event.title}`}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.5)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#334155'}
                    >
                      {/* Time */}
                      <div style={{ fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', fontWeight: 600, marginBottom: '0.125rem' }}>
                        {formatTime(event.timestamp)}
                      </div>

                      {/* Event Title */}
                      <div style={{
                        fontSize: '0.65rem',
                        color: '#e2e8f0',
                        lineHeight: 1.3,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {event.title}
                      </div>
                    </div>
                  ))
                )}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: '0.55rem', color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Events Count Footer */}
      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #334155', flexShrink: 0 }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
          {events.length} event{events.length !== 1 ? 's' : ''} this week
        </div>
      </div>
    </div>
  );
}

// Make component globally available
if (typeof window !== 'undefined') {
  window.WeekCalendar = WeekCalendar;
}
