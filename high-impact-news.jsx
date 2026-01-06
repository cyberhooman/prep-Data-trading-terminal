/**
 * High Impact News Page
 * Tracks market-moving events detected via keyword analysis
 * Separate from Critical Market News (which uses red marks from FinancialJuice)
 *
 * Keywords tracked:
 * - Supreme Court decisions, tariffs, executive orders
 * - Wars, military actions, sanctions
 * - Central bank decisions, rate decisions
 * - Bankruptcies, defaults, bailouts
 * - Emergency declarations, breaking news
 */

function HighImpactNews() {
  const [news, setNews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [lastUpdate, setLastUpdate] = React.useState('');
  const [analyzing, setAnalyzing] = React.useState({});
  const [analyses, setAnalyzes] = React.useState({});
  const [filter, setFilter] = React.useState('all'); // 'all', 'supreme-court', 'tariffs', 'war', 'cb-decision', etc.

  const fetchHighImpactNews = async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch('/api/financial-news/all', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success) {
        // Filter to show ONLY high-impact keyword detected items
        const highImpactNews = data.data.filter(item => item.isHighImpact);

        // Sort by timestamp (most recent first)
        highImpactNews.sort((a, b) => {
          return (b.firstSeenAt || 0) - (a.firstSeenAt || 0);
        });

        setNews(highImpactNews.slice(0, 100)); // Show up to 100 items
        setLastUpdate(new Date(data.lastUpdated).toLocaleTimeString());
      } else {
        setError('Failed to load high-impact news');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timeout');
      } else {
        setError('Error fetching high-impact news');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchHighImpactNews();
    // Refresh every 2 minutes
    const interval = setInterval(fetchHighImpactNews, 2 * 60 * 1000);
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
      return `${days}d ago`;
    } else if (hours >= 1) {
      return `${hours}h ago`;
    } else {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes}m ago`;
    }
  };

  const categorizeImpact = (headline) => {
    const lower = headline.toLowerCase();
    if (lower.includes('supreme court') || lower.includes('scotus') || lower.includes('court ruling')) {
      return { label: '⚖️ Supreme Court', color: '#FF6B6B' };
    } else if (lower.includes('tariff') || lower.includes('trade war')) {
      return { label: '📊 Tariff', color: '#FFA500' };
    } else if (lower.includes('executive order') || lower.includes('presidential decree')) {
      return { label: '🏛️ Executive', color: '#4ECDC4' };
    } else if (lower.includes('war') || lower.includes('military') || lower.includes('invasion')) {
      return { label: '💣 Military', color: '#FF0000' };
    } else if (lower.includes('central bank') || lower.includes('rate decision')) {
      return { label: '🏦 CB Decision', color: '#9D84B7' };
    } else if (lower.includes('bankruptcy') || lower.includes('default') || lower.includes('bailout')) {
      return { label: '📉 Financial', color: '#FF4757' };
    } else if (lower.includes('sanctions') || lower.includes('embargo')) {
      return { label: '⚡ Sanctions', color: '#FFD700' };
    } else if (lower.includes('emergency') || lower.includes('breaking')) {
      return { label: '🚨 Emergency', color: '#FF6348' };
    }
    return { label: '🔔 High Impact', color: '#A29BFE' };
  };

  const analyzeNews = async (newsId, headline) => {
    setAnalyzing(prev => ({ ...prev, [newsId]: true }));
    try {
      const response = await fetch('/api/analyze-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headline,
          type: 'high-impact'
        })
      });

      const data = await response.json();
      if (data.success) {
        setAnalyzes(prev => ({
          ...prev,
          [newsId]: data.analysis
        }));
      }
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setAnalyzing(prev => ({ ...prev, [newsId]: false }));
    }
  };

  return (
    <div style={{
      padding: '24px',
      background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
      minHeight: '100vh',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      color: '#e0e0e0'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '32px',
        borderBottom: '2px solid rgba(255, 107, 107, 0.3)',
        paddingBottom: '16px'
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#FF6B6B',
          margin: '0 0 8px 0',
          textShadow: '0 2px 8px rgba(255, 107, 107, 0.3)'
        }}>
          🚨 High Impact News
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#a0a0a0',
          margin: '0'
        }}>
          Market-moving events detected via keyword analysis • Last updated: {lastUpdate}
        </p>
      </div>

      {/* Status indicators */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#FF6B6B' }}>
            {news.length}
          </div>
          <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
            High Impact Items
          </div>
        </div>
        <div style={{
          background: 'rgba(157, 132, 183, 0.1)',
          border: '1px solid rgba(157, 132, 183, 0.3)',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#9D84B7' }}>
            {news.filter(n => n.headline.toLowerCase().includes('rate') || n.headline.toLowerCase().includes('central')).length}
          </div>
          <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
            CB Decisions
          </div>
        </div>
        <div style={{
          background: 'rgba(255, 165, 0, 0.1)',
          border: '1px solid rgba(255, 165, 0, 0.3)',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#FFA500' }}>
            {news.filter(n => n.headline.toLowerCase().includes('tariff')).length}
          </div>
          <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
            Tariff News
          </div>
        </div>
      </div>

      {/* Loading/Error states */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#a0a0a0'
        }}>
          Loading high-impact news...
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          color: '#FF6B6B',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* News list */}
      {!loading && news.length > 0 && (
        <div style={{ display: 'grid', gap: '12px' }}>
          {news.map((item, idx) => {
            const impact = categorizeImpact(item.headline);
            const analysis = analyses[item.headline];

            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${impact.color}40`,
                  borderLeft: `4px solid ${impact.color}`,
                  padding: '16px',
                  borderRadius: '8px',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = `${impact.color}80`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = `${impact.color}40`;
                }}
              >
                {/* Impact badge and headline */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px',
                  gap: '12px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'inline-block',
                      background: `${impact.color}30`,
                      color: impact.color,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      marginBottom: '8px'
                    }}>
                      {impact.label}
                    </div>
                    <h3 style={{
                      margin: '0',
                      fontSize: '15px',
                      fontWeight: '600',
                      color: '#ffffff',
                      lineHeight: '1.4'
                    }}>
                      {item.headline}
                    </h3>
                  </div>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#a0a0a0',
                        textDecoration: 'none',
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(160, 160, 160, 0.3)',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ffffff';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#a0a0a0';
                        e.currentTarget.style.borderColor = 'rgba(160, 160, 160, 0.3)';
                      }}
                    >
                      Read →
                    </a>
                  )}
                </div>

                {/* Meta info */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  fontSize: '12px',
                  color: '#a0a0a0',
                  marginBottom: '12px'
                }}>
                  {item.timestamp && (
                    <span>📅 {item.timestamp}</span>
                  )}
                  {item.firstSeenAt && (
                    <span>⏱️ {formatTimeAgo(item.firstSeenAt)}</span>
                  )}
                  {item.sentiment && (
                    <span style={{
                      color: item.sentiment === 'bullish' ? '#00ff00' : '#ff4757'
                    }}>
                      {item.sentiment === 'bullish' ? '📈 Bullish' : '📉 Bearish'}
                    </span>
                  )}
                </div>

                {/* Analysis button and result */}
                <div>
                  <button
                    onClick={() => analyzeNews(item.headline, item.headline)}
                    disabled={analyzing[item.headline]}
                    style={{
                      background: `${impact.color}30`,
                      color: impact.color,
                      border: `1px solid ${impact.color}60`,
                      padding: '6px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: analyzing[item.headline] ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!analyzing[item.headline]) {
                        e.currentTarget.style.background = `${impact.color}50`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${impact.color}30`;
                    }}
                  >
                    {analyzing[item.headline] ? '⏳ Analyzing...' : '🔍 Analyze'}
                  </button>

                  {analysis && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      borderLeft: `3px solid ${impact.color}`
                    }}>
                      {analysis.markdown ? (
                        <div dangerouslySetInnerHTML={{ __html: analysis.markdown }} />
                      ) : (
                        <>
                          <div><strong>Verdict:</strong> {analysis.verdict}</div>
                          {analysis.reasoning && (
                            <div style={{ marginTop: '8px' }}><strong>Analysis:</strong> {analysis.reasoning}</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && news.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#a0a0a0'
        }}>
          No high-impact news detected. Check back soon!
        </div>
      )}
    </div>
  );
}

// Make component globally available for React mounting
if (typeof window !== 'undefined') {
  window.HighImpactNews = HighImpactNews;
}
