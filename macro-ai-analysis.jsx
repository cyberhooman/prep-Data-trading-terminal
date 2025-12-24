function MacroAIAnalysis({ newsItems }) {
  const [analyses, setAnalyses] = React.useState(new Map());
  const [loading, setLoading] = React.useState(new Set());
  const [errors, setErrors] = React.useState(new Map());
  const [expandedItems, setExpandedItems] = React.useState(new Set());

  // Generate unique key for news item
  const getItemKey = (item) => {
    return `${item.headline}-${item.timestamp}`;
  };

  // Analyze a specific news item
  const analyzeItem = async (item) => {
    const itemKey = getItemKey(item);

    // Check if already analyzed
    if (analyses.has(itemKey)) {
      console.log('[MacroAI] Already analyzed:', item.headline);
      return;
    }

    // Validate economic data
    if (!item.economicData || !item.economicData.actual || !item.economicData.forecast) {
      const newErrors = new Map(errors);
      newErrors.set(itemKey, 'Missing economic data (actual/forecast required)');
      setErrors(newErrors);
      return;
    }

    // Set loading state
    const newLoading = new Set(loading);
    newLoading.add(itemKey);
    setLoading(newLoading);

    // Remove error
    const newErrors = new Map(errors);
    newErrors.delete(itemKey);
    setErrors(newErrors);

    try {
      console.log('[MacroAI] Analyzing:', item.headline);

      const response = await fetch('/api/analyze-market-surprise', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          headline: item.headline,
          economicData: item.economicData,
          tags: item.tags || [],
          timestamp: item.timestamp,
        }),
      });

      const data = await response.json();

      if (data.success && data.analysis) {
        // Store analysis
        const newAnalyses = new Map(analyses);
        newAnalyses.set(itemKey, data.analysis);
        setAnalyses(newAnalyses);

        // Auto-expand the analysis
        const newExpanded = new Set(expandedItems);
        newExpanded.add(itemKey);
        setExpandedItems(newExpanded);

        console.log('[MacroAI] Analysis complete:', data.analysis.verdict);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('[MacroAI] Analysis error:', err);
      const newErrors = new Map(errors);
      newErrors.set(itemKey, err.message || 'Failed to analyze');
      setErrors(newErrors);
    } finally {
      // Remove loading state
      const newLoading = new Set(loading);
      newLoading.delete(itemKey);
      setLoading(newLoading);
    }
  };

  // Toggle expanded state
  const toggleExpanded = (itemKey) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey);
    } else {
      newExpanded.add(itemKey);
    }
    setExpandedItems(newExpanded);
  };

  // Get verdict style
  const getVerdictStyle = (verdict) => {
    switch (verdict) {
      case 'Bullish Surprise':
        return {
          background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 255, 136, 0.08))',
          borderColor: '#00FF88',
          textColor: '#00FF88',
        };
      case 'Bearish Surprise':
        return {
          background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.15), rgba(255, 51, 102, 0.08))',
          borderColor: '#FF3366',
          textColor: '#FF3366',
        };
      case 'Neutral':
        return {
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03))',
          borderColor: '#51c6e1',
          textColor: '#51c6e1',
        };
      default: // Error
        return {
          background: 'linear-gradient(135deg, rgba(255, 179, 0, 0.15), rgba(255, 179, 0, 0.08))',
          borderColor: '#FFB800',
          textColor: '#FFB800',
        };
    }
  };

  // Get confidence stars
  const getConfidenceStars = (confidence) => {
    switch (confidence) {
      case 'High':
        return '⭐⭐⭐';
      case 'Medium':
        return '⭐⭐';
      case 'Low':
        return '⭐';
      default:
        return '⭐';
    }
  };

  // Filter news items with economic data
  const analyzableItems = newsItems.filter(
    item => item.economicData && item.economicData.actual && item.economicData.forecast
  );

  if (analyzableItems.length === 0) {
    return React.createElement('div', {
      style: {
        marginTop: '1.5rem',
        padding: '1.5rem',
        background: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '12px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        textAlign: 'center'
      }
    },
      React.createElement('svg', {
        width: '32',
        height: '32',
        viewBox: '0 0 512 512',
        style: { marginBottom: '0.5rem' }
      },
        React.createElement('path', { d: 'M256 52L468 444H44L256 52Z', fill: '#0B3C46' }),
        React.createElement('path', { d: 'M256 132L394 384H186L256 246L326 384H118L256 132Z', fill: '#c7d2fe' }),
        React.createElement('path', { d: 'M256 220L312 324H200L256 220Z', fill: '#0B3C46' })
      ),
      React.createElement('div', { style: { fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.6)' }},
        'No economic data available for AI analysis'
      )
    );
  }

  return React.createElement('div', {
    style: {
      marginTop: '1.5rem',
      background: 'rgba(15, 23, 42, 0.7)',
      borderRadius: '12px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      overflow: 'hidden',
      boxShadow: '0 6px 15px rgba(0, 0, 0, 0.2)'
    }
  },
    // Header
    React.createElement('div', {
      style: {
        padding: '1.25rem',
        borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
        background: 'linear-gradient(135deg, rgba(81, 198, 225, 0.15), rgba(81, 198, 225, 0.08))'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem' }
        },
          React.createElement('svg', {
            width: '24',
            height: '24',
            viewBox: '0 0 512 512',
            style: { flexShrink: 0 }
          },
            React.createElement('path', { d: 'M256 52L468 444H44L256 52Z', fill: '#0B3C46' }),
            React.createElement('path', { d: 'M256 132L394 384H186L256 246L326 384H118L256 132Z', fill: '#c7d2fe' }),
            React.createElement('path', { d: 'M256 220L312 324H200L256 220Z', fill: '#0B3C46' })
          ),
          React.createElement('h2', {
            style: {
              fontSize: '1.1rem',
              fontWeight: '700',
              color: '#fff',
              margin: 0
            }
          }, 'Macro-AI AlphaLabs')
        ),
        React.createElement('div', {
          style: {
            fontSize: '0.75rem',
            color: 'rgba(226, 232, 240, 0.6)',
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '0.375rem 0.75rem',
            borderRadius: '6px'
          }
        }, 'Policy Shift & Surprise Detection')
      )
    ),

    // Analysis Items
    React.createElement('div', { style: { padding: '0.65rem' }},
      analyzableItems.map((item) => {
        const itemKey = getItemKey(item);
        const analysis = analyses.get(itemKey);
        const isLoading = loading.has(itemKey);
        const error = errors.get(itemKey);
        const isExpanded = expandedItems.has(itemKey);

        return React.createElement('div', {
          key: itemKey,
          style: {
            marginBottom: '0.65rem',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }
        },
          // News Item Header
          React.createElement('div', {
            style: {
              padding: '0.65rem',
              borderBottom: analysis ? '1px solid rgba(148, 163, 184, 0.2)' : 'none'
            }
          },
            React.createElement('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '0.65rem',
                flexWrap: 'wrap'
              }
            },
              React.createElement('div', { style: { flex: 1, minWidth: '200px' }},
                React.createElement('div', {
                  style: {
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    color: '#fff',
                    marginBottom: '0.4rem',
                    lineHeight: '1.35'
                  }
                }, item.headline),
                item.economicData && React.createElement('div', {
                  style: {
                    fontSize: '0.7rem',
                    color: 'rgba(226, 232, 240, 0.7)',
                    display: 'flex',
                    gap: '0.65rem',
                    flexWrap: 'wrap'
                  }
                },
                  React.createElement('span', {},
                    'Actual: ',
                    React.createElement('strong', { style: { color: '#51c6e1' }}, item.economicData.actual)
                  ),
                  React.createElement('span', {},
                    'Forecast: ',
                    React.createElement('strong', { style: { color: '#fff' }}, item.economicData.forecast)
                  ),
                  item.economicData.previous && React.createElement('span', {},
                    'Previous: ',
                    React.createElement('strong', { style: { color: '#fff' }}, item.economicData.previous)
                  )
                )
              ),

              // Analyze Button
              !analysis && !isLoading && !error && React.createElement('button', {
                onClick: () => analyzeItem(item),
                style: {
                  padding: '0.4rem 0.75rem',
                  background: 'linear-gradient(135deg, rgba(81, 198, 225, 0.3), rgba(81, 198, 225, 0.15))',
                  border: '1px solid #51c6e1',
                  borderRadius: '5px',
                  color: '#51c6e1',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                },
                onMouseEnter: (e) => {
                  e.target.style.background = 'linear-gradient(135deg, rgba(81, 198, 225, 0.4), rgba(81, 198, 225, 0.2))';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(81, 198, 225, 0.3)';
                },
                onMouseLeave: (e) => {
                  e.target.style.background = 'linear-gradient(135deg, rgba(81, 198, 225, 0.3), rgba(81, 198, 225, 0.15))';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }
              }, '🔍 Analyze with AI')
            ),

            // Loading State
            isLoading && React.createElement('div', {
              style: {
                marginTop: '0.5rem',
                padding: '0.65rem',
                textAlign: 'center',
                background: 'rgba(81, 198, 225, 0.05)',
                borderRadius: '5px'
              }
            },
              React.createElement('div', {
                style: {
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(81, 198, 225, 0.2)',
                  borderTop: '2px solid #51c6e1',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 0.35rem'
                }
              }),
              React.createElement('div', {
                style: { fontSize: '0.75rem', color: '#7dd3fc', fontWeight: 600 }
              }, 'Analyzing market surprise...')
            ),

            // Error State
            error && React.createElement('div', {
              style: {
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: 'rgba(255, 51, 102, 0.1)',
                borderRadius: '5px',
                borderLeft: '3px solid #FF3366'
              }
            },
              React.createElement('div', {
                style: { fontSize: '0.75rem', color: '#FF3366', marginBottom: '0.4rem' }
              }, `⚠️ ${error}`),
              React.createElement('button', {
                onClick: () => analyzeItem(item),
                style: {
                  padding: '0.3rem 0.6rem',
                  background: 'rgba(255, 51, 102, 0.2)',
                  border: '1px solid #FF3366',
                  borderRadius: '4px',
                  color: '#FF3366',
                  fontSize: '0.7rem',
                  cursor: 'pointer'
                }
              }, 'Try Again')
            )
          ),

          // Analysis Result
          analysis && !analysis.error && React.createElement('div', {
            style: {
              ...getVerdictStyle(analysis.verdict),
              padding: '0.65rem',
              border: `2px solid ${getVerdictStyle(analysis.verdict).borderColor}`,
              borderRadius: '0 0 8px 8px'
            }
          },
            // Verdict Header
            React.createElement('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                cursor: 'pointer'
              },
              onClick: () => toggleExpanded(itemKey)
            },
              React.createElement('div', {},
                React.createElement('div', {
                  style: {
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: getVerdictStyle(analysis.verdict).textColor,
                    marginBottom: '0.2rem'
                  }
                },
                  (analysis.verdict === 'Bullish Surprise' ? '📈 ' : '') +
                  (analysis.verdict === 'Bearish Surprise' ? '📉 ' : '') +
                  (analysis.verdict === 'Neutral' ? '➡️ ' : '') +
                  analysis.verdict
                ),
                React.createElement('div', {
                  style: {
                    fontSize: '0.7rem',
                    color: 'rgba(226, 232, 240, 0.7)'
                  }
                }, `Confidence: ${getConfidenceStars(analysis.confidence)} ${analysis.confidence}`)
              ),
              React.createElement('div', {
                style: {
                  fontSize: '1.1rem',
                  color: 'rgba(226, 232, 240, 0.6)',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s'
                }
              }, '▼')
            ),

            // Expandable Details
            isExpanded && React.createElement('div', {
              style: {
                marginTop: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: `1px solid ${getVerdictStyle(analysis.verdict).borderColor}40`
              }
            },
              // Reasoning
              React.createElement('div', { style: { marginBottom: '0.5rem' }},
                React.createElement('div', {
                  style: {
                    fontSize: '0.65rem',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em'
                  }
                }, 'Reasoning:'),
                React.createElement('div', {
                  style: {
                    fontSize: '0.75rem',
                    color: 'rgba(226, 232, 240, 0.9)',
                    lineHeight: '1.4',
                    background: 'rgba(0, 0, 0, 0.2)',
                    padding: '0.5rem',
                    borderRadius: '5px'
                  }
                }, analysis.reasoning)
              ),

              // Key Factors
              analysis.keyFactors && analysis.keyFactors.length > 0 && React.createElement('div', {},
                React.createElement('div', {
                  style: {
                    fontSize: '0.65rem',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em'
                  }
                }, 'Key Factors:'),
                React.createElement('ul', {
                  style: {
                    margin: 0,
                    paddingLeft: '1.2rem',
                    fontSize: '0.75rem',
                    color: 'rgba(226, 232, 240, 0.9)',
                    lineHeight: '1.4'
                  }
                },
                  analysis.keyFactors.map((factor, idx) =>
                    React.createElement('li', {
                      key: idx,
                      style: { marginBottom: '0.2rem' }
                    }, factor)
                  )
                )
              ),

              // Timestamp
              React.createElement('div', {
                style: {
                  marginTop: '0.5rem',
                  fontSize: '0.65rem',
                  color: 'rgba(226, 232, 240, 0.5)',
                  textAlign: 'right'
                }
              },
                (analysis.cached ? '💾 ' : '') +
                `Analyzed: ${new Date(analysis.analyzedAt).toLocaleString()}`
              )
            )
          )
        );
      })
    )
  );
}
