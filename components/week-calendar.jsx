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
      const data = await response.json();
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  }

  function getEventsForDay(date) {
    const dayStart = new Date(date.setHours(0, 0, 0, 0));
    const dayEnd = new Date(date.setHours(23, 59, 59, 999));

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
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>
          {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Day Headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', marginBottom: '0.5rem', flexShrink: 0 }}>
          {weekDays.map((day, index) => (
            <div
              key={index}
              style={{
                textAlign: 'center',
                paddingBottom: '0.5rem',
                borderBottom: `2px solid ${isToday(day) ? '#14b8a6' : '#334155'}`
              }}
            >
              <div style={{ fontSize: '0.625rem', color: '#64748b', fontWeight: 500, marginBottom: '0.25rem' }}>
                {dayNames[index]}
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: isToday(day) ? '#5eead4' : '#cbd5e1' }}>
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Events Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
          {weekDays.map((day, index) => {
            const dayEvents = getEventsForDay(new Date(day));
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  padding: '0.25rem',
                  borderRadius: '0.25rem',
                  background: isToday(day) ? 'rgba(20, 184, 166, 0.05)' : 'rgba(30, 41, 59, 0.3)',
                  border: isToday(day) ? '1px solid rgba(20, 184, 166, 0.2)' : 'none'
                }}
              >
                {dayEvents.length === 0 ? (
                  <div style={{ fontSize: '0.625rem', color: '#475569', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem 0' }}>
                    No events
                  </div>
                ) : (
                  dayEvents.map((event) => (
                    <div
                      key={event.id}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.25rem',
                        padding: '0.375rem',
                        cursor: 'default',
                        transition: 'border-color 0.2s'
                      }}
                      title={event.title}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.5)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#334155'}
                    >
                      {/* Time */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#64748b' }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span style={{ fontSize: '0.625rem', fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8' }}>
                          {formatTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Country Badge */}
                      <div style={{ display: 'inline-block', padding: '0.125rem 0.375rem', background: 'rgba(20, 184, 166, 0.15)', border: '1px solid rgba(20, 184, 166, 0.3)', borderRadius: '0.25rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.563rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#5eead4' }}>
                          {event.country}
                        </span>
                      </div>

                      {/* Event Title */}
                      <div style={{
                        fontSize: '0.625rem',
                        color: '#e2e8f0',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {event.title}
                      </div>

                      {/* High Impact Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                        <span style={{ width: '4px', height: '4px', background: '#ef4444', borderRadius: '50%' }}></span>
                        <span style={{ fontSize: '0.5rem', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: '#f87171', textTransform: 'uppercase' }}>
                          High
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
        <div style={{ fontSize: '0.625rem', color: '#64748b', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
          {events.length} event{events.length !== 1 ? 's' : ''} this week
        </div>
      </div>
    </div>
  );
}
