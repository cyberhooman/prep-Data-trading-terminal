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

  useEffect(() => {
    fetchNews();
    // Refresh every 2 minutes
    const interval = setInterval(fetchNews, 120000);
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
      <div className="financial-news-feed loading">
        <div className="news-header">
          <h2>📰 Market-Moving News</h2>
        </div>
        <div className="news-loading">Loading news feed...</div>
      </div>
    );
  }

  return (
    <div className="financial-news-feed">
      <div className="news-header">
        <h2>📰 Market-Moving News</h2>
        <div className="news-controls">
          <button onClick={fetchNews} className="refresh-btn" disabled={loading}>
            {loading ? '⟳ Refreshing...' : '⟳ Refresh'}
          </button>
          {lastUpdate && <span className="last-update">Updated: {lastUpdate}</span>}
        </div>
      </div>

      {error && (
        <div className="news-error">
          ⚠️ {error}
        </div>
      )}

      <div className="news-list">
        {news.length === 0 ? (
          <div className="no-news">No high-impact news at the moment</div>
        ) : (
          news.map((item, index) => (
            <div
              key={index}
              className={`news-item ${item.isCritical ? 'critical' : item.isActive ? 'active' : ''}`}
            >
              <div className="news-content">
                <h3 className="news-headline">
                  {item.headline}
                  {item.isCritical && <span className="critical-badge">CRITICAL</span>}
                </h3>

                {item.economicData && (
                  <div className="economic-data">
                    {item.economicData.actual && (
                      <span className="data-point actual">
                        Actual: <strong>{item.economicData.actual}</strong>
                      </span>
                    )}
                    {item.economicData.forecast && (
                      <span className="data-point forecast">
                        Forecast: <strong>{item.economicData.forecast}</strong>
                      </span>
                    )}
                    {item.economicData.previous && (
                      <span className="data-point previous">
                        Previous: <strong>{item.economicData.previous}</strong>
                      </span>
                    )}
                  </div>
                )}

                <div className="news-meta">
                  {item.timestamp && (
                    <span className="news-time">{formatTimestamp(item.timestamp)}</span>
                  )}
                  {item.tags.length > 0 && (
                    <div className="news-tags">
                      {item.tags.slice(0, 5).map((tag, i) => (
                        <span key={i} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .financial-news-feed {
          background: var(--card-bg, rgba(255, 255, 255, 0.05));
          border-radius: 12px;
          padding: 1.5rem;
          margin: 1rem 0;
        }

        .news-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .news-header h2 {
          margin: 0;
          font-size: 1.5rem;
          color: var(--text-primary, #fff);
        }

        .news-controls {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .refresh-btn {
          background: var(--accent-color, #51c6e1);
          color: #000;
          border: none;
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .refresh-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(81, 198, 225, 0.3);
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .last-update {
          font-size: 0.85rem;
          color: var(--text-secondary, rgba(255, 255, 255, 0.6));
        }

        .news-loading,
        .news-error,
        .no-news {
          text-align: center;
          padding: 2rem;
          color: var(--text-secondary, rgba(255, 255, 255, 0.6));
        }

        .news-error {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .news-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 600px;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .news-list::-webkit-scrollbar {
          width: 6px;
        }

        .news-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }

        .news-list::-webkit-scrollbar-thumb {
          background: var(--accent-color, #51c6e1);
          border-radius: 3px;
        }

        .news-item {
          background: rgba(255, 255, 255, 0.03);
          border-left: 3px solid transparent;
          border-radius: 8px;
          padding: 1rem;
          transition: all 0.2s;
        }

        .news-item:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateX(4px);
        }

        .news-item.critical {
          border-left-color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
        }

        .news-item.active {
          border-left-color: var(--accent-color, #51c6e1);
        }

        .news-headline {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
          line-height: 1.4;
          color: var(--text-primary, #fff);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .critical-badge {
          background: #ff6b6b;
          color: #fff;
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }

        .economic-data {
          display: flex;
          gap: 1rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .data-point {
          font-size: 0.9rem;
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        }

        .data-point strong {
          color: var(--text-primary, #fff);
          margin-left: 0.25rem;
        }

        .data-point.actual strong {
          color: #51c6e1;
        }

        .news-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .news-time {
          font-size: 0.85rem;
          color: var(--text-secondary, rgba(255, 255, 255, 0.5));
        }

        .news-tags {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .tag {
          background: rgba(81, 198, 225, 0.2);
          color: var(--accent-color, #51c6e1);
          font-size: 0.75rem;
          padding: 0.25rem 0.6rem;
          border-radius: 4px;
          font-weight: 500;
        }

        @media (max-width: 768px) {
          .financial-news-feed {
            padding: 1rem;
          }

          .news-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .news-header h2 {
            font-size: 1.25rem;
          }

          .news-list {
            max-height: 400px;
          }

          .economic-data {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
