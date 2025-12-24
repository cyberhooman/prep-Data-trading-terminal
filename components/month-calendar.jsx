/**
 * Month Calendar Component
 * Displays events in a monthly grid calendar view
 * Features: Month navigation, event indicators, today highlighting
 */

function MonthCalendar() {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState(null);

  // Event type colors
  const eventColors = {
    'forex': '#FF3366',
    'economic': '#FF3366',
    'cb_speech': '#00D9FF',
    'trump_schedule': '#FFB800'
  };

  const eventIcons = {
    'forex': React.createElement('svg', {
      width: '10',
      height: '10',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2'
    },
      React.createElement('line', { x1: '12', y1: '1', x2: '12', y2: '23' }),
      React.createElement('path', { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' })
    ),
    'economic': React.createElement('svg', {
      width: '10',
      height: '10',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2'
    },
      React.createElement('line', { x1: '12', y1: '20', x2: '12', y2: '10' }),
      React.createElement('line', { x1: '18', y1: '20', x2: '18', y2: '4' }),
      React.createElement('line', { x1: '6', y1: '20', x2: '6', y2: '16' })
    ),
    'cb_speech': React.createElement('svg', {
      width: '10',
      height: '10',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2'
    },
      React.createElement('path', { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' }),
      React.createElement('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
      React.createElement('line', { x1: '12', y1: '19', x2: '12', y2: '23' })
    ),
    'trump_schedule': React.createElement('svg', {
      width: '10',
      height: '10',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2'
    },
      React.createElement('path', { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
      React.createElement('polyline', { points: '9 22 9 12 15 12 15 22' })
    )
  };

  React.useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [currentDate]);

  async function loadEvents() {
    try {
      const response = await fetch('/api/calendar/weekly');
      const result = await response.json();
      setEvents(result.events || []);
    } catch (error) {
      console.error('Error loading events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  // Get last day of month
  function getMonthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  // Get calendar days (including previous/next month for full grid)
  function getCalendarDays() {
    const monthStart = getMonthStart(currentDate);
    const monthEnd = getMonthEnd(currentDate);
    const startDay = monthStart.getDay(); // Day of week (0-6)
    const days = [];

    // Add days from previous month
    for (let i = startDay - 1; i >= 0; i--) {
      const day = new Date(monthStart);
      day.setDate(day.getDate() - (i + 1));
      days.push({ date: day, isCurrentMonth: false });
    }

    // Add days from current month
    for (let i = 1; i <= monthEnd.getDate(); i++) {
      const day = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      days.push({ date: day, isCurrentMonth: true });
    }

    // Add days from next month to complete the grid (42 cells = 6 rows)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const day = new Date(monthEnd);
      day.setDate(monthEnd.getDate() + i);
      days.push({ date: day, isCurrentMonth: false });
    }

    return days;
  }

  // Get events for a specific date
  function getEventsForDate(date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
      const eventDate = new Date(event.date || event.timestamp);
      return eventDate >= dayStart && eventDate <= dayEnd;
    });
  }

  // Check if date is today
  function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  // Navigate months
  function navigateMonth(direction) {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  }

  // Go to today
  function goToToday() {
    setCurrentDate(new Date());
  }

  const calendarDays = getCalendarDays();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 0',
        fontSize: '0.75rem',
        color: '#94a3b8'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontSize: '0.75rem'
    }}>
      {/* Header with navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        padding: '0 0.25rem',
        flexShrink: 0
      }}>
        <button
          onClick={() => navigateMonth(-1)}
          style={{
            padding: '0.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            cursor: 'pointer',
            borderRadius: '0.25rem',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Previous month"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#cbd5e1'
          }}>
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
        </div>

        <button
          onClick={() => navigateMonth(1)}
          style={{
            padding: '0.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            cursor: 'pointer',
            borderRadius: '0.25rem',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Next month"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '1px',
        marginBottom: '0.5rem',
        flexShrink: 0
      }}>
        {dayNames.map((day, index) => (
          <div
            key={index}
            style={{
              textAlign: 'center',
              fontSize: '0.6rem',
              fontWeight: 600,
              color: '#64748b',
              padding: '0.25rem 0',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '1px',
        flex: 1,
        background: '#334155',
        borderRadius: '0.25rem',
        overflow: 'hidden'
      }}>
        {calendarDays.map((day, index) => {
          const dayEvents = getEventsForDate(day.date);
          const today = isToday(day.date);
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

          return (
            <div
              key={index}
              onClick={() => setSelectedDate(day.date)}
              style={{
                background: today
                  ? 'rgba(20, 184, 166, 0.1)'
                  : day.isCurrentMonth
                    ? '#1e293b'
                    : '#0f172a',
                padding: '0.25rem',
                cursor: dayEvents.length > 0 ? 'pointer' : 'default',
                position: 'relative',
                minHeight: '35px',
                display: 'flex',
                flexDirection: 'column',
                border: today ? '1px solid rgba(20, 184, 166, 0.5)' : 'none'
              }}
              title={dayEvents.length > 0 ? `${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}` : ''}
            >
              {/* Date number */}
              <div style={{
                fontSize: '0.65rem',
                fontWeight: today ? 700 : 600,
                color: today
                  ? '#5eead4'
                  : day.isCurrentMonth
                    ? '#cbd5e1'
                    : '#475569',
                marginBottom: '0.125rem',
                textAlign: 'center'
              }}>
                {day.date.getDate()}
              </div>

              {/* Event indicators */}
              {dayEvents.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '1px',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  marginTop: 'auto'
                }}>
                  {dayEvents.slice(0, 3).map((event, i) => {
                    const color = eventColors[event.source] || '#64748b';
                    const icon = eventIcons[event.source] || React.createElement('svg', {
                      width: '10',
                      height: '10',
                      viewBox: '0 0 24 24',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: '2'
                    },
                      React.createElement('circle', { cx: '12', cy: '12', r: '10' })
                    );

                    return (
                      <div
                        key={i}
                        style={{
                          fontSize: '0.5rem',
                          lineHeight: 1,
                          color: color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title={event.title}
                      >
                        {icon}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div style={{
                      fontSize: '0.5rem',
                      color: '#94a3b8',
                      fontWeight: 600
                    }}>
                      +{dayEvents.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Today button */}
      <div style={{
        marginTop: '0.5rem',
        textAlign: 'center',
        flexShrink: 0
      }}>
        <button
          onClick={goToToday}
          style={{
            padding: '0.25rem 0.75rem',
            fontSize: '0.65rem',
            fontWeight: 600,
            background: 'rgba(20, 184, 166, 0.15)',
            color: '#5eead4',
            border: '1px solid rgba(20, 184, 166, 0.3)',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(20, 184, 166, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(20, 184, 166, 0.15)';
          }}
        >
          Today
        </button>
      </div>

      {/* Event count */}
      <div style={{
        marginTop: '0.5rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid #334155',
        textAlign: 'center',
        fontSize: '0.6rem',
        color: '#64748b',
        flexShrink: 0
      }}>
        {events.length} event{events.length !== 1 ? 's' : ''} this month
      </div>
    </div>
  );
}

// Make component globally available
if (typeof window !== 'undefined') {
  window.MonthCalendar = MonthCalendar;
}
