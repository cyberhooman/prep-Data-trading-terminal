/**
 * Monthly Calendar Component - Full Page View
 * Displays events in a monthly grid calendar view
 * Features: Month navigation, event indicators, today highlighting
 */

const { useState, useEffect, useMemo } = React;

// Event type configuration - using SVG icons
const createIcon = (type) => {
  const iconProps = {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  switch(type) {
    case 'forex':
      return React.createElement('svg', iconProps,
        React.createElement('line', { x1: '12', y1: '1', x2: '12', y2: '23' }),
        React.createElement('path', { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' })
      );
    case 'economic':
      return React.createElement('svg', iconProps,
        React.createElement('line', { x1: '12', y1: '20', x2: '12', y2: '10' }),
        React.createElement('line', { x1: '18', y1: '20', x2: '18', y2: '4' }),
        React.createElement('line', { x1: '6', y1: '20', x2: '6', y2: '16' })
      );
    case 'cb_speech':
      return React.createElement('svg', iconProps,
        React.createElement('path', { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' }),
        React.createElement('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
        React.createElement('line', { x1: '12', y1: '19', x2: '12', y2: '23' })
      );
    case 'trump_schedule':
      return React.createElement('svg', iconProps,
        React.createElement('path', { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
        React.createElement('polyline', { points: '9 22 9 12 15 12 15 22' })
      );
    default:
      return React.createElement('svg', iconProps,
        React.createElement('circle', { cx: '12', cy: '12', r: '10' })
      );
  }
};

const eventTypes = {
  'forex': { icon: createIcon('forex'), label: 'Economic', color: '#FF3366' },
  'economic': { icon: createIcon('economic'), label: 'Economic', color: '#FF3366' },
  'cb_speech': { icon: createIcon('cb_speech'), label: 'CB Speech', color: '#00D9FF' },
  'trump_schedule': { icon: createIcon('trump_schedule'), label: 'Trump', color: '#FFB800' }
};

function MonthlyCalendar() {
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilters, setSelectedFilters] = useState(['forex', 'economic', 'cb_speech', 'trump_schedule']);

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
  }, [currentDate]);

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
      const inDateRange = eventDate >= dayStart && eventDate <= dayEnd;
      const matchesFilter = selectedFilters.includes(event.source);
      return inDateRange && matchesFilter;
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

  // Toggle filter
  function toggleFilter(filterType) {
    setSelectedFilters(prev =>
      prev.includes(filterType)
        ? prev.filter(f => f !== filterType)
        : [...prev, filterType]
    );
  }

  const calendarDays = getCalendarDays();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  // Get event count for filters
  const eventCounts = useMemo(() => {
    const counts = { forex: 0, economic: 0, cb_speech: 0, trump_schedule: 0 };
    events.forEach(event => {
      if (counts.hasOwnProperty(event.source)) {
        counts[event.source]++;
      }
    });
    return counts;
  }, [events]);

  return (
    <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {React.createElement('svg', {
                width: '28',
                height: '28',
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: '2',
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
              },
                React.createElement('rect', { x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' }),
                React.createElement('line', { x1: '16', y1: '2', x2: '16', y2: '6' }),
                React.createElement('line', { x1: '8', y1: '2', x2: '8', y2: '6' }),
                React.createElement('line', { x1: '3', y1: '10', x2: '21', y2: '10' })
              )}
              Monthly Calendar
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Track high-impact events and market-moving announcements
            </p>
          </div>

          {/* Stats Summary */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{
              background: 'var(--secondary-bg)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--secondary-border)',
              textAlign: 'center',
              minWidth: '80px'
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-primary)' }}>
                {events.filter(e => selectedFilters.includes(e.source)).length}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Events
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        marginBottom: '1.5rem',
        padding: '1rem',
        background: 'var(--secondary-bg)',
        borderRadius: '12px',
        border: '1px solid var(--secondary-border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
            Filter:
          </span>
          {Object.entries(eventTypes).map(([key, config]) => {
            const isActive = selectedFilters.includes(key);
            const count = eventCounts[key] || 0;

            return (
              React.createElement('button', {
                key: key,
                onClick: () => toggleFilter(key),
                style: {
                  padding: '0.5rem 0.875rem',
                  background: isActive ? `${config.color}20` : 'rgba(0, 0, 0, 0.2)',
                  border: `2px solid ${isActive ? config.color : 'transparent'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  color: isActive ? config.color : 'var(--text-muted)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: isActive ? 1 : 0.6
                }
              },
                React.createElement('span', null, config.icon),
                React.createElement('span', null, config.label),
                React.createElement('span', {
                  style: {
                    background: isActive ? config.color : 'var(--text-muted)',
                    color: '#0B0F19',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: '700'
                  }
                }, count)
              )
            );
          })}
        </div>
      </div>

      {/* Month Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '1rem',
        background: 'var(--secondary-bg)',
        borderRadius: '12px',
        border: '1px solid var(--secondary-border)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <button
          onClick={() => navigateMonth(-1)}
          style={{
            padding: '0.625rem 1.25rem',
            background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.1), rgba(0, 136, 255, 0.05))',
            border: '1px solid var(--accent-primary)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            color: 'var(--accent-primary)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>←</span>
          <span>Previous</span>
        </button>

        <div style={{
          textAlign: 'center',
          flex: '1',
          minWidth: '200px'
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
          <button
            onClick={goToToday}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: '600',
              background: 'rgba(20, 184, 166, 0.15)',
              color: '#5eead4',
              border: '1px solid rgba(20, 184, 166, 0.3)',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              marginTop: '0.5rem'
            }}
          >
            Today
          </button>
        </div>

        <button
          onClick={() => navigateMonth(1)}
          style={{
            padding: '0.625rem 1.25rem',
            background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.1), rgba(0, 136, 255, 0.05))',
            border: '1px solid var(--accent-primary)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            color: 'var(--accent-primary)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>Next</span>
          <span>→</span>
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '4rem',
          background: 'var(--secondary-bg)',
          borderRadius: '12px',
          border: '1px solid var(--secondary-border)'
        }}>
          <div style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Loading events...
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(255, 51, 102, 0.1)',
          borderRadius: '12px',
          border: '2px solid rgba(255, 51, 102, 0.3)',
          color: '#ff3366'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
          <div style={{ fontSize: '1rem', fontWeight: '600' }}>Error loading events</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.8 }}>{error}</div>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && !error && (
        <>
          {/* Day headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '0.5rem',
            marginBottom: '0.5rem'
          }}>
            {dayNames.map((day, index) => (
              <div
                key={index}
                style={{
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '0.5rem 0'
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
            gap: '0.5rem',
            background: 'var(--secondary-bg)',
            padding: '0.5rem',
            borderRadius: '12px',
            border: '1px solid var(--secondary-border)'
          }}>
            {calendarDays.map((day, index) => {
              const dayEvents = getEventsForDate(day.date);
              const today = isToday(day.date);

              return (
                <div
                  key={index}
                  style={{
                    background: today
                      ? 'rgba(20, 184, 166, 0.1)'
                      : day.isCurrentMonth
                        ? 'rgba(15, 23, 42, 0.5)'
                        : 'rgba(0, 0, 0, 0.2)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    cursor: dayEvents.length > 0 ? 'pointer' : 'default',
                    border: today ? '2px solid rgba(20, 184, 166, 0.5)' : '1px solid rgba(148, 163, 184, 0.1)',
                    minHeight: '100px',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Date number */}
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: today ? 700 : 600,
                    color: today
                      ? '#5eead4'
                      : day.isCurrentMonth
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                    marginBottom: '0.5rem'
                  }}>
                    {day.date.getDate()}
                  </div>

                  {/* Event indicators */}
                  {dayEvents.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      flex: 1
                    }}>
                      {dayEvents.slice(0, 3).map((event, i) => {
                        const config = eventTypes[event.source] || { icon: createIcon('default'), color: '#666' };
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.375rem',
                              padding: '0.25rem 0.5rem',
                              background: `${config.color}20`,
                              borderLeft: `3px solid ${config.color}`,
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={event.title}
                          >
                            <span style={{ flexShrink: 0 }}>{config.icon}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {event.title.substring(0, 20)}...
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          textAlign: 'center',
                          padding: '0.25rem'
                        }}>
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Mount component
const root = ReactDOM.createRoot(document.getElementById('weekly-calendar-root'));
root.render(React.createElement(MonthlyCalendar));
