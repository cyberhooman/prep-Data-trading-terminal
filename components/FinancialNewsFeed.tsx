'use client';

import { useState, useEffect } from 'react';

interface EconomicData {
  actual?: string;
  forecast?: string;
  previous?: string;
}

interface NewsItem {
  headline: string;
  timestamp: string | null;
  economicData: EconomicData | null;
  tags: string[];
  hasChart: boolean;
  link: string | null;
  isCritical: boolean;
  isActive: boolean;
  scrapedAt: string;
}

interface NewsResponse {
  success: boolean;
  count: number;
  data: NewsItem[];
  lastUpdated: string;
}

export default function FinancialNewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/financial-news');
      const data: NewsResponse = await response.json();

      if (data.success) {
        const criticalNews = data.data.filter(item => item.isCritical);
        setNews(criticalNews);
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

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000); // 5 min (reduced CPU)
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp: string | null) => {
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
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.6)' }}>
        Loading critical news...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '100%',
      minHeight: 0
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        flexShrink: 0,
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Critical Market News
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={fetchNews}
            disabled={loading}
            style={{
              background: '#51c6e1',
              color: '#000',
              border: 'none',
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.75rem',
              opacity: loading ? 0.6 : 1,
              whiteSpace: 'nowrap',
              minHeight: '32px'
            }}
          >
            {loading ? '⟳ Refreshing...' : '⟳ Refresh'}
          </button>
          {lastUpdate && (
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
              Updated: {lastUpdate}
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: '#ff6b6b',
          background: 'rgba(255,107,107,0.1)',
          borderRadius: '8px',
          padding: '0.75rem',
          margin: '0.75rem 1rem',
          textAlign: 'center',
          fontSize: '0.875rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* News List - fills remaining space */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem 0.75rem',
        paddingRight: '0.5rem',
        minHeight: 0
      }}
      className="custom-scrollbar">
        {news.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
            No critical market news at the moment
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {news.map((item, index) => (
              <div
                key={index}
                style={{
                  background: item.isCritical ? 'rgba(255,107,107,0.1)' : 'rgba(255,255,255,0.03)',
                  borderLeft: `3px solid ${item.isCritical ? '#ff6b6b' : item.isActive ? '#51c6e1' : 'transparent'}`,
                  borderRadius: '8px',
                  padding: '0.75rem'
                }}
              >
                {/* Headline */}
                <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, color: '#fff', flex: '1 1 auto', minWidth: 0, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                    {item.headline}
                  </h3>
                  {item.isCritical && (
                    <span style={{
                      background: '#ff6b6b',
                      color: '#fff',
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      letterSpacing: '0.5px',
                      flexShrink: 0
                    }}>
                      CRITICAL
                    </span>
                  )}
                </div>

                {/* Economic Data */}
                {item.economicData && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                    {item.economicData.actual && (
                      <span style={{ color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                        Actual: <strong style={{ color: '#51c6e1', marginLeft: '0.15rem' }}>{item.economicData.actual}</strong>
                      </span>
                    )}
                    {item.economicData.forecast && (
                      <span style={{ color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                        Forecast: <strong style={{ color: '#fff', marginLeft: '0.15rem' }}>{item.economicData.forecast}</strong>
                      </span>
                    )}
                    {item.economicData.previous && (
                      <span style={{ color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                        Previous: <strong style={{ color: '#fff', marginLeft: '0.15rem' }}>{item.economicData.previous}</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {item.timestamp && (
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                      {formatTimestamp(item.timestamp)}
                    </span>
                  )}
                  {item.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {item.tags.slice(0, 5).map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            background: 'rgba(81,198,225,0.2)',
                            color: '#51c6e1',
                            fontSize: '0.7rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 500
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
