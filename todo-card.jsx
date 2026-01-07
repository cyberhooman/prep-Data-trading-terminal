const { useState, useEffect, useMemo, useRef } = React;

/**
 * TodoCard - Trading Notes Component
 * Styled to match Alphalabs Notion-inspired dark theme
 */
function TodoCard() {
  const [items, setItems] = useState([]);
  const [dateInfo, setDateInfo] = useState({ date: "", time: "" });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(true); // Default to true so form is visible
  const [currencyTrend, setCurrencyTrend] = useState(null);
  const [editFormData, setEditFormData] = useState({
    pair: '',
    condition: 'stronger',
    rangeLow: '',
    rangeHigh: '',
    lotSize: ''
  });

  // Form fields
  const [formData, setFormData] = useState({
    pair: '',
    condition: 'stronger',
    rangeLow: '',
    rangeHigh: '',
    lotSize: ''
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const date = now.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const time = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setDateInfo({ date, time });
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchItems();
    fetchCurrencyTrend();
    // Refresh currency trend every 5 minutes
    const trendInterval = setInterval(fetchCurrencyTrend, 5 * 60 * 1000);
    return () => clearInterval(trendInterval);
  }, []);

  const fetchItems = async () => {
    try {
      const response = await fetch('/api/todos');
      const data = await response.json();
      setItems(data);
    } catch (error) {
      console.error('Error fetching trading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrencyTrend = async () => {
    try {
      const response = await fetch('/api/currency-strength/extremes');
      const data = await response.json();
      setCurrencyTrend(data);
    } catch (error) {
      console.error('Error fetching currency trend:', error);
    }
  };

  const addItem = async () => {
    try {
      const noteText = `${formData.pair} | ${formData.condition === 'stronger' ? '📈' : '📉'} ${formData.condition.toUpperCase()} | Range: ${formData.rangeLow}-${formData.rangeHigh} | Lot: ${formData.lotSize}`;

      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText }),
      });
      const newItem = await response.json();
      setItems((prev) => [...prev, newItem]);

      // Reset form
      setFormData({
        pair: '',
        condition: 'stronger',
        rangeLow: '',
        rangeHigh: '',
        lotSize: ''
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding trading note:', error);
    }
  };

  const deleteItem = async (id) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const updateItem = async (id) => {
    try {
      const noteText = `${editFormData.pair} | ${editFormData.condition === 'stronger' ? '📈' : '📉'} ${editFormData.condition.toUpperCase()} | Range: ${editFormData.rangeLow}-${editFormData.rangeHigh} | Lot: ${editFormData.lotSize}`;

      const response = await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText }),
      });
      const updatedItem = await response.json();
      setItems((prev) => prev.map((item) => (item.id === id ? updatedItem : item)));
      setEditingId(null);
      setEditFormData({
        pair: '',
        condition: 'stronger',
        rangeLow: '',
        rangeHigh: '',
        lotSize: ''
      });
    } catch (error) {
      console.error('Error updating note:', error);
    }
  };

  const startEdit = (item) => {
    // Parse the existing note text
    const parts = item.text.split(' | ');
    const pair = parts[0] || '';
    const conditionPart = parts[1] || '';
    const condition = conditionPart.includes('STRONGER') ? 'stronger' : 'weaker';
    const rangePart = parts[2] || '';
    const rangeMatch = rangePart.match(/Range: ([\d.]+)-([\d.]+)/);
    const rangeLow = rangeMatch ? rangeMatch[1] : '';
    const rangeHigh = rangeMatch ? rangeMatch[2] : '';
    const lotPart = parts[3] || '';
    const lotMatch = lotPart.match(/Lot: ([\d.]+)/);
    const lotSize = lotMatch ? lotMatch[1] : '';

    setEditFormData({
      pair,
      condition,
      rangeLow,
      rangeHigh,
      lotSize
    });
    setEditingId(item.id);
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData({
      pair: '',
      condition: 'stronger',
      rangeLow: '',
      rangeHigh: '',
      lotSize: ''
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (editFormData.pair && editFormData.rangeLow && editFormData.rangeHigh && editFormData.lotSize) {
      updateItem(editingId);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (formData.pair && formData.rangeLow && formData.rangeHigh && formData.lotSize) {
      addItem();
    }
  };

  // Styles matching Notion theme
  const styles = {
    container: {
      width: '100%',
      borderRadius: '12px',
      overflow: 'hidden',
      backgroundColor: 'var(--sidebar)',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: 'var(--block)',
      borderBottom: '1px solid var(--border)'
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    dateText: {
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--text)'
    },
    timeChip: {
      backgroundColor: 'rgba(99, 102, 241, 0.15)',
      color: '#818cf8',
      fontSize: '12px',
      fontWeight: '500',
      padding: '4px 10px',
      borderRadius: '6px',
      fontFamily: "'JetBrains Mono', monospace"
    },
    addButton: {
      color: '#818cf8',
      fontSize: '13px',
      fontWeight: '600',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '6px 12px',
      borderRadius: '6px',
      transition: 'all 0.2s'
    },
    content: {
      padding: '16px',
      backgroundColor: 'var(--sidebar)',
      maxHeight: 'calc(100vh - 180px)',
      overflowY: 'auto'
    },
    title: {
      fontSize: '16px',
      fontWeight: '700',
      color: 'var(--text)',
      marginBottom: '16px',
      fontFamily: "'Space Grotesk', sans-serif"
    },
    alertBox: {
      padding: '10px 12px',
      borderRadius: '8px',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px'
    },
    infoAlert: {
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      border: '1px solid rgba(99, 102, 241, 0.25)'
    },
    warningAlert: {
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      border: '1px solid rgba(245, 158, 11, 0.25)'
    },
    alertIcon: {
      width: '18px',
      height: '18px',
      flexShrink: 0,
      marginTop: '2px'
    },
    alertTitle: {
      fontSize: '13px',
      fontWeight: '600',
      marginBottom: '4px'
    },
    alertText: {
      fontSize: '12px',
      lineHeight: '1.5'
    },
    form: {
      padding: '12px',
      backgroundColor: 'var(--block)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      marginBottom: '12px'
    },
    formGrid2: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px',
      marginBottom: '10px'
    },
    formGrid3: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: '10px',
      marginBottom: '12px'
    },
    label: {
      display: 'block',
      fontSize: '11px',
      fontWeight: '500',
      color: 'var(--muted)',
      marginBottom: '6px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    input: {
      width: '100%',
      padding: '8px 10px',
      backgroundColor: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      fontSize: '13px',
      color: 'var(--text)',
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s'
    },
    select: {
      width: '100%',
      padding: '8px 10px',
      backgroundColor: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      fontSize: '13px',
      color: 'var(--text)',
      outline: 'none',
      cursor: 'pointer'
    },
    submitBtn: {
      width: '100%',
      padding: '10px',
      backgroundColor: '#6366f1',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    noteItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      backgroundColor: 'var(--block)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      marginBottom: '8px',
      transition: 'all 0.2s'
    },
    noteText: {
      fontSize: '13px',
      color: 'var(--text)',
      fontWeight: '500',
      fontFamily: "'JetBrains Mono', monospace"
    },
    iconBtn: {
      background: 'none',
      border: 'none',
      padding: '6px',
      cursor: 'pointer',
      borderRadius: '4px',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px 20px',
      color: 'var(--muted)'
    },
    footer: {
      fontSize: '12px',
      color: 'var(--muted)',
      marginTop: '16px',
      fontWeight: '500'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.content, textAlign: 'center', padding: '40px' }}>
          <div style={{ color: 'var(--muted)' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.dateText}>{dateInfo.date}</span>
          <span style={styles.timeChip}>{dateInfo.time}</span>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={styles.addButton}
          onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.1)'}
          onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          {showAddForm ? 'Cancel' : '+ Add Note'}
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <h3 style={styles.title}>Data Trading Preparation</h3>

        {/* Currency Trend Warning */}
        {currencyTrend && (
          <div style={{ ...styles.alertBox, ...styles.infoAlert }}>
            <svg style={{ ...styles.alertIcon, color: '#818cf8' }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ ...styles.alertTitle, color: '#a5b4fc' }}>⚠️ Don't fight the trend</p>
              <div style={{ ...styles.alertText, color: 'var(--muted)' }}>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#34d399', fontWeight: '600' }}>Strongest:</span>{' '}
                  <span style={{ color: 'var(--text)' }}>{currencyTrend.strongest.currency} ({currencyTrend.strongest.title})</span>
                  <span style={{ color: '#34d399', marginLeft: '8px' }}>↑ {currencyTrend.strongest.momentum}%</span>
                </div>
                <div>
                  <span style={{ color: '#f87171', fontWeight: '600' }}>Weakest:</span>{' '}
                  <span style={{ color: 'var(--text)' }}>{currencyTrend.weakest.currency} ({currencyTrend.weakest.title})</span>
                  <span style={{ color: '#f87171', marginLeft: '8px' }}>↓ {currencyTrend.weakest.momentum}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trading Rule Alert */}
        <div style={{ ...styles.alertBox, ...styles.warningAlert }}>
          <svg style={{ ...styles.alertIcon, color: '#fbbf24' }} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p style={{ ...styles.alertText, color: '#fcd34d' }}>
            Only take an advantage when <span style={{ color: '#34d399', fontWeight: '700' }}>GREEN</span> across the board or <span style={{ color: '#f87171', fontWeight: '700' }}>RED</span> across the board
          </p>
        </div>

        {/* Add Note Form */}
        {showAddForm && (
          <form onSubmit={handleFormSubmit} style={styles.form}>
            <div style={styles.formGrid2}>
              <div>
                <label style={styles.label}>Currency Pair</label>
                <input
                  type="text"
                  value={formData.pair}
                  onChange={(e) => setFormData({...formData, pair: e.target.value.toUpperCase()})}
                  placeholder="e.g., GBPCAD"
                  style={styles.input}
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Data Condition</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({...formData, condition: e.target.value})}
                  style={styles.select}
                >
                  <option value="stronger">📈 Data Stronger</option>
                  <option value="weaker">📉 Data Weaker</option>
                </select>
              </div>
            </div>

            <div style={styles.formGrid3}>
              <div>
                <label style={styles.label}>Range Low</label>
                <input
                  type="text"
                  value={formData.rangeLow}
                  onChange={(e) => setFormData({...formData, rangeLow: e.target.value})}
                  placeholder="1.7500"
                  style={styles.input}
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Range High</label>
                <input
                  type="text"
                  value={formData.rangeHigh}
                  onChange={(e) => setFormData({...formData, rangeHigh: e.target.value})}
                  placeholder="1.7800"
                  style={styles.input}
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Lot Size</label>
                <input
                  type="text"
                  value={formData.lotSize}
                  onChange={(e) => setFormData({...formData, lotSize: e.target.value})}
                  placeholder="0.5"
                  style={styles.input}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              style={styles.submitBtn}
              onMouseOver={(e) => e.target.style.backgroundColor = '#4f46e5'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#6366f1'}
            >
              Add Trading Note
            </button>
          </form>
        )}

        {/* Edit Form */}
        {editingId && (
          <form onSubmit={handleEditSubmit} style={{ ...styles.form, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#34d399' }}>Edit Trading Note</h4>
              <button
                type="button"
                onClick={cancelEdit}
                style={{ ...styles.iconBtn, color: 'var(--muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={styles.formGrid2}>
              <div>
                <label style={styles.label}>Currency Pair</label>
                <input
                  type="text"
                  value={editFormData.pair}
                  onChange={(e) => setEditFormData({...editFormData, pair: e.target.value.toUpperCase()})}
                  placeholder="e.g., GBPCAD"
                  style={styles.input}
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Data Condition</label>
                <select
                  value={editFormData.condition}
                  onChange={(e) => setEditFormData({...editFormData, condition: e.target.value})}
                  style={styles.select}
                >
                  <option value="stronger">📈 Data Stronger</option>
                  <option value="weaker">📉 Data Weaker</option>
                </select>
              </div>
            </div>

            <div style={styles.formGrid3}>
              <div>
                <label style={styles.label}>Range Low</label>
                <input
                  type="text"
                  value={editFormData.rangeLow}
                  onChange={(e) => setEditFormData({...editFormData, rangeLow: e.target.value})}
                  placeholder="1.7500"
                  style={styles.input}
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Range High</label>
                <input
                  type="text"
                  value={editFormData.rangeHigh}
                  onChange={(e) => setEditFormData({...editFormData, rangeHigh: e.target.value})}
                  placeholder="1.7800"
                  style={styles.input}
                  required
                />
              </div>
              <div>
                <label style={styles.label}>Lot Size</label>
                <input
                  type="text"
                  value={editFormData.lotSize}
                  onChange={(e) => setEditFormData({...editFormData, lotSize: e.target.value})}
                  placeholder="0.5"
                  style={styles.input}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                style={{ ...styles.submitBtn, backgroundColor: '#10b981', flex: 1 }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
              >
                Update Note
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                style={{ ...styles.submitBtn, backgroundColor: 'var(--hover)', color: 'var(--text)' }}
                onMouseOver={(e) => e.target.style.backgroundColor = 'var(--border)'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'var(--hover)'}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Trading Notes List */}
        {items.length === 0 ? (
          <div style={styles.emptyState}>
            <svg style={{ width: '48px', height: '48px', margin: '0 auto 12px', opacity: 0.3 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p style={{ fontSize: '13px' }}>No trading notes yet</p>
            <p style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>Click "+ Add Note" to start</p>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <div
                key={item.id}
                style={styles.noteItem}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <p style={styles.noteText}>{item.text}</p>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => startEdit(item)}
                    style={{ ...styles.iconBtn, color: 'var(--muted)' }}
                    onMouseOver={(e) => e.target.style.color = '#818cf8'}
                    onMouseOut={(e) => e.target.style.color = 'var(--muted)'}
                    title="Edit"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    style={{ ...styles.iconBtn, color: 'var(--muted)' }}
                    onMouseOver={(e) => e.target.style.color = '#f87171'}
                    onMouseOut={(e) => e.target.style.color = 'var(--muted)'}
                    title="Delete"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={styles.footer}>Prepare your trades wisely!</p>
      </div>
    </div>
  );
}

// Make component globally available for React mounting
if (typeof window !== 'undefined') {
  window.TodoCard = TodoCard;
}
