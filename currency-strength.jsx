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
      style: { padding: '2rem', textAlign: 'center' }
    },
      React.createElement('h2', { style: { marginBottom: '1rem' }}, '💱 Currency Strength Analysis'),
      React.createElement('div', { className: 'loading-message' }, 'Loading currency strength data...')
    );
  }

  return React.createElement('div', {
    className: 'currency-strength-container',
    style: {
      background: 'rgba(15, 23, 42, 0.7)',
      borderRadius: '16px',
      padding: '1.5rem',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      boxShadow: '0 6px 15px rgba(0, 0, 0, 0.2)'
    }
  },
    // Header
    React.createElement('div', {
      className: 'strength-header',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }
    },
      React.createElement('h2', {
        style: {
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 700
        }
      }, '💱 Currency Strength Analysis'),
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
            background: 'rgba(37, 99, 235, 0.22)',
            border: '1px solid rgba(37, 99, 235, 0.4)',
            color: '#c7d2fe',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1
          }
        }, loading ? '⟳ Refreshing...' : '⟳ Refresh'),
        lastUpdate && React.createElement('span', {
          style: {
            fontSize: '0.85rem',
            color: 'rgba(226, 232, 240, 0.6)'
          }
        }, `Updated: ${lastUpdate}`)
      )
    ),

    // Error message
    error && React.createElement('div', {
      style: {
        color: '#ff6b6b',
        background: 'rgba(255, 107, 107, 0.1)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
        textAlign: 'center'
      }
    }, `⚠️ ${error}`),

    // Currency strength table
    React.createElement('div', {
      className: 'strength-table-wrapper',
      style: {
        overflowX: 'auto'
      }
    },
      strengthData.length === 0
        ? React.createElement('div', {
            style: {
              textAlign: 'center',
              padding: '2rem',
              color: 'rgba(226, 232, 240, 0.6)'
            }
          }, 'No currency strength data available')
        : React.createElement('table', {
            className: 'strength-table',
            style: {
              width: '100%',
              borderCollapse: 'collapse'
            }
          },
            // Table header
            React.createElement('thead', null,
              React.createElement('tr', {
                style: {
                  borderBottom: '2px solid rgba(148, 163, 184, 0.2)'
                }
              },
                React.createElement('th', {
                  style: {
                    textAlign: 'left',
                    padding: '1rem',
                    fontWeight: 700,
                    color: '#e2e8f0'
                  }
                }, 'Rank'),
                React.createElement('th', {
                  style: {
                    textAlign: 'left',
                    padding: '1rem',
                    fontWeight: 700,
                    color: '#e2e8f0'
                  }
                }, 'Currency'),
                React.createElement('th', {
                  style: {
                    textAlign: 'right',
                    padding: '1rem',
                    fontWeight: 700,
                    color: '#e2e8f0'
                  }
                }, 'Strength'),
                React.createElement('th', {
                  style: {
                    textAlign: 'right',
                    padding: '1rem',
                    fontWeight: 700,
                    color: '#e2e8f0'
                  }
                }, '7-Day Change'),
                React.createElement('th', {
                  style: {
                    textAlign: 'center',
                    padding: '1rem',
                    fontWeight: 700,
                    color: '#e2e8f0'
                  }
                }, 'Momentum')
              )
            ),
            // Table body
            React.createElement('tbody', null,
              strengthData.map((item, index) =>
                React.createElement('tr', {
                  key: item.currency,
                  style: {
                    borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                    transition: 'background 0.2s'
                  }
                },
                  React.createElement('td', {
                    style: {
                      padding: '1rem',
                      fontWeight: 600,
                      color: '#94a3b8'
                    }
                  }, `#${index + 1}`),
                  React.createElement('td', {
                    style: {
                      padding: '1rem',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      color: '#fff'
                    }
                  }, item.currency),
                  React.createElement('td', {
                    style: {
                      padding: '1rem',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: '#51c6e1'
                    }
                  }, item.strength.toFixed(2)),
                  React.createElement('td', {
                    style: {
                      padding: '1rem',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: getTrendColor(item.sevenDayChange)
                    }
                  }, `${item.sevenDayChange > 0 ? '+' : ''}${item.sevenDayChange.toFixed(2)}%`),
                  React.createElement('td', {
                    style: {
                      padding: '1rem',
                      textAlign: 'center'
                    }
                  },
                    React.createElement('span', {
                      style: {
                        background: `${getMomentumColor(item.momentum)}22`,
                        border: `1px solid ${getMomentumColor(item.momentum)}44`,
                        color: getMomentumColor(item.momentum),
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
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
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'rgba(100, 116, 139, 0.1)',
        borderRadius: '8px',
        fontSize: '0.85rem',
        color: 'rgba(226, 232, 240, 0.7)',
        lineHeight: 1.6
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
