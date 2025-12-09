/**
 * CB Speech Analysis Component
 * AI-powered central bank speech sentiment analysis for G8 currencies
 * Now with automatic speech fetching from central bank sources
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
  const [activeTab, setActiveTab] = React.useState('live'); // 'live', 'manual', 'history'
  const [analysisHistory, setAnalysisHistory] = React.useState([]);

  // New states for live speeches
  const [liveSpeeches, setLiveSpeeches] = React.useState([]);
  const [fetchingSpeeches, setFetchingSpeeches] = React.useState(false);
  const [filterBank, setFilterBank] = React.useState('ALL');
  const [analyzingId, setAnalyzingId] = React.useState(null);

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

    // Check AI status
    fetch('/api/ai/status')
      .then(res => res.json())
      .then(data => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));

    // Load history from localStorage
    const saved = localStorage.getItem('cbSpeechHistory');
    if (saved) {
      try {
        setAnalysisHistory(JSON.parse(saved));
      } catch (e) {}
    }

    // Auto-fetch speeches on mount
    fetchLiveSpeeches();
  }, []);

  // Update speaker when bank changes
  React.useEffect(() => {
    const bank = centralBanks[selectedBank];
    if (bank?.speakers?.length > 0) {
      setSelectedSpeaker(bank.speakers[0]);
    }
  }, [selectedBank, centralBanks]);

  // Fetch live speeches from all banks
  const fetchLiveSpeeches = async (bankCode = null) => {
    setFetchingSpeeches(true);
    setError(null);

    try {
      const url = bankCode && bankCode !== 'ALL'
        ? `/api/speeches?bank=${bankCode}`
        : '/api/speeches';

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setLiveSpeeches(data.data);
      } else {
        setError(data.message || 'Failed to fetch speeches');
      }
    } catch (err) {
      setError('Failed to fetch speeches: ' + err.message);
    } finally {
      setFetchingSpeeches(false);
    }
  };

  // Analyze a live speech (fetch text + analyze)
  const analyzeLiveSpeech = async (speech) => {
    setAnalyzingId(speech.id);
    setError(null);

    try {
      const response = await fetch('/api/speeches/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: speech.link,
          speaker: speech.speaker,
          centralBank: speech.centralBank,
          bankCode: speech.bankCode,
          date: speech.date
        })
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data.data);
        // Save to history
        const historyItem = {
          id: Date.now(),
          ...data.data,
          title: speech.title,
          sourceUrl: speech.link
        };
        const newHistory = [historyItem, ...analysisHistory].slice(0, 20);
        setAnalysisHistory(newHistory);
        localStorage.setItem('cbSpeechHistory', JSON.stringify(newHistory));
        // Switch to show results
        setActiveTab('manual');
      } else {
        setError(data.message || 'Analysis failed. The speech text might not be accessible.');
      }
    } catch (err) {
      setError('Failed to analyze: ' + err.message);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleAnalyze = async () => {
    if (!speechText.trim()) {
      setError('Please enter the speech text to analyze');
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
        const newHistory = [historyItem, ...analysisHistory].slice(0, 20);
        setAnalysisHistory(newHistory);
        localStorage.setItem('cbSpeechHistory', JSON.stringify(newHistory));
      } else {
        setError(data.message || 'Analysis failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze speech');
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

  const getSentimentBg = (sentiment) => {
    switch (sentiment) {
      case 'HAWKISH': return 'rgba(239, 68, 68, 0.15)';
      case 'DOVISH': return 'rgba(34, 197, 94, 0.15)';
      default: return 'rgba(234, 179, 8, 0.15)';
    }
  };

  const clearHistory = () => {
    setAnalysisHistory([]);
    localStorage.removeItem('cbSpeechHistory');
  };

  // Filter speeches by bank
  const filteredSpeeches = filterBank === 'ALL'
    ? liveSpeeches
    : liveSpeeches.filter(s => s.bankCode === filterBank);

  if (!aiConfigured) {
    return (
      <div style={{
        padding: '2rem',
        borderRadius: '16px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        background: 'rgba(15, 23, 42, 0.7)',
        textAlign: 'center'
      }}>
        <h2 style={{ color: '#f1f5f9', marginBottom: '1rem' }}>CB Speech Analysis</h2>
        <p style={{ color: 'rgba(226, 232, 240, 0.7)' }}>
          DeepSeek AI is not configured. Add DEEPSEEK_API_KEY to your environment variables.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '1.5rem',
      borderRadius: '16px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      background: 'rgba(15, 23, 42, 0.7)',
      boxShadow: '0 6px 15px rgba(0, 0, 0, 0.2)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: '#f1f5f9', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            CB Speech Analysis
            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '9999px', marginLeft: '0.5rem' }}>AI</span>
          </h2>
          <p style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Auto-fetch and analyze G8 central bank speeches
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('live')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'live' ? '#10b981' : 'rgba(51, 65, 85, 0.5)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>LIVE</span>
            {liveSpeeches.length > 0 && (
              <span style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                fontSize: '0.75rem'
              }}>
                {liveSpeeches.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'manual' ? '#3b82f6' : 'rgba(51, 65, 85, 0.5)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Manual
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'history' ? '#3b82f6' : 'rgba(51, 65, 85, 0.5)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            History ({analysisHistory.length})
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5'
        }}>
          {error}
        </div>
      )}

      {/* Live Speeches Tab */}
      {activeTab === 'live' && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Filter by Bank */}
            <div style={{ flex: '1', minWidth: '200px' }}>
              <select
                value={filterBank}
                onChange={(e) => setFilterBank(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#f1f5f9',
                  fontSize: '0.95rem'
                }}
              >
                <option value="ALL">All Central Banks</option>
                {Object.entries(centralBanks).map(([code, bank]) => (
                  <option key={code} value={code}>
                    {bank.currency} - {bank.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchLiveSpeeches(filterBank !== 'ALL' ? filterBank : null)}
              disabled={fetchingSpeeches}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: fetchingSpeeches ? 'rgba(16, 185, 129, 0.5)' : '#10b981',
                color: '#fff',
                cursor: fetchingSpeeches ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {fetchingSpeeches ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#8634;</span>
                  Fetching...
                </>
              ) : (
                <>&#8635; Refresh Speeches</>
              )}
            </button>
          </div>

          {/* Speeches List */}
          {fetchingSpeeches && liveSpeeches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(226, 232, 240, 0.6)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#8634;</div>
              <p>Fetching latest speeches from central banks...</p>
            </div>
          ) : filteredSpeeches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(226, 232, 240, 0.6)' }}>
              <p>No speeches found. Click "Refresh Speeches" to fetch the latest.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredSpeeches.map(speech => (
                <div key={speech.id} style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  transition: 'border-color 0.2s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                      {/* Bank Badge & Date */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '4px',
                          background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {speech.currency}
                        </span>
                        <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.8rem' }}>
                          {speech.centralBank}
                        </span>
                        <span style={{ color: 'rgba(226, 232, 240, 0.5)', fontSize: '0.75rem' }}>
                          {speech.date}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 style={{
                        color: '#f1f5f9',
                        margin: '0 0 0.25rem 0',
                        fontSize: '0.95rem',
                        fontWeight: 500,
                        lineHeight: 1.4
                      }}>
                        {speech.title}
                      </h4>

                      {/* Speaker */}
                      <p style={{ color: 'rgba(226, 232, 240, 0.7)', margin: 0, fontSize: '0.85rem' }}>
                        Speaker: <strong>{speech.speaker}</strong>
                      </p>

                      {/* Description if available */}
                      {speech.description && (
                        <p style={{
                          color: 'rgba(226, 232, 240, 0.5)',
                          margin: '0.5rem 0 0 0',
                          fontSize: '0.8rem',
                          lineHeight: 1.4
                        }}>
                          {speech.description.substring(0, 150)}...
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <a
                        href={speech.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(148, 163, 184, 0.3)',
                          background: 'transparent',
                          color: 'rgba(226, 232, 240, 0.8)',
                          textDecoration: 'none',
                          fontSize: '0.85rem'
                        }}
                      >
                        View Source
                      </a>
                      <button
                        onClick={() => analyzeLiveSpeech(speech)}
                        disabled={analyzingId === speech.id}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: analyzingId === speech.id
                            ? 'rgba(139, 92, 246, 0.5)'
                            : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                          color: '#fff',
                          cursor: analyzingId === speech.id ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        {analyzingId === speech.id ? (
                          <>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#8987;</span>
                            Analyzing...
                          </>
                        ) : (
                          <>Analyze</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Analyze Tab */}
      {activeTab === 'manual' && (
        <>
          {/* Input Form */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            {/* Central Bank Select */}
            <div>
              <label style={{ display: 'block', color: 'rgba(226, 232, 240, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Central Bank
              </label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#f1f5f9',
                  fontSize: '0.95rem'
                }}
              >
                {Object.entries(centralBanks).map(([code, bank]) => (
                  <option key={code} value={code}>
                    {bank.currency} - {bank.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Speaker Select */}
            <div>
              <label style={{ display: 'block', color: 'rgba(226, 232, 240, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Speaker
              </label>
              <select
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#f1f5f9',
                  fontSize: '0.95rem'
                }}
              >
                {centralBanks[selectedBank]?.speakers?.map(speaker => (
                  <option key={speaker} value={speaker}>{speaker}</option>
                ))}
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Date */}
            <div>
              <label style={{ display: 'block', color: 'rgba(226, 232, 240, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Speech Date
              </label>
              <input
                type="date"
                value={speechDate}
                onChange={(e) => setSpeechDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#f1f5f9',
                  fontSize: '0.95rem'
                }}
              />
            </div>
          </div>

          {/* Speech Text */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: 'rgba(226, 232, 240, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Speech Text / Transcript
            </label>
            <textarea
              value={speechText}
              onChange={(e) => setSpeechText(e.target.value)}
              placeholder="Paste the central bank speech or press conference transcript here..."
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#f1f5f9',
                fontSize: '0.95rem',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading || !speechText.trim()}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: '8px',
              border: 'none',
              background: loading ? 'rgba(59, 130, 246, 0.5)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#8987;</span>
                Analyzing with DeepSeek AI...
              </>
            ) : (
              <>Analyze Speech</>
            )}
          </button>

          {/* Analysis Results */}
          {analysis && (
            <div style={{ marginTop: '1.5rem' }}>
              {/* Sentiment Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1.5rem',
                borderRadius: '12px',
                background: getSentimentBg(analysis.sentiment),
                border: `1px solid ${getSentimentColor(analysis.sentiment)}40`,
                marginBottom: '1rem'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `conic-gradient(${getSentimentColor(analysis.sentiment)} ${(analysis.score + 100) / 2}%, rgba(51, 65, 85, 0.5) 0)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(15, 23, 42, 0.95)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column'
                  }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: getSentimentColor(analysis.sentiment) }}>
                      {analysis.score > 0 ? '+' : ''}{analysis.score}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: getSentimentColor(analysis.sentiment)
                    }}>
                      {analysis.sentiment}
                    </span>
                    <span style={{
                      fontSize: '0.875rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      background: 'rgba(51, 65, 85, 0.5)',
                      color: 'rgba(226, 232, 240, 0.8)'
                    }}>
                      {analysis.confidence}% confidence
                    </span>
                  </div>
                  <p style={{ color: 'rgba(226, 232, 240, 0.8)', margin: 0, fontSize: '0.95rem' }}>
                    {analysis.summary}
                  </p>
                </div>
              </div>

              {/* Key Quotes */}
              {analysis.keyQuotes?.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ color: '#f1f5f9', fontSize: '1.1rem', marginBottom: '0.75rem' }}>
                    Key Quotes with Citations
                  </h3>
                  {analysis.keyQuotes.map((quote, idx) => (
                    <div key={idx} style={{
                      padding: '1rem',
                      borderRadius: '8px',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem'
                      }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          background: getSentimentBg(quote.sentiment),
                          color: getSentimentColor(quote.sentiment),
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {quote.sentiment}
                        </span>
                        <div>
                          <p style={{
                            color: '#f1f5f9',
                            margin: '0 0 0.5rem 0',
                            fontStyle: 'italic',
                            borderLeft: `3px solid ${getSentimentColor(quote.sentiment)}`,
                            paddingLeft: '0.75rem'
                          }}>
                            "{quote.quote}"
                          </p>
                          <p style={{ color: 'rgba(226, 232, 240, 0.7)', margin: 0, fontSize: '0.875rem' }}>
                            {quote.interpretation}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Policy Implications */}
              {analysis.policyImplications && (
                <div style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)'
                }}>
                  <h3 style={{ color: '#f1f5f9', fontSize: '1.1rem', marginBottom: '0.75rem', marginTop: 0 }}>
                    Policy Implications
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    {analysis.policyImplications.rateOutlook && (
                      <div>
                        <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Rate Outlook</span>
                        <p style={{ color: '#f1f5f9', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>{analysis.policyImplications.rateOutlook}</p>
                      </div>
                    )}
                    {analysis.policyImplications.inflationView && (
                      <div>
                        <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Inflation View</span>
                        <p style={{ color: '#f1f5f9', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>{analysis.policyImplications.inflationView}</p>
                      </div>
                    )}
                    {analysis.policyImplications.growthView && (
                      <div>
                        <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Growth View</span>
                        <p style={{ color: '#f1f5f9', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>{analysis.policyImplications.growthView}</p>
                      </div>
                    )}
                    {analysis.policyImplications.marketImpact && (
                      <div>
                        <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Market Impact</span>
                        <p style={{ color: '#f1f5f9', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>{analysis.policyImplications.marketImpact}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          {analysisHistory.length === 0 ? (
            <p style={{ color: 'rgba(226, 232, 240, 0.6)', textAlign: 'center', padding: '2rem' }}>
              No analysis history yet. Analyze a speech to see it here.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button
                  onClick={clearHistory}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'transparent',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Clear History
                </button>
              </div>
              {analysisHistory.map(item => (
                <div key={item.id} style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  marginBottom: '0.75rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        background: getSentimentBg(item.sentiment),
                        color: getSentimentColor(item.sentiment),
                        fontWeight: 600,
                        fontSize: '0.875rem'
                      }}>
                        {item.sentiment} ({item.score > 0 ? '+' : ''}{item.score})
                      </span>
                      <span style={{ marginLeft: '0.5rem', color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.875rem' }}>
                        {item.currency || item.bankCode}
                      </span>
                    </div>
                    <span style={{ color: 'rgba(226, 232, 240, 0.5)', fontSize: '0.75rem' }}>
                      {item.date}
                    </span>
                  </div>
                  {item.title && (
                    <p style={{ color: '#f1f5f9', margin: '0.25rem 0', fontSize: '0.9rem', fontWeight: 500 }}>
                      {item.title}
                    </p>
                  )}
                  <p style={{ color: '#f1f5f9', margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
                    <strong>{item.speaker}</strong> - {item.centralBank}
                  </p>
                  <p style={{ color: 'rgba(226, 232, 240, 0.7)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                    {item.summary}
                  </p>
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#60a5fa', fontSize: '0.8rem', marginTop: '0.5rem', display: 'inline-block' }}
                    >
                      View Source
                    </a>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Render component
const cbSpeechRoot = document.getElementById('cb-speech-root');
if (cbSpeechRoot) {
  ReactDOM.createRoot(cbSpeechRoot).render(<CBSpeechAnalysis />);
}
