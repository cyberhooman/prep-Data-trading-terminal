/**
 * Weekly Calendar Component - Enhanced UI
 * Displays events in a 7-day calendar grid (Monday-Sunday)
 * Features: Event filtering, impact badges, improved UX
 */

const { useState, useEffect, useMemo } = React;

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

// Event type configuration
const eventTypes = {
  'forex': { icon: '💱', label: 'Economic', color: '#FF3366' },
  'economic': { icon: '📊', label: 'Economic', color: '#FF3366' },
  'cb_speech': { icon: '🎤', label: 'CB Speech', color: '#00D9FF' },
  'trump_schedule': { icon: '🏛️', label: 'Trump', color: '#FFB800' }
};

function WeeklyCalendar() {
  const [events, setEvents] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(getWeekDays());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilters, setSelectedFilters] = useState(['forex', 'economic', 'cb_speech', 'trump_schedule']);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'day'

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

  // Get events for a specific day (filtered)
  function getEventsForDay(day) {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
      const eventDate = new Date(event.date);
      const inDateRange = eventDate >= dayStart && eventDate <= dayEnd;
      const matchesFilter = selectedFilters.includes(event.source);
      return inDateRange && matchesFilter;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Toggle filter
  function toggleFilter(filterType) {
    setSelectedFilters(prev =>
      prev.includes(filterType)
        ? prev.filter(f => f !== filterType)
        : [...prev, filterType]
    );
  }

  // Get event count for the week
  const eventCounts = useMemo(() => {
    const counts = { forex: 0, economic: 0, cb_speech: 0, trump_schedule: 0 };
    events.forEach(event => {
      if (counts.hasOwnProperty(event.source)) {
        counts[event.source]++;
      }
    });
    return counts;
  }, [events]);

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
    <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📅</span>
              Weekly Calendar
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
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                style={{
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
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  if (!isActive) e.currentTarget.style.opacity = '0.6';
                }}
              >
                <span>{config.icon}</span>
                <span>{config.label}</span>
                <span style={{
                  background: isActive ? config.color : 'var(--text-muted)',
                  color: '#0B0F19',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: '700'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Week Navigation */}
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
          onClick={() => navigateWeek(-1)}
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
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateX(-2px)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 217, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.boxShadow = 'none';
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
            {formatDayHeader(currentWeek[0]).month} {currentWeek[0].getDate()} - {formatDayHeader(currentWeek[6]).month} {currentWeek[6].getDate()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {currentWeek[0].getFullYear()}
          </div>
        </div>

        <button
          onClick={() => navigateWeek(1)}
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
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateX(2px)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 217, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.boxShadow = 'none';
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
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid rgba(0, 217, 255, 0.2)',
            borderTop: '4px solid var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
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
        <div className="weekly-calendar">
          {currentWeek.map((day, index) => {
            const dayHeader = formatDayHeader(day);
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div
                key={index}
                className={`calendar-day ${today ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}
                style={{
                  position: 'relative',
                  opacity: dayEvents.length === 0 ? 0.7 : 1
                }}
              >
                {/* Day Header */}
                <div className="calendar-day-header" style={{
                  position: 'relative',
                  paddingTop: today ? '2rem' : '0.5rem'
                }}>
                  {today && (
                    <div style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      color: 'var(--accent-primary)',
                      background: 'rgba(0, 217, 255, 0.15)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      letterSpacing: '0.05em'
                    }}>
                      TODAY
                    </div>
                  )}

                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: today ? 'var(--accent-primary)' : 'var(--text-muted)'
                  }}>
                    {dayHeader.dayName}
                  </div>

                  <div style={{
                    fontSize: '1.75rem',
                    fontWeight: '700',
                    marginTop: '0.25rem',
                    color: today ? 'var(--accent-primary)' : 'var(--text-primary)'
                  }}>
                    {dayHeader.date}
                  </div>

                  <div style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.25rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {dayHeader.month}
                  </div>

                  {/* Event count badge */}
                  {dayEvents.length > 0 && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      background: today ? 'rgba(0, 217, 255, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      color: today ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      textAlign: 'center'
                    }}>
                      {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
                    </div>
                  )}
                </div>

                {/* Events for this day */}
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {dayEvents.length === 0 ? (
                    <div style={{
                      padding: '2rem 1rem',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      opacity: 0.5
                    }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</div>
                      <div>No events</div>
                    </div>
                  ) : (
                    dayEvents.map((event, eventIndex) => {
                      const eventConfig = eventTypes[event.source] || { icon: '📌', color: '#666' };

                      return (
                        <div
                          key={eventIndex}
                          className="calendar-event-item"
                          onClick={() => setSelectedEvent(event)}
                          style={{
                            borderLeftColor: eventConfig.color,
                            borderLeftWidth: '4px',
                            position: 'relative',
                            cursor: 'pointer'
                          }}
                        >
                          {/* Event header with time and flag */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '0.375rem'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                fontFamily: 'monospace',
                                color: eventConfig.color,
                                background: `${eventConfig.color}20`,
                                padding: '0.125rem 0.375rem',
                                borderRadius: '4px'
                              }}>
                                {formatTime(event.date)}
                              </span>

                              <span style={{ fontSize: '0.85rem' }}>
                                {eventConfig.icon}
                              </span>
                            </div>

                            <span style={{ fontSize: '1.1rem' }}>
                              {flagEmojis[event.country] || '🌐'}
                            </span>
                          </div>

                          {/* Event title */}
                          <div style={{
                            fontSize: '0.8rem',
                            lineHeight: '1.4',
                            color: 'var(--text-primary)',
                            fontWeight: '500',
                            marginBottom: event.location ? '0.25rem' : 0
                          }}>
                            {event.title}
                          </div>

                          {/* Event location */}
                          {event.location && (
                            <div style={{
                              fontSize: '0.65rem',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <span>📍</span>
                              <span>{event.location}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && !error && (
        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.03), rgba(0, 136, 255, 0.02))',
          borderRadius: '12px',
          border: '1px solid var(--secondary-border)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <h3 style={{
              fontSize: '0.9rem',
              fontWeight: '700',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Event Types
            </h3>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem'
          }}>
            {Object.entries(eventTypes).filter(([key]) => key !== 'forex').map(([key, config]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  background: `${config.color}10`,
                  borderRadius: '8px',
                  border: `1px solid ${config.color}30`
                }}
              >
                <div style={{
                  width: '4px',
                  height: '32px',
                  background: config.color,
                  borderRadius: '2px'
                }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '0.125rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>{config.icon}</span>
                    <span>{config.label}</span>
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)'
                  }}>
                    {key === 'economic' ? 'High-impact economic data releases' :
                     key === 'cb_speech' ? 'Central bank official speeches' :
                     key === 'trump_schedule' ? 'Presidential schedule events' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Tips */}
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            borderLeft: '3px solid var(--accent-primary)'
          }}>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              lineHeight: '1.6'
            }}>
              <strong style={{ color: 'var(--accent-primary)' }}>💡 Tip:</strong> Click on event cards for more details. Use the filters above to show or hide specific event types. Events are automatically updated in real-time.
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
