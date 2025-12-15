/**
 * CB Speech Analysis Component
 * Auto-fetches latest G8 central bank speeches and analyzes dovish/hawkish sentiment
 */

const CBSpeechAnalysis = () => {
  const [speeches, setSpeeches] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [filterBank, setFilterBank] = React.useState('ALL');
  const [filterType, setFilterType] = React.useState('ALL');
  const [analyzedSpeeches, setAnalyzedSpeeches] = React.useState({});

  const banks = [
    { code: 'ALL', name: 'All Banks' },
    { code: 'FED', name: 'USD - Federal Reserve' },
    { code: 'ECB', name: 'EUR - ECB' },
    { code: 'BOE', name: 'GBP - Bank of England' },
    { code: 'BOC', name: 'CAD - Bank of Canada' },
    { code: 'RBA', name: 'AUD - RBA' },
    { code: 'BOJ', name: 'JPY - Bank of Japan' },
    { code: 'SNB', name: 'CHF - Swiss National Bank' },
    { code: 'RBNZ', name: 'NZD - RBNZ' }
  ];

  const contentTypes = [
    { code: 'ALL', name: 'All Types' },
    { code: 'speech', name: 'Speeches' },
    { code: 'press_conference', name: 'Press Conferences' }
  ];

  // Load saved analyses from localStorage
  React.useEffect(() => {
    const saved = localStorage.getItem('cbAnalyzedSpeeches');
    if (saved) {
      try {
        setAnalyzedSpeeches(JSON.parse(saved));
      } catch (e) {}
    }
    fetchSpeeches();
  }, []);

  // Fetch speeches from API
  const fetchSpeeches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/speeches');
      const data = await res.json();
      if (data.success) {
        setSpeeches(data.data);
      } else {
        setError('Failed to fetch speeches');
      }
    } catch (err) {
      setError('Error fetching speeches: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-analyze a speech using text from Financial Juice
  const analyzeSpeech = async (speech) => {
    setAnalyzing(speech.id);
    setError(null);

    try {
      const res = await fetch('/api/speeches/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: speech.title,
          description: speech.description,
          speaker: speech.speaker,
          centralBank: speech.centralBank,
          bankCode: speech.bankCode,
          date: speech.date
        })
      });

      const data = await res.json();

      if (data.success) {
        const newAnalyzed = {
          ...analyzedSpeeches,
          [speech.id]: data.data
        };
        setAnalyzedSpeeches(newAnalyzed);
        localStorage.setItem('cbAnalyzedSpeeches', JSON.stringify(newAnalyzed));
      } else {
        setError('Analysis failed: ' + (data.message || 'Not enough text to analyze'));
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setAnalyzing(null);
    }
  };

  const getSentimentColor = (sentiment) => {
    if (sentiment === 'HAWKISH') return '#ef4444';
    if (sentiment === 'DOVISH') return '#22c55e';
    return '#eab308';
  };

  const filteredSpeeches = speeches.filter(s => {
    const bankMatch = filterBank === 'ALL' || s.bankCode === filterBank;
    const typeMatch = filterType === 'ALL' || s.type === filterType;
    return bankMatch && typeMatch;
  });

  return (
    <div style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(15, 23, 42, 0.7)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ color: '#f1f5f9', margin: 0, fontSize: '1.2rem' }}>
          CB Speech Analysis
          <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: '9999px', marginLeft: '0.5rem', verticalAlign: 'middle' }}>FJ</span>
        </h2>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.85rem' }}
          >
            {contentTypes.map(t => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>

          <select
            value={filterBank}
            onChange={(e) => setFilterBank(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.85rem' }}
          >
            {banks.map(b => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>

          <button
            onClick={fetchSpeeches}
            disabled={loading}
            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.85rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '0.6rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && speeches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(226, 232, 240, 0.6)' }}>
          Fetching latest CB speeches...
        </div>
      )}

      {/* Speeches List */}
      {!loading && filteredSpeeches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(226, 232, 240, 0.6)' }}>
          No speeches found. Click Refresh.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {filteredSpeeches.map(speech => {
          const analysis = analyzedSpeeches[speech.id];
          const isAnalyzing = analyzing === speech.id;

          return (
            <div key={speech.id} style={{ padding: '0.85rem', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
              {/* Speech Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                      {speech.currency}
                    </span>
                    {speech.type === 'press_conference' && (
                      <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>
                        PRESS CONF
                      </span>
                    )}
                    <span style={{ color: 'rgba(226, 232, 240, 0.5)', fontSize: '0.75rem' }}>{speech.date}</span>
                    <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.8rem' }}>{speech.speaker}</span>
                  </div>
                  <div style={{ color: '#f1f5f9', fontSize: '0.9rem', lineHeight: 1.35 }}>
                    {speech.title}
                  </div>
                </div>

                {/* Action / Result */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {analysis ? (
                    <span style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: getSentimentColor(analysis.sentiment) + '20', color: getSentimentColor(analysis.sentiment), fontWeight: 700, fontSize: '0.85rem' }}>
                      {analysis.sentiment} ({analysis.score > 0 ? '+' : ''}{analysis.score})
                    </span>
                  ) : (
                    <button
                      onClick={() => analyzeSpeech(speech)}
                      disabled={isAnalyzing}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: isAnalyzing ? 'rgba(139, 92, 246, 0.4)' : '#8b5cf6', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: isAnalyzing ? 'not-allowed' : 'pointer' }}
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                    </button>
                  )}
                  <a href={speech.link} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(226, 232, 240, 0.5)', fontSize: '0.75rem', textDecoration: 'none' }}>
                    Source
                  </a>
                </div>
              </div>

              {/* Analysis Result - Markdown Content */}
              {analysis && analysis.markdown && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                    color: 'rgba(226, 232, 240, 0.9)',
                    fontSize: '0.9rem',
                    lineHeight: 1.6
                  }}
                  className="markdown-content"
                  dangerouslySetInnerHTML={{
                    __html: analysis.markdown
                      .replace(/^# (.*$)/gim, '<h1 style="font-size: 1.3rem; font-weight: 700; color: #f1f5f9; margin: 0.75rem 0 0.5rem 0;">$1</h1>')
                      .replace(/^## (.*$)/gim, '<h2 style="font-size: 1.1rem; font-weight: 600; color: #e2e8f0; margin: 0.65rem 0 0.4rem 0;">$1</h2>')
                      .replace(/^### (.*$)/gim, '<h3 style="font-size: 1rem; font-weight: 600; color: #cbd5e1; margin: 0.5rem 0 0.3rem 0;">$1</h3>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #f1f5f9; font-weight: 600;">$1</strong>')
                      .replace(/^- (.*$)/gim, '<li style="margin-left: 1.5rem; margin-bottom: 0.3rem;">$1</li>')
                      .replace(/🟥 HAWKISH/g, '<span style="padding: 0.25rem 0.6rem; border-radius: 6px; background: rgba(239, 68, 68, 0.2); color: #ef4444; font-weight: 700; font-size: 0.9rem;">🟥 HAWKISH</span>')
                      .replace(/🟩 DOVISH/g, '<span style="padding: 0.25rem 0.6rem; border-radius: 6px; background: rgba(34, 197, 94, 0.2); color: #22c55e; font-weight: 700; font-size: 0.9rem;">🟩 DOVISH</span>')
                      .replace(/🟨 NEUTRAL/g, '<span style="padding: 0.25rem 0.6rem; border-radius: 6px; background: rgba(234, 179, 8, 0.2); color: #eab308; font-weight: 700; font-size: 0.9rem;">🟨 NEUTRAL</span>')
                      .replace(/\n/g, '<br/>')
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Render
const cbSpeechRoot = document.getElementById('cb-speech-root');
if (cbSpeechRoot) {
  ReactDOM.createRoot(cbSpeechRoot).render(<CBSpeechAnalysis />);
}
