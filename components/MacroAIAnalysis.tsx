'use client';

import { useState } from 'react';

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
  isCritical: boolean;
}

interface AIAnalysis {
  verdict: 'Bullish Surprise' | 'Bearish Surprise' | 'Neutral' | 'Error';
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
  keyFactors: string[];
  analyzedAt: string;
  cached?: boolean;
  error?: boolean;
}

interface MacroAIAnalysisProps {
  newsItems: NewsItem[];
}

export default function MacroAIAnalysis({ newsItems }: MacroAIAnalysisProps) {
  const [analyses, setAnalyses] = useState<Map<string, AIAnalysis>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Generate unique key for news item
  const getItemKey = (item: NewsItem): string => {
    return `${item.headline}-${item.timestamp}`;
  };

  // Analyze a specific news item
  const analyzeItem = async (item: NewsItem) => {
    const itemKey = getItemKey(item);

    // Check if already analyzed
    if (analyses.has(itemKey)) {
      console.log('[MacroAI] Already analyzed:', item.headline);
      return;
    }

    // Validate economic data
    if (!item.economicData || !item.economicData.actual || !item.economicData.forecast) {
      setErrors(prev => new Map(prev).set(itemKey, 'Missing economic data (actual/forecast required)'));
      return;
    }

    // Set loading state
    setLoading(prev => new Set(prev).add(itemKey));
    setErrors(prev => {
      const newErrors = new Map(prev);
      newErrors.delete(itemKey);
      return newErrors;
    });

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
          tags: item.tags,
          timestamp: item.timestamp,
        }),
      });

      const data = await response.json();

      if (data.success && data.analysis) {
        // Store analysis
        setAnalyses(prev => {
          const newAnalyses = new Map(prev);
          newAnalyses.set(itemKey, data.analysis);
          return newAnalyses;
        });

        // Auto-expand the analysis
        setExpandedItems(prev => new Set(prev).add(itemKey));

        console.log('[MacroAI] Analysis complete:', data.analysis.verdict);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err: any) {
      console.error('[MacroAI] Analysis error:', err);
      setErrors(prev => new Map(prev).set(itemKey, err.message || 'Failed to analyze'));
    } finally {
      // Remove loading state
      setLoading(prev => {
        const newLoading = new Set(prev);
        newLoading.delete(itemKey);
        return newLoading;
      });
    }
  };

  // Toggle expanded state
  const toggleExpanded = (itemKey: string) => {
    setExpandedItems(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(itemKey)) {
        newExpanded.delete(itemKey);
      } else {
        newExpanded.add(itemKey);
      }
      return newExpanded;
    });
  };

  // Get verdict color and background
  const getVerdictStyle = (verdict: string) => {
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
  const getConfidenceStars = (confidence: string) => {
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
    return (
      <div style={{
        marginTop: '1.5rem',
        padding: '1.5rem',
        background: 'var(--secondary-bg)',
        borderRadius: '12px',
        border: '1px solid var(--secondary-border)',
        textAlign: 'center'
      }}>
        <svg width="32" height="32" viewBox="0 0 512 512" style={{ marginBottom: '0.5rem' }}>
          <path d="M256 52L468 444H44L256 52Z" fill="#0B3C46" />
          <path d="M256 132L394 384H186L256 246L326 384H118L256 132Z" fill="#c7d2fe" />
          <path d="M256 220L312 324H200L256 220Z" fill="#0B3C46" />
        </svg>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          No economic data available for AI analysis
        </div>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '1rem',
      background: 'var(--secondary-bg)',
      borderRadius: '12px',
      border: '1px solid var(--secondary-border)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--secondary-border)',
        background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.08), rgba(0, 136, 255, 0.05))'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <svg width="20" height="20" viewBox="0 0 512 512" style={{ flexShrink: 0 }}>
              <path d="M256 52L468 444H44L256 52Z" fill="#0B3C46" />
              <path d="M256 132L394 384H186L256 246L326 384H118L256 132Z" fill="#c7d2fe" />
              <path d="M256 220L312 324H200L256 220Z" fill="#0B3C46" />
            </svg>
            <h2 style={{
              fontSize: '0.95rem',
              fontWeight: '700',
              color: 'var(--text-primary)',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Macro-AI AlphaLabs
            </h2>
          </div>
          <div style={{
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '0.25rem 0.5rem',
            borderRadius: '6px',
            whiteSpace: 'nowrap'
          }}>
            Policy Shift & Surprise Detection
          </div>
        </div>
      </div>

      {/* Analysis Items */}
      <div style={{ padding: '0.65rem' }}>
        {analyzableItems.map((item) => {
          const itemKey = getItemKey(item);
          const analysis = analyses.get(itemKey);
          const isLoading = loading.has(itemKey);
          const error = errors.get(itemKey);
          const isExpanded = expandedItems.has(itemKey);

          return (
            <div
              key={itemKey}
              style={{
                marginBottom: '0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--secondary-border)',
                background: 'rgba(0, 0, 0, 0.2)',
                overflow: 'hidden'
              }}
            >
              {/* News Item Header */}
              <div style={{
                padding: '0.65rem',
                borderBottom: analysis ? '1px solid var(--secondary-border)' : 'none'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.8rem',
                      fontWeight: '500',
                      color: 'var(--text-primary)',
                      marginBottom: '0.4rem',
                      lineHeight: '1.35',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}>
                      {item.headline}
                    </div>
                    {item.economicData && (
                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        gap: '0.65rem',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{ whiteSpace: 'nowrap' }}>
                          Actual: <strong style={{ color: '#51c6e1' }}>{item.economicData.actual}</strong>
                        </span>
                        <span style={{ whiteSpace: 'nowrap' }}>
                          Forecast: <strong>{item.economicData.forecast}</strong>
                        </span>
                        {item.economicData.previous && (
                          <span style={{ whiteSpace: 'nowrap' }}>
                            Previous: <strong>{item.economicData.previous}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!analysis && !isLoading && !error && (
                    <button
                      onClick={() => analyzeItem(item)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.2), rgba(0, 136, 255, 0.1))',
                        border: '1px solid #51c6e1',
                        borderRadius: '6px',
                        color: '#51c6e1',
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        minHeight: '32px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 217, 255, 0.3), rgba(0, 136, 255, 0.15))';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 217, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 217, 255, 0.2), rgba(0, 136, 255, 0.1))';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      🔍 Analyze with AI
                    </button>
                  )}
                </div>

                {/* Loading State */}
                {isLoading && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    textAlign: 'center',
                    background: 'rgba(0, 217, 255, 0.05)',
                    borderRadius: '6px'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      border: '2px solid rgba(0, 217, 255, 0.2)',
                      borderTop: '2px solid #51c6e1',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 0.5rem'
                    }} />
                    <div style={{ fontSize: '0.75rem', color: '#7dd3fc', fontWeight: 600 }}>
                      Analyzing market surprise...
                    </div>
                  </div>
                )}

                {/* Error State */}
                {error && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.6rem',
                    background: 'rgba(255, 51, 102, 0.1)',
                    borderRadius: '6px',
                    borderLeft: '3px solid #FF3366'
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#FF3366', wordWrap: 'break-word' }}>
                      ⚠️ {error}
                    </div>
                    <button
                      onClick={() => analyzeItem(item)}
                      style={{
                        marginTop: '0.4rem',
                        padding: '0.3rem 0.6rem',
                        background: 'rgba(255, 51, 102, 0.2)',
                        border: '1px solid #FF3366',
                        borderRadius: '4px',
                        color: '#FF3366',
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>

              {/* Analysis Result */}
              {analysis && !analysis.error && (
                <div style={{
                  ...getVerdictStyle(analysis.verdict),
                  padding: '0.75rem',
                  border: `2px solid ${getVerdictStyle(analysis.verdict).borderColor}`,
                  borderRadius: '0 0 8px 8px'
                }}>
                  {/* Verdict Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                    cursor: 'pointer',
                    gap: '0.5rem'
                  }}
                  onClick={() => toggleExpanded(itemKey)}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        color: getVerdictStyle(analysis.verdict).textColor,
                        marginBottom: '0.25rem',
                        wordWrap: 'break-word'
                      }}>
                        {analysis.verdict === 'Bullish Surprise' && '📈 '}
                        {analysis.verdict === 'Bearish Surprise' && '📉 '}
                        {analysis.verdict === 'Neutral' && '➡️ '}
                        {analysis.verdict}
                      </div>
                      <div style={{
                        fontSize: '0.65rem',
                        color: 'var(--text-secondary)'
                      }}>
                        Confidence: {getConfidenceStars(analysis.confidence)} {analysis.confidence}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '1rem',
                      color: 'var(--text-muted)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s',
                      flexShrink: 0
                    }}>
                      ▼
                    </div>
                  </div>

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div style={{
                      marginTop: '0.5rem',
                      paddingTop: '0.5rem',
                      borderTop: `1px solid ${getVerdictStyle(analysis.verdict).borderColor}40`
                    }}>
                      {/* Reasoning */}
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{
                          fontSize: '0.65rem',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          marginBottom: '0.4rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          Reasoning:
                        </div>
                        <div style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-secondary)',
                          lineHeight: '1.5',
                          background: 'rgba(0, 0, 0, 0.2)',
                          padding: '0.6rem',
                          borderRadius: '6px',
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word'
                        }}>
                          {analysis.reasoning}
                        </div>
                      </div>

                      {/* Key Factors */}
                      {analysis.keyFactors && analysis.keyFactors.length > 0 && (
                        <div>
                          <div style={{
                            fontSize: '0.65rem',
                            fontWeight: '600',
                            color: 'var(--text-primary)',
                            marginBottom: '0.4rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            Key Factors:
                          </div>
                          <ul style={{
                            margin: 0,
                            paddingLeft: '1.25rem',
                            fontSize: '0.7rem',
                            color: 'var(--text-secondary)',
                            lineHeight: '1.5'
                          }}>
                            {analysis.keyFactors.map((factor, idx) => (
                              <li key={idx} style={{ marginBottom: '0.2rem', wordWrap: 'break-word' }}>
                                {factor}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div style={{
                        marginTop: '0.5rem',
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        textAlign: 'right'
                      }}>
                        {analysis.cached && '💾 '}
                        Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
