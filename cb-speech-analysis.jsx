/**
 * CB Speech Analysis Component
 * Simple dovish/hawkish summary with cited quotes from G8 central bank speeches
 */

const CBSpeechAnalysis = () => {
  const [centralBanks, setCentralBanks] = React.useState({});
  const [selectedBank, setSelectedBank] = React.useState('FED');
  const [selectedSpeaker, setSelectedSpeaker] = React.useState('');
  const [speechText, setSpeechText] = React.useState('');
  const [speechDate, setSpeechDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [analysis, setAnalysis] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [aiConfigured, setAiConfigured] = React.useState(false);
  const [analysisHistory, setAnalysisHistory] = React.useState([]);

  // Load central banks on mount
  React.useEffect(() => {
    fetch('/api/ai/central-banks')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCentralBanks(data.data);
          if (data.data.FED?.speakers?.length > 0) {
            setSelectedSpeaker(data.data.FED.speakers[0]);
          }
        }
      })
      .catch(err => console.error('Failed to load central banks:', err));

    fetch('/api/ai/status')
      .then(res => res.json())
      .then(data => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));

    const saved = localStorage.getItem('cbSpeechHistory');
    if (saved) {
      try {
        setAnalysisHistory(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  React.useEffect(() => {
    const bank = centralBanks[selectedBank];
    if (bank?.speakers?.length > 0) {
      setSelectedSpeaker(bank.speakers[0]);
    }
  }, [selectedBank, centralBanks]);

  const handleAnalyze = async () => {
    if (!speechText.trim()) {
      setError('Please enter the speech text');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const bank = centralBanks[selectedBank];
      const response = await fetch('/api/ai/analyze-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: speechText,
          speaker: selectedSpeaker,
          centralBank: bank?.name || selectedBank,
          date: speechDate
        })
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data.data);
        const historyItem = {
          id: Date.now(),
          ...data.data,
          bankCode: selectedBank,
          currency: bank?.currency
        };
        const newHistory = [historyItem, ...analysisHistory].slice(0, 10);
        setAnalysisHistory(newHistory);
        localStorage.setItem('cbSpeechHistory', JSON.stringify(newHistory));
      } else {
        setError(data.message || 'Analysis failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'HAWKISH': return '#ef4444';
      case 'DOVISH': return '#22c55e';
      default: return '#eab308';
    }
  };

  if (!aiConfigured) {
    return (
      <div style={{ padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(15, 23, 42, 0.7)', textAlign: 'center' }}>
        <h2 style={{ color: '#f1f5f9', marginBottom: '0.5rem' }}>CB Speech Analysis</h2>
        <p style={{ color: 'rgba(226, 232, 240, 0.6)' }}>Add DEEPSEEK_API_KEY to enable.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(15, 23, 42, 0.7)' }}>
      {/* Header */}
      <h2 style={{ color: '#f1f5f9', margin: '0 0 1rem 0', fontSize: '1.25rem' }}>
        CB Speech Analysis
        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '9999px', marginLeft: '0.5rem', verticalAlign: 'middle' }}>AI</span>
      </h2>

      {/* Input Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <select
          value={selectedBank}
          onChange={(e) => setSelectedBank(e.target.value)}
          style={{ flex: '1', minWidth: '140px', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.9rem' }}
        >
          {Object.entries(centralBanks).map(([code, bank]) => (
            <option key={code} value={code}>{bank.currency} - {bank.name}</option>
          ))}
        </select>

        <select
          value={selectedSpeaker}
          onChange={(e) => setSelectedSpeaker(e.target.value)}
          style={{ flex: '1', minWidth: '140px', padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.9rem' }}
        >
          {centralBanks[selectedBank]?.speakers?.map(speaker => (
            <option key={speaker} value={speaker}>{speaker}</option>
          ))}
        </select>

        <input
          type="date"
          value={speechDate}
          onChange={(e) => setSpeechDate(e.target.value)}
          style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.9rem' }}
        />
      </div>

      {/* Speech Text */}
      <textarea
        value={speechText}
        onChange={(e) => setSpeechText(e.target.value)}
        placeholder="Paste speech text here..."
        style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.3)', background: 'rgba(30, 41, 59, 0.8)', color: '#f1f5f9', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.75rem' }}
      />

      {/* Analyze Button */}
      <button
        onClick={handleAnalyze}
        disabled={loading || !speechText.trim()}
        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: 'none', background: loading ? 'rgba(59, 130, 246, 0.5)' : '#3b82f6', color: '#fff', fontSize: '0.95rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
      >
        {loading ? 'Analyzing...' : 'Analyze Speech'}
      </button>

      {/* Error */}
      {error && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Simple Analysis Result */}
      {analysis && (
        <div style={{ marginTop: '1rem' }}>
          {/* Verdict */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.6)', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: getSentimentColor(analysis.sentiment) }}>
              {analysis.sentiment}
            </span>
            <span style={{ color: 'rgba(226, 232, 240, 0.7)', fontSize: '0.9rem' }}>
              Score: {analysis.score > 0 ? '+' : ''}{analysis.score} | {analysis.speaker} ({analysis.centralBank})
            </span>
          </div>

          {/* Key Quotes - Simple List */}
          {analysis.keyQuotes?.length > 0 && (
            <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.4)' }}>
              <div style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.8rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Key Quotes
              </div>
              {analysis.keyQuotes.map((quote, idx) => (
                <div key={idx} style={{ marginBottom: idx < analysis.keyQuotes.length - 1 ? '0.75rem' : 0, paddingLeft: '0.75rem', borderLeft: `3px solid ${getSentimentColor(quote.sentiment)}` }}>
                  <span style={{ color: getSentimentColor(quote.sentiment), fontSize: '0.75rem', fontWeight: 600 }}>
                    [{quote.sentiment}]
                  </span>
                  <p style={{ color: '#f1f5f9', margin: '0.25rem 0 0 0', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    "{quote.quote}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent History - Simple */}
      {analysisHistory.length > 0 && !analysis && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ color: 'rgba(226, 232, 240, 0.5)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Recent:</div>
          {analysisHistory.slice(0, 3).map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '4px', background: 'rgba(30, 41, 59, 0.4)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              <span style={{ color: getSentimentColor(item.sentiment), fontWeight: 600 }}>{item.sentiment}</span>
              <span style={{ color: 'rgba(226, 232, 240, 0.6)' }}>|</span>
              <span style={{ color: 'rgba(226, 232, 240, 0.7)' }}>{item.currency} - {item.speaker}</span>
              <span style={{ color: 'rgba(226, 232, 240, 0.4)', marginLeft: 'auto' }}>{item.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Render
const cbSpeechRoot = document.getElementById('cb-speech-root');
if (cbSpeechRoot) {
  ReactDOM.createRoot(cbSpeechRoot).render(<CBSpeechAnalysis />);
}
