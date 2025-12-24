function CurrencyStrength() {
  const [strengthData, setStrengthData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [lastUpdate, setLastUpdate] = React.useState('');

  const fetchCurrencyStrength = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/currency-strength');
      const data = await response.json();

      if (data.success) {
        setStrengthData(data.data || []);
        setLastUpdate(new Date(data.lastUpdated).toLocaleTimeString());
      } else {
        setError('Failed to load currency strength data');
      }
    } catch (err) {
      setError('Error fetching currency strength data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchCurrencyStrength();
    // Refresh every 4 hours (matching the cache timeout)
    const interval = setInterval(fetchCurrencyStrength, 4 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getMomentumColor = (momentum) => {
    const momentumColors = {
      'Strong Buy': '#22c55e',
      'Buy': '#84cc16',
      'Neutral': '#94a3b8',
      'Sell': '#fb923c',
      'Strong Sell': '#ef4444'
    };
    return momentumColors[momentum] || '#94a3b8';
  };

  const getTrendColor = (change) => {
    if (change > 0) return '#22c55e';
    if (change < 0) return '#ef4444';
    return '#94a3b8';
  };

  if (loading && strengthData.length === 0) {
    return React.createElement('div', {
      className: 'currency-strength-container loading',
      style: {
        padding: '2rem',
        textAlign: 'center',
        background: 'var(--block)',
        borderRadius: '16px',
        border: '1px solid var(--border)'
      }
    },
      React.createElement('h2', {
        style: {
          marginBottom: '1rem',
          color: 'var(--text)',
          fontSize: '1.5rem',
          fontWeight: 700
        }
      }, '💱 Currency Strength Analysis'),
      React.createElement('div', {
        className: 'loading-message',
        style: {
          color: 'var(--muted)'
        }
      }, 'Loading currency strength data...')
    );
  }

  return React.createElement('div', {
    className: 'currency-strength-container',
    style: {
      background: 'var(--block)',
      borderRadius: '16px',
      padding: '2rem',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      maxWidth: '1400px',
      margin: '0 auto'
    }
  },
    // Header
    React.createElement('div', {
      className: 'strength-header',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid var(--border)',
        flexWrap: 'wrap',
        gap: '1rem'
      }
    },
      React.createElement('h2', {
        style: {
          margin: 0,
          fontSize: '1.75rem',
          fontWeight: 700,
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }
      },
        React.createElement('span', null, '💱'),
        'Currency Strength Analysis'
      ),
      React.createElement('div', {
        className: 'strength-controls',
        style: {
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }
      },
        React.createElement('button', {
          onClick: fetchCurrencyStrength,
          disabled: loading,
          style: {
            background: '#3b82f6',
            border: 'none',
            color: '#ffffff',
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1
          }
        }, loading ? '⟳ Refreshing...' : '⟳ Refresh'),
        lastUpdate && React.createElement('span', {
          style: {
            fontSize: '0.85rem',
            color: 'var(--muted)',
            fontWeight: 500
          }
        }, `Updated: ${lastUpdate}`)
      )
    ),

    // Error message
    error && React.createElement('div', {
      style: {
        color: '#dc2626',
        background: 'rgba(239, 68, 68, 0.1)',
        borderRadius: '10px',
        padding: '1rem',
        marginBottom: '1.5rem',
        textAlign: 'center',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        fontWeight: 500
      }
    }, `⚠️ ${error}`),

    // Currency strength table
    React.createElement('div', {
      className: 'strength-table-wrapper',
      style: {
        overflowX: 'auto',
        background: 'var(--hover)',
        borderRadius: '12px',
        padding: '0.5rem'
      }
    },
      strengthData.length === 0
        ? React.createElement('div', {
            style: {
              textAlign: 'center',
              padding: '3rem',
              color: 'var(--muted)',
              fontSize: '1rem'
            }
          }, 'No currency strength data available')
        : React.createElement('table', {
            className: 'strength-table',
            style: {
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: '0 0.5rem'
            }
          },
            // Table header
            React.createElement('thead', null,
              React.createElement('tr', {
                style: {
                  background: 'var(--sidebar)'
                }
              },
                React.createElement('th', {
                  style: {
                    textAlign: 'left',
                    padding: '1rem 1.5rem',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderTopLeftRadius: '8px',
                    borderBottomLeftRadius: '8px'
                  }
                }, 'Rank'),
                React.createElement('th', {
                  style: {
                    textAlign: 'left',
                    padding: '1rem 1.5rem',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }
                }, 'Currency'),
                React.createElement('th', {
                  style: {
                    textAlign: 'right',
                    padding: '1rem 1.5rem',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }
                }, 'Strength'),
                React.createElement('th', {
                  style: {
                    textAlign: 'right',
                    padding: '1rem 1.5rem',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }
                }, '7-Day Change'),
                React.createElement('th', {
                  style: {
                    textAlign: 'center',
                    padding: '1rem 1.5rem',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderTopRightRadius: '8px',
                    borderBottomRightRadius: '8px'
                  }
                }, 'Momentum')
              )
            ),
            // Table body
            React.createElement('tbody', null,
              strengthData.map((item, index) =>
                React.createElement('tr', {
                  key: item.currency,
                  className: 'currency-row',
                  style: {
                    background: 'var(--block)',
                    transition: 'all 0.2s',
                    cursor: 'default'
                  }
                },
                  React.createElement('td', {
                    style: {
                      padding: '1.25rem 1.5rem',
                      fontWeight: 700,
                      color: 'var(--muted)',
                      fontSize: '0.95rem',
                      borderTopLeftRadius: '8px',
                      borderBottomLeftRadius: '8px'
                    }
                  }, `#${index + 1}`),
                  React.createElement('td', {
                    style: {
                      padding: '1.25rem 1.5rem',
                      fontWeight: 700,
                      fontSize: '1.2rem',
                      color: 'var(--text)',
                      letterSpacing: '0.02em'
                    }
                  }, item.currency),
                  React.createElement('td', {
                    style: {
                      padding: '1.25rem 1.5rem',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      color: '#3b82f6',
                      fontFamily: 'monospace'
                    }
                  }, item.strength.toFixed(2)),
                  React.createElement('td', {
                    style: {
                      padding: '1.25rem 1.5rem',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: getTrendColor(item.sevenDayChange),
                      fontFamily: 'monospace'
                    }
                  }, `${item.sevenDayChange > 0 ? '+' : ''}${item.sevenDayChange.toFixed(2)}%`),
                  React.createElement('td', {
                    style: {
                      padding: '1.25rem 1.5rem',
                      textAlign: 'center',
                      borderTopRightRadius: '8px',
                      borderBottomRightRadius: '8px'
                    }
                  },
                    React.createElement('span', {
                      style: {
                        background: `${getMomentumColor(item.momentum)}20`,
                        border: `1.5px solid ${getMomentumColor(item.momentum)}60`,
                        color: getMomentumColor(item.momentum),
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        display: 'inline-block',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em'
                      }
                    }, item.momentum)
                  )
                )
              )
            )
          )
    ),

    // Info footer
    React.createElement('div', {
      style: {
        marginTop: '2rem',
        padding: '1.25rem',
        background: 'var(--hover)',
        borderRadius: '10px',
        fontSize: '0.9rem',
        color: 'var(--muted)',
        lineHeight: 1.7,
        border: '1px solid var(--border)'
      }
    },
      React.createElement('p', { style: { margin: 0 }},
        '💡 Currency strength is calculated from 28 major currency pairs. ',
        'Rankings show relative performance over the past 7 days. ',
        'Data updates every 4 hours.'
      )
    )
  );
}

// Mount the component
const root = ReactDOM.createRoot(document.getElementById('currency-strength-root'));
root.render(React.createElement(CurrencyStrength));
