function FinancialNewsFeed() {
  const [news, setNews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [lastUpdate, setLastUpdate] = React.useState('');
  const [analyzing, setAnalyzing] = React.useState({});
  const [analyses, setAnalyses] = React.useState({});

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);

      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

      const response = await fetch('/api/financial-news', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success) {
        // Filter to show critical news items AND items with sentiment indicators (market commentary)
        const criticalNews = data.data.filter(item => item.isCritical || item.sentiment);
        setNews(criticalNews);
        setLastUpdate(new Date(data.lastUpdated).toLocaleTimeString());
        if (criticalNews.length === 0 && data.source === 'failed') {
          setError('News source temporarily unavailable');
        }
      } else {
        setError('Failed to load news');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timeout - news source may be slow');
      } else {
        setError('Error fetching news feed');
      }
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

  const formatTimeAgo = (firstSeenAt) => {
    if (!firstSeenAt) return '';
    const now = Date.now();
    const diff = now - firstSeenAt;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days >= 1) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours >= 1) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes > 0 ? `${minutes} min ago` : 'Just now';
    }
  };

  const analyzeNewsItem = async (item, index) => {
    try {
      setAnalyzing(prev => ({ ...prev, [index]: true }));

      const response = await fetch('/api/financial-news/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newsItem: item })
      });

      const data = await response.json();

      if (data.success) {
        setAnalyses(prev => ({ ...prev, [index]: data.analysis }));
      } else {
        setAnalyses(prev => ({
          ...prev,
          [index]: {
            verdict: 'Error',
            reasoning: data.error || 'Analysis failed',
            error: true
          }
        }));
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalyses(prev => ({
        ...prev,
        [index]: {
          verdict: 'Error',
          reasoning: 'Failed to connect to AI service',
          error: true
        }
      }));
    } finally {
      setAnalyzing(prev => ({ ...prev, [index]: false }));
    }
  };

  const getVerdictColor = (verdict) => {
    if (verdict === 'Bullish Surprise' || verdict === 'Bullish') return '#10b981';
    if (verdict === 'Bearish Surprise' || verdict === 'Bearish') return '#ef4444';
    if (verdict === 'Neutral') return '#6b7280';
    return '#f59e0b';
  };

  const getVerdictEmoji = (verdict) => {
    if (verdict === 'Bullish Surprise' || verdict === 'Bullish') return '🚀';
    if (verdict === 'Bearish Surprise' || verdict === 'Bearish') return '📉';
    if (verdict === 'Neutral') return '➡️';
    return '⚠️';
  };

  if (loading && news.length === 0) {
    return React.createElement('div', { className: 'financial-news-feed loading', style: { padding: '2rem', textAlign: 'center' }},
      React.createElement('h2', {
        style: {
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          justifyContent: 'center'
        }
      },
        React.createElement('svg', {
          width: '20',
          height: '20',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: '#ef4444',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        },
          React.createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
        ),
        'Critical Market News'
      ),
      React.createElement('div', { className: 'news-loading' }, 'Loading critical news...')
    );
  }

  return React.createElement('div', {
    className: 'financial-news-feed',
    style: {
      background: 'var(--block)',
      borderRadius: '16px',
      padding: '1.5rem',
      border: '1px solid var(--border)',
      boxShadow: '0 6px 15px rgba(0, 0, 0, 0.1)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
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
        gap: '1rem',
        flexShrink: 0
      }
    },
      React.createElement('h2', {
        style: {
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }
      },
        React.createElement('svg', {
          width: '24',
          height: '24',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: '#ef4444',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { flexShrink: 0 }
        },
          React.createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
        ),
        'Critical Market News'
      ),
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
            color: 'var(--muted)'
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
        textAlign: 'center',
        flexShrink: 0
      }
    }, `⚠️ ${error}`),

    // News list
    React.createElement('div', {
      className: 'news-list',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        flex: 1,
        minHeight: 0,
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
          }, 'No high-impact market news at the moment')
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
                // Sentiment indicator (triangle)
                item.sentiment && React.createElement('span', {
                  style: {
                    fontSize: '0.85rem',
                    color: item.sentiment === 'bullish' ? '#10b981' : '#ef4444',
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center'
                  },
                  title: item.sentiment === 'bullish' ? 'Bullish' : 'Bearish'
                }, item.sentiment === 'bullish' ? '▲' : '▼'),
                React.createElement('h3', {
                  style: {
                    margin: 0,
                    fontSize: '1rem',
                    lineHeight: 1.4,
                    color: 'var(--text)',
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
                    letterSpacing: '0.5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }
                },
                  React.createElement('svg', {
                    width: '10',
                    height: '10',
                    viewBox: '0 0 24 24',
                    fill: 'currentColor',
                    stroke: 'none'
                  },
                    React.createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
                  ),
                  'CRITICAL'
                )
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
                    color: 'var(--muted)'
                  }
                },
                  'Actual: ',
                  React.createElement('strong', { style: { color: '#0891b2', marginLeft: '0.25rem' }}, item.economicData.actual)
                ),
                item.economicData.forecast && React.createElement('span', {
                  style: {
                    fontSize: '0.9rem',
                    color: 'var(--muted)'
                  }
                },
                  'Forecast: ',
                  React.createElement('strong', { style: { color: 'var(--text)', marginLeft: '0.25rem' }}, item.economicData.forecast)
                ),
                item.economicData.previous && React.createElement('span', {
                  style: {
                    fontSize: '0.9rem',
                    color: 'var(--muted)'
                  }
                },
                  'Previous: ',
                  React.createElement('strong', { style: { color: 'var(--text)', marginLeft: '0.25rem' }}, item.economicData.previous)
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
                    color: 'var(--muted)'
                  }
                }, formatTimestamp(item.timestamp)),
                item.firstSeenAt && React.createElement('span', {
                  style: {
                    fontSize: '0.75rem',
                    color: 'rgba(255, 107, 107, 0.7)',
                    background: 'rgba(255, 107, 107, 0.1)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }
                },
                  React.createElement('svg', {
                    width: '10',
                    height: '10',
                    viewBox: '0 0 24 24',
                    fill: 'currentColor',
                    stroke: 'none'
                  },
                    React.createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
                  ),
                  formatTimeAgo(item.firstSeenAt)
                ),
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
              ),

              // AI Analysis Button
              React.createElement('div', {
                style: {
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid rgba(148, 163, 184, 0.2)'
                }
              },
                !analyses[index] && (
                  analyzing[index] ?
                    React.createElement('div', {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '1rem',
                        background: 'rgba(99, 102, 241, 0.1)',
                        borderRadius: '12px',
                        border: '1px solid rgba(168, 85, 247, 0.3)'
                      }
                    },
                      React.createElement(TetrisLoader, {
                        size: 'sm',
                        speed: 'fast',
                        showLoadingText: true,
                        loadingText: 'AI analyzing market surprise...'
                      })
                    )
                  :
                    React.createElement('button', {
                      onClick: () => analyzeNewsItem(item, index),
                      disabled: false,
                      style: {
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.22) 100%)',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        color: '#c7d2fe',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }
                    },
                      React.createElement('svg', {
                        width: '16',
                        height: '16',
                        viewBox: '0 0 512 512',
                        style: { flexShrink: 0 }
                      },
                        React.createElement('path', { d: 'M256 52L468 444H44L256 52Z', fill: '#0B3C46' }),
                        React.createElement('path', { d: 'M256 132L394 384H186L256 246L326 384H118L256 132Z', fill: '#c7d2fe' }),
                        React.createElement('path', { d: 'M256 220L312 324H200L256 220Z', fill: '#0B3C46' })
                      ),
                      ' Analyze with AI'
                    )
                ),

                // AI Analysis Result
                analyses[index] && React.createElement('div', {
                  style: {
                    background: analyses[index].error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(168, 85, 247, 0.1)',
                    borderLeft: `3px solid ${getVerdictColor(analyses[index].verdict)}`,
                    borderRadius: '6px',
                    padding: '0.65rem'
                  }
                },
                  // Verdict Badge
                  React.createElement('div', {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem'
                    }
                  },
                    React.createElement('span', {
                      style: {
                        fontSize: '0.65rem',
                        color: 'rgba(226, 232, 240, 0.6)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }
                    },
                      React.createElement('svg', {
                        width: '10',
                        height: '10',
                        viewBox: '0 0 512 512',
                        style: { flexShrink: 0 }
                      },
                        React.createElement('path', { d: 'M256 52L468 444H44L256 52Z', fill: '#0B3C46' }),
                        React.createElement('path', { d: 'M256 132L394 384H186L256 246L326 384H118L256 132Z', fill: 'rgba(226, 232, 240, 0.6)' }),
                        React.createElement('path', { d: 'M256 220L312 324H200L256 220Z', fill: '#0B3C46' })
                      ),
                      'Policy Shift & Surprise Detection'
                    ),
                    React.createElement('span', {
                      style: {
                        background: getVerdictColor(analyses[index].verdict),
                        color: '#fff',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        letterSpacing: '0.3px'
                      }
                    }, `${getVerdictEmoji(analyses[index].verdict)} ${analyses[index].verdict.toUpperCase()}`)
                  ),

                  // Asset Impact (if available)
                  analyses[index].assetImpact && React.createElement('div', {
                    style: {
                      marginBottom: '0.5rem',
                      padding: '0.4rem',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      border: '1px solid rgba(148, 163, 184, 0.2)'
                    }
                  },
                    React.createElement('div', {
                      style: {
                        fontSize: '0.65rem',
                        color: 'rgba(226, 232, 240, 0.6)',
                        fontWeight: 600,
                        marginBottom: '0.35rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px'
                      }
                    }, 'Asset Impact:'),
                    React.createElement('div', {
                      style: {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.35rem'
                      }
                    },
                      ['USD', 'Stocks', 'Bonds', 'Gold'].map(asset => {
                        const sentiment = analyses[index].assetImpact[asset];
                        const color = sentiment === 'Bullish' ? '#10b981' :
                                     sentiment === 'Bearish' ? '#ef4444' : '#6b7280';
                        const icon = sentiment === 'Bullish' ? '📈' :
                                    sentiment === 'Bearish' ? '📉' : '➡️';

                        return React.createElement('div', {
                          key: asset,
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.2rem 0.4rem',
                            background: `${color}15`,
                            borderRadius: '3px',
                            border: `1px solid ${color}30`
                          }
                        },
                          React.createElement('span', {
                            style: {
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: 'rgba(226, 232, 240, 0.9)'
                            }
                          }, asset),
                          React.createElement('span', {
                            style: {
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              color: color,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }
                          },
                            React.createElement('span', null, icon),
                            React.createElement('span', null, sentiment)
                          )
                        );
                      })
                    )
                  ),

                  // Reasoning
                  React.createElement('p', {
                    style: {
                      margin: 0,
                      fontSize: '0.8rem',
                      lineHeight: 1.45,
                      color: 'rgba(226, 232, 240, 0.9)',
                      marginBottom: '0.5rem'
                    }
                  }, analyses[index].reasoning),

                  // Key Factors
                  analyses[index].keyFactors && analyses[index].keyFactors.length > 0 && React.createElement('div', {
                    style: {
                      marginTop: '0.5rem'
                    }
                  },
                    React.createElement('div', {
                      style: {
                        fontSize: '0.65rem',
                        color: 'rgba(226, 232, 240, 0.6)',
                        fontWeight: 600,
                        marginBottom: '0.35rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px'
                      }
                    }, 'Key Factors:'),
                    React.createElement('ul', {
                      style: {
                        margin: 0,
                        paddingLeft: '1rem',
                        fontSize: '0.75rem',
                        color: 'rgba(226, 232, 240, 0.8)',
                        lineHeight: 1.4
                      }
                    },
                      analyses[index].keyFactors.map((factor, i) =>
                        React.createElement('li', { key: i }, factor)
                      )
                    )
                  ),

                  // Re-analyze button or loading state
                  analyzing[index] ?
                    React.createElement('div', {
                      style: {
                        marginTop: '0.5rem',
                        display: 'flex',
                        justifyContent: 'center',
                        padding: '0.65rem',
                        background: 'rgba(99, 102, 241, 0.1)',
                        borderRadius: '6px',
                        border: '1px solid rgba(168, 85, 247, 0.3)'
                      }
                    },
                      React.createElement(TetrisLoader, {
                        size: 'sm',
                        speed: 'fast',
                        showLoadingText: true,
                        loadingText: 'Re-analyzing...'
                      })
                    )
                  :
                    React.createElement('button', {
                      onClick: () => analyzeNewsItem(item, index),
                      disabled: false,
                      style: {
                        marginTop: '0.5rem',
                        background: 'rgba(168, 85, 247, 0.15)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        color: '#c7d2fe',
                        padding: '0.3rem 0.6rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        transition: 'all 0.2s'
                      }
                    }, '⟳ Re-analyze')
                )
              )
            )
          )
    )
  );
}
