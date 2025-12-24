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
    // Return only today for dashboard widget
    return [new Date()];
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
      {/* Calendar Header - Today's Date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Calendar Grid - Today Only */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Day Header */}
        <div style={{ marginBottom: '0.75rem', flexShrink: 0 }}>
          {weekDays.map((day, index) => (
            <div
              key={index}
              style={{
                textAlign: 'center',
                padding: '0.75rem',
                borderBottom: '3px solid #14b8a6',
                background: 'rgba(20, 184, 166, 0.1)',
                borderRadius: '0.5rem 0.5rem 0 0'
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#5eead4', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {day.toLocaleDateString('en-US', { weekday: 'long' })}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#5eead4', marginTop: '0.25rem' }}>
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Events List for Today */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.25rem' }} className="custom-scrollbar">
          {weekDays.map((day, index) => {
            const dayEvents = getEventsForDay(new Date(day));
            return (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dayEvents.length === 0 ? (
                  <div style={{ fontSize: '0.875rem', color: '#475569', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
                    No events today
                  </div>
                ) : (
                  dayEvents.map((event, eventIndex) => (
                    <div
                      key={event.id || eventIndex}
                      style={{
                        background: '#1e293b',
                        border: '2px solid #334155',
                        borderLeft: '4px solid #14b8a6',
                        borderRadius: '0.5rem',
                        padding: '0.75rem',
                        cursor: 'default',
                        transition: 'all 0.2s'
                      }}
                      title={event.title}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.5)';
                        e.currentTarget.style.transform = 'translateX(4px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#334155';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }}
                    >
                      {/* Time */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#64748b' }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', fontWeight: 600 }}>
                          {formatTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Country Badge */}
                      <div style={{ display: 'inline-block', padding: '0.25rem 0.5rem', background: 'rgba(20, 184, 166, 0.15)', border: '1px solid rgba(20, 184, 166, 0.3)', borderRadius: '0.25rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#5eead4' }}>
                          {event.country}
                        </span>
                      </div>

                      {/* Event Title */}
                      <div style={{
                        fontSize: '0.875rem',
                        color: '#e2e8f0',
                        lineHeight: 1.4,
                        fontWeight: 500
                      }}>
                        {event.title}
                      </div>

                      {/* High Impact Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <span style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }}></span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#f87171', textTransform: 'uppercase' }}>
                          High Impact
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Events Count Footer */}
      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #334155', flexShrink: 0 }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
          {getEventsForDay(new Date()).length} event{getEventsForDay(new Date()).length !== 1 ? 's' : ''} today
        </div>
      </div>
    </div>
  );
}

// Make component globally available
if (typeof window !== 'undefined') {
  window.WeekCalendar = WeekCalendar;
}
