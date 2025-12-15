/**
 * Interest Rate Probability Component
 * Displays market-implied probabilities for central bank rate decisions
 * Updates every 4 hours with caching
 */

const InterestRateProbability = () => {
  const [probabilities, setProbabilities] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selectedBank, setSelectedBank] = React.useState('FED');
  const [isPaused, setIsPaused] = React.useState(false);

  const banks = [
    { code: 'FED', name: 'USD - Federal Reserve' },
    { code: 'ECB', name: 'EUR - ECB' },
    { code: 'BOE', name: 'GBP - Bank of England' },
    { code: 'BOC', name: 'CAD - Bank of Canada' },
    { code: 'RBA', name: 'AUD - RBA' },
    { code: 'BOJ', name: 'JPY - Bank of Japan' },
    { code: 'SNB', name: 'CHF - Swiss National Bank' },
    { code: 'RBNZ', name: 'NZD - RBNZ' }
  ];

  const flagEmojis = {
    'USD': '🇺🇸',
    'EUR': '🇪🇺',
    'GBP': '🇬🇧',
    'CAD': '🇨🇦',
    'AUD': '🇦🇺',
    'JPY': '🇯🇵',
    'CHF': '🇨🇭',
    'NZD': '🇳🇿'
  };

  // Fetch probabilities on mount and every 4 hours
  React.useEffect(() => {
    fetchProbabilities();

    const interval = setInterval(() => {
      if (!isPaused) {
        fetchProbabilities();
      }
    }, 4 * 60 * 60 * 1000); // 4 hours

    return () => clearInterval(interval);
  }, [isPaused]);

  const fetchProbabilities = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/interest-rates/probabilities');
      const data = await res.json();

      if (data.success) {
        setProbabilities(data.data);
      } else {
        setError('Failed to fetch probabilities');
      }
    } catch (err) {
      setError('Error fetching probabilities: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const formatTimeAgo = (dateStr) => {
    const now = new Date();
    const updated = new Date(dateStr);
    const diffMs = now - updated;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHrs < 1) return 'Just now';
    if (diffHrs === 1) return '1 hour ago';
    if (diffHrs < 24) return `${diffHrs} hours ago`;

    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  const getMoveColor = (move) => {
    if (move === 'Hike') return '#ef4444';
    if (move === 'Cut') return '#22c55e';
    return '#eab308';
  };

  const getTimelineBarColor = (expectedRate, currentRate) => {
    if (expectedRate > currentRate) return '#ef4444'; // Red for hike
    if (expectedRate < currentRate) return '#22c55e'; // Green for cut
    return '#eab308'; // Yellow for hold
  };

  const selectedData = probabilities[selectedBank];

  return (
    <div style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(15, 23, 42, 0.7)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ color: '#f1f5f9', margin: 0, fontSize: '1.2rem' }}>
          Interest Rate Probability
          {selectedData && (
            <span style={{ marginLeft: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>
              ({selectedData.currency})
            </span>
          )}
        </h2>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.85rem' }}
          >
            {banks.map(b => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>

          <button
            onClick={fetchProbabilities}
            disabled={loading}
            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.85rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          <button
            onClick={() => setIsPaused(!isPaused)}
            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: isPaused ? '#eab308' : '#64748b', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div style={{ padding: '0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !selectedData && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
          Loading interest rate probabilities...
        </div>
      )}

      {/* Main Content */}
      {selectedData && selectedData.isAvailable && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', gap: '1.5rem' }}>
          {/* Left Panel - Summary */}
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{flagEmojis[selectedData.currency]}</span>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Bank of</div>
                <div style={{ fontSize: '0.95rem', color: '#f1f5f9', fontWeight: 600 }}>
                  {selectedBank === 'FED' ? 'United States' : selectedBank === 'ECB' ? 'Eurozone' : selectedBank === 'BOE' ? 'England' : selectedBank === 'BOJ' ? 'Japan' : selectedBank === 'BOC' ? 'Canada' : selectedBank === 'RBA' ? 'Australia' : selectedBank === 'RBNZ' ? 'New Zealand' : 'Switzerland'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Next Expected Move:</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: getMoveColor(selectedData.nextExpectedMove) }}>
                {selectedData.nextExpectedMove}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Probability:</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>
                {Math.max(selectedData.probabilities.hike, selectedData.probabilities.hold, selectedData.probabilities.cut).toFixed(2)}%
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Current Rate:</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 600, color: '#f1f5f9' }}>
                {selectedData.currentRate}%
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Change By:</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: selectedData.expectedChange > 0 ? '#ef4444' : selectedData.expectedChange < 0 ? '#22c55e' : '#eab308' }}>
                {selectedData.expectedChange > 0 ? '+' : ''}{selectedData.expectedChange}%
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Next Meeting Date:</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9' }}>
                {formatDate(selectedData.nextMeeting)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '0.25rem' }}>Last Updated On:</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {formatTimeAgo(selectedData.lastUpdated)}
              </div>
            </div>
          </div>

          {/* Middle Panel - Probability Chart */}
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ color: '#f1f5f9', fontSize: '1rem', marginTop: 0, marginBottom: '1rem' }}>
              Probability Distribution
            </h3>

            {/* Hike */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Hike (+25bps)</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{selectedData.probabilities.hike.toFixed(1)}%</span>
              </div>
              <div style={{ position: 'relative', height: '32px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', overflow: 'hidden' }}>
                {selectedData.weekAgoData && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${selectedData.weekAgoData.probabilities.hike}%`,
                      background: 'rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px'
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${selectedData.probabilities.hike}%`,
                    background: '#ef4444',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff'
                  }}
                >
                  {selectedData.probabilities.hike > 10 && `${selectedData.probabilities.hike.toFixed(1)}%`}
                </div>
              </div>
            </div>

            {/* Hold */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Hold (0bps)</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{selectedData.probabilities.hold.toFixed(1)}%</span>
              </div>
              <div style={{ position: 'relative', height: '32px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', overflow: 'hidden' }}>
                {selectedData.weekAgoData && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${selectedData.weekAgoData.probabilities.hold}%`,
                      background: 'rgba(234, 179, 8, 0.3)',
                      borderRadius: '6px'
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${selectedData.probabilities.hold}%`,
                    background: '#eab308',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff'
                  }}
                >
                  {selectedData.probabilities.hold > 10 && `${selectedData.probabilities.hold.toFixed(1)}%`}
                </div>
              </div>
            </div>

            {/* Cut */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Cut (-25bps)</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{selectedData.probabilities.cut.toFixed(1)}%</span>
              </div>
              <div style={{ position: 'relative', height: '32px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', overflow: 'hidden' }}>
                {selectedData.weekAgoData && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${selectedData.weekAgoData.probabilities.cut}%`,
                      background: 'rgba(34, 197, 94, 0.3)',
                      borderRadius: '6px'
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${selectedData.probabilities.cut}%`,
                    background: '#22c55e',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '0.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff'
                  }}
                >
                  {selectedData.probabilities.cut > 10 && `${selectedData.probabilities.cut.toFixed(1)}%`}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '2px' }}></div>
                <span style={{ color: '#94a3b8' }}>Current</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '12px', height: '12px', background: 'rgba(239, 68, 68, 0.3)', borderRadius: '2px' }}></div>
                <span style={{ color: '#94a3b8' }}>A Week Ago</span>
              </div>
            </div>

            {/* Data Source */}
            <div style={{ marginTop: '1rem', padding: '0.5rem', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '4px', fontSize: '0.7rem', color: '#64748b' }}>
              Source: {selectedData.dataSource}
            </div>
          </div>

          {/* Right Panel - Rate Timeline */}
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ color: '#f1f5f9', fontSize: '1rem', marginTop: 0, marginBottom: '1rem' }}>
              Expected Rate Path
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {selectedData.timeline && selectedData.timeline.slice(0, 8).map((meeting, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDate(meeting.date)}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>{meeting.expectedRate}%</span>
                  </div>
                  <div style={{ height: '24px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: `${(meeting.expectedRate / selectedData.currentRate) * 100}%`,
                        background: getTimelineBarColor(meeting.expectedRate, selectedData.currentRate),
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Data Unavailable State */}
      {selectedData && !selectedData.isAvailable && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Data Temporarily Unavailable</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
            Next meeting: {formatDate(selectedData.nextMeeting)}
          </div>
          <button
            onClick={fetchProbabilities}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.9rem', cursor: 'pointer' }}
          >
            Check Again
          </button>
        </div>
      )}

      {/* Stale Data Warning */}
      {selectedData && selectedData.isStale && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '6px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#fbbf24', fontSize: '0.85rem' }}>
          Data may be outdated (last updated: {formatTimeAgo(selectedData.lastUpdated)})
        </div>
      )}
    </div>
  );
};

// Render component
const rootElement = document.getElementById('interest-rate-root');
if (rootElement) {
  ReactDOM.render(<InterestRateProbability />, rootElement);
}
