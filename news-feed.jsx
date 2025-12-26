/**
 * News Feed Component
 * Displays financial news from Finnhub API
 */

const NewsFeed = () => {
  const [news, setNews] = React.useState({
    general: [],
    forex: [],
    crypto: [],
    all: []
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const fetchNews = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/news-feed/all');
      const data = await response.json();

      if (data.success) {
        setNews(data.data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch news');
      }
    } catch (err) {
      console.error('Error fetching news:', err);
      setError('Failed to fetch news. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchNews();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getCategoryColor = (category) => {
    switch (category?.toLowerCase()) {
      case 'forex':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'crypto':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'merger':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const tabs = [
    { id: 'all', label: 'All News', icon: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' },
    { id: 'general', label: 'General', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { id: 'forex', label: 'Forex', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { id: 'crypto', label: 'Crypto', icon: 'M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727' }
  ];

  const getFilteredNews = () => {
    let items = activeTab === 'all' ? news.all : news[activeTab] || [];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.title?.toLowerCase().includes(query) ||
        item.summary?.toLowerCase().includes(query) ||
        item.source?.toLowerCase().includes(query)
      );
    }

    return items;
  };

  const filteredNews = getFilteredNews();

  if (loading && news.all.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <TetrisLoader />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pb-16">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-notion-text font-display mb-2">
          News Feed
        </h1>
        <p className="text-notion-muted text-sm">
          Real-time financial news from Finnhub.io
        </p>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-notion-sidebar rounded-lg p-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'text-notion-muted hover:text-notion-text hover:bg-notion-hover'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={tab.icon} />
              </svg>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                activeTab === tab.id
                  ? 'bg-white/20'
                  : 'bg-notion-block'
              }`}>
                {tab.id === 'all' ? news.all?.length || 0 : news[tab.id]?.length || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search news..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:w-64 px-4 py-2 pl-10 bg-notion-sidebar border border-notion-border rounded-lg text-notion-text placeholder-notion-muted focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-notion-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={fetchNews}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-notion-sidebar border border-notion-border rounded-lg text-notion-muted hover:text-notion-text hover:bg-notion-hover transition-all disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        </div>
      )}

      {/* News Grid */}
      {filteredNews.length === 0 ? (
        <div className="text-center py-12 text-notion-muted">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-lg font-medium mb-1">No news found</p>
          <p className="text-sm">
            {searchQuery ? 'Try a different search term' : 'News will appear here when available'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredNews.map((article, index) => (
            <a
              key={article.id || index}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block bg-notion-sidebar border border-notion-border rounded-xl overflow-hidden hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300"
            >
              {/* Image */}
              {article.image && (
                <div className="relative h-40 overflow-hidden bg-notion-block">
                  <img
                    src={article.image}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-notion-sidebar/80 to-transparent" />
                </div>
              )}

              {/* Content */}
              <div className="p-4">
                {/* Category & Time */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs px-2 py-1 rounded border ${getCategoryColor(article.category)}`}>
                    {article.category || 'General'}
                  </span>
                  <span className="text-xs text-notion-muted">
                    {formatTimeAgo(article.timestamp)}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-notion-text font-semibold mb-2 line-clamp-2 group-hover:text-indigo-400 transition-colors">
                  {article.title}
                </h3>

                {/* Summary */}
                {article.summary && (
                  <p className="text-notion-muted text-sm line-clamp-3 mb-3">
                    {article.summary}
                  </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-notion-border">
                  <span className="text-xs text-notion-muted flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    {article.source}
                  </span>
                  <span className="text-xs text-indigo-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Read more
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>

                {/* Related Symbols */}
                {article.related && (
                  <div className="mt-3 pt-3 border-t border-notion-border">
                    <div className="flex flex-wrap gap-1">
                      {article.related.split(',').slice(0, 5).map((symbol, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-notion-block rounded text-notion-muted"
                        >
                          {symbol.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* API Key Notice */}
      {news.all.length > 0 && news.all[0]?.source === 'System' && (
        <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <h4 className="text-amber-400 font-medium mb-1">Finnhub API Key Required</h4>
              <p className="text-amber-400/70 text-sm">
                Add your free Finnhub API key to the environment variables to see live financial news.
                Get your free key at <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">finnhub.io</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
