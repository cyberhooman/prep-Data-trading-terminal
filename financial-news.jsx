function FinancialNewsFeed() {
  const [news, setNews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [lastUpdate, setLastUpdate] = React.useState('');

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/financial-news');
      const data = await response.json();

      if (data.success) {
        setNews(data.data);
        setLastUpdate(new Date(data.lastUpdated).toLocaleTimeString());
      } else {
        setError('Failed to load news');
      }
    } catch (err) {
      setError('Error fetching news feed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchNews();
    // Refresh every 2 minutes
    const interval = setInterval(fetchNews, 120000);
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  if (loading && news.length === 0) {
    return React.createElement('div', { className: 'financial-news-feed loading', style: { padding: '2rem', textAlign: 'center' }},
      React.createElement('h2', { style: { marginBottom: '1rem' }}, '🔴 Critical Market News'),
      React.createElement('div', { className: 'news-loading' }, 'Loading critical news...')
    );
  }

  return React.createElement('div', {
    className: 'financial-news-feed',
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
      className: 'news-header',
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
      }, '🔴 Critical Market News'),
      React.createElement('div', {
        className: 'news-controls',
        style: {
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }
      },
        React.createElement('button', {
          onClick: fetchNews,
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

    // News list
    React.createElement('div', {
      className: 'news-list',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxHeight: '600px',
        overflowY: 'auto',
        paddingRight: '0.5rem'
      }
    },
      news.length === 0
        ? React.createElement('div', {
            style: {
              textAlign: 'center',
              padding: '2rem',
              color: 'rgba(226, 232, 240, 0.6)'
            }
          }, 'No red-bordered critical news at the moment')
        : news.map((item, index) =>
            React.createElement('div', {
              key: index,
              className: `news-item ${item.isCritical ? 'critical' : item.isActive ? 'active' : ''}`,
              style: {
                background: item.isCritical ? 'rgba(255, 107, 107, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                borderLeft: `3px solid ${item.isCritical ? '#ff6b6b' : item.isActive ? '#51c6e1' : 'transparent'}`,
                borderRadius: '8px',
                padding: '1rem',
                transition: 'all 0.2s'
              }
            },
              // Headline
              React.createElement('div', {
                style: {
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap'
                }
              },
                React.createElement('h3', {
                  style: {
                    margin: 0,
                    fontSize: '1rem',
                    lineHeight: 1.4,
                    color: '#fff',
                    flex: 1
                  }
                }, item.headline),
                item.isCritical && React.createElement('span', {
                  style: {
                    background: '#ff6b6b',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    letterSpacing: '0.5px'
                  }
                }, '🔴 CRITICAL')
              ),

              // Economic Data
              item.economicData && React.createElement('div', {
                style: {
                  display: 'flex',
                  gap: '1rem',
                  marginBottom: '0.75rem',
                  flexWrap: 'wrap'
                }
              },
                item.economicData.actual && React.createElement('span', {
                  style: {
                    fontSize: '0.9rem',
                    color: 'rgba(226, 232, 240, 0.7)'
                  }
                },
                  'Actual: ',
                  React.createElement('strong', { style: { color: '#51c6e1', marginLeft: '0.25rem' }}, item.economicData.actual)
                ),
                item.economicData.forecast && React.createElement('span', {
                  style: {
                    fontSize: '0.9rem',
                    color: 'rgba(226, 232, 240, 0.7)'
                  }
                },
                  'Forecast: ',
                  React.createElement('strong', { style: { color: '#fff', marginLeft: '0.25rem' }}, item.economicData.forecast)
                ),
                item.economicData.previous && React.createElement('span', {
                  style: {
                    fontSize: '0.9rem',
                    color: 'rgba(226, 232, 240, 0.7)'
                  }
                },
                  'Previous: ',
                  React.createElement('strong', { style: { color: '#fff', marginLeft: '0.25rem' }}, item.economicData.previous)
                )
              ),

              // Metadata (timestamp and tags)
              React.createElement('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }
              },
                item.timestamp && React.createElement('span', {
                  style: {
                    fontSize: '0.85rem',
                    color: 'rgba(226, 232, 240, 0.5)'
                  }
                }, formatTimestamp(item.timestamp)),
                item.tags.length > 0 && React.createElement('div', {
                  style: {
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap'
                  }
                },
                  item.tags.slice(0, 5).map((tag, i) =>
                    React.createElement('span', {
                      key: i,
                      style: {
                        background: 'rgba(81, 198, 225, 0.2)',
                        color: '#51c6e1',
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '4px',
                        fontWeight: 500
                      }
                    }, tag)
                  )
                )
              )
            )
          )
    )
  );
}
