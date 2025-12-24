const { useState, useEffect, useMemo, useRef } = React;

function TodoCard() {
  const [items, setItems] = useState([]);
  const [dateInfo, setDateInfo] = useState({ date: "", time: "" });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
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

  if (loading) {
    return <div>Loading...</div>;
  }

  const Header = (
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-gray-200 to-gray-300 dark:from-slate-800 dark:to-slate-700">
      <div className="flex items-center space-x-3">
        <span className="text-sm font-semibold text-gray-800 dark:text-slate-100">{dateInfo.date}</span>
        <span className="bg-black/10 dark:bg-white/10 text-gray-800 dark:text-slate-100 text-xs font-medium px-2 py-1 rounded-md">
          {dateInfo.time}
        </span>
      </div>
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="text-indigo-600 dark:text-slate-100 font-semibold text-sm hover:text-indigo-800 dark:hover:text-slate-300 transition"
      >
        {showAddForm ? 'Cancel' : '+ Add Note'}
      </button>
    </div>
  );

  return (
    <div className="w-full rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900/70 text-gray-900 dark:text-slate-100">
      {Header}

      <div className="relative p-5 bg-[radial-gradient(circle,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10px_10px]">
        <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4">
          Data Trading Preparation
        </h3>

        {/* Currency Trend Warning */}
        {currencyTrend && (
          <div className="mb-4 p-3 bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-300 dark:border-indigo-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-indigo-800 dark:text-indigo-200 font-bold mb-1">⚠️ Don't fight the trend</p>
                <div className="text-xs text-gray-700 dark:text-slate-300 space-y-1">
                  <div>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Strongest:</span> {currencyTrend.strongest.currency} ({currencyTrend.strongest.title})
                    <span className="ml-2 text-emerald-600 dark:text-emerald-300">↑ {currencyTrend.strongest.momentum}%</span>
                  </div>
                  <div>
                    <span className="text-red-600 dark:text-red-400 font-semibold">Weakest:</span> {currencyTrend.weakest.currency} ({currencyTrend.weakest.title})
                    <span className="ml-2 text-red-600 dark:text-red-300">↓ {currencyTrend.weakest.momentum}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Permanent Trading Rule */}
        <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              Only take an advantage when <span className="text-emerald-600 dark:text-emerald-400 font-bold">GREEN</span> across the board or <span className="text-red-600 dark:text-red-400 font-bold">RED</span> across the board
            </p>
          </div>
        </div>

        {/* Add Note Form */}
        {showAddForm && (
          <form onSubmit={handleFormSubmit} className="mb-4 p-4 bg-gray-100 dark:bg-slate-800/50 border border-gray-300 dark:border-slate-600 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Currency Pair</label>
                <input
                  type="text"
                  value={formData.pair}
                  onChange={(e) => setFormData({...formData, pair: e.target.value.toUpperCase()})}
                  placeholder="e.g., GBPCAD, USDCAD"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Data Condition</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({...formData, condition: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="stronger">📈 Data Stronger</option>
                  <option value="weaker">📉 Data Weaker</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Range Low</label>
                <input
                  type="text"
                  value={formData.rangeLow}
                  onChange={(e) => setFormData({...formData, rangeLow: e.target.value})}
                  placeholder="e.g., 1.7500"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Range High</label>
                <input
                  type="text"
                  value={formData.rangeHigh}
                  onChange={(e) => setFormData({...formData, rangeHigh: e.target.value})}
                  placeholder="e.g., 1.7800"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Lot Size</label>
                <input
                  type="text"
                  value={formData.lotSize}
                  onChange={(e) => setFormData({...formData, lotSize: e.target.value})}
                  placeholder="e.g., 0.5, 1.0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-indigo-500 text-white rounded-md text-sm font-semibold hover:bg-indigo-600"
            >
              Add Trading Note
            </button>
          </form>
        )}

        {/* Edit Form */}
        {editingId && (
          <form onSubmit={handleEditSubmit} className="mb-4 p-4 bg-emerald-50 dark:bg-slate-800/50 border border-emerald-300 dark:border-emerald-500/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Edit Trading Note</h4>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Currency Pair</label>
                <input
                  type="text"
                  value={editFormData.pair}
                  onChange={(e) => setEditFormData({...editFormData, pair: e.target.value.toUpperCase()})}
                  placeholder="e.g., GBPCAD, USDCAD"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Data Condition</label>
                <select
                  value={editFormData.condition}
                  onChange={(e) => setEditFormData({...editFormData, condition: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="stronger">📈 Data Stronger</option>
                  <option value="weaker">📉 Data Weaker</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Range Low</label>
                <input
                  type="text"
                  value={editFormData.rangeLow}
                  onChange={(e) => setEditFormData({...editFormData, rangeLow: e.target.value})}
                  placeholder="e.g., 1.7500"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Range High</label>
                <input
                  type="text"
                  value={editFormData.rangeHigh}
                  onChange={(e) => setEditFormData({...editFormData, rangeHigh: e.target.value})}
                  placeholder="e.g., 1.7800"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">Lot Size</label>
                <input
                  type="text"
                  value={editFormData.lotSize}
                  onChange={(e) => setEditFormData({...editFormData, lotSize: e.target.value})}
                  placeholder="e.g., 0.5, 1.0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-400"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-md text-sm font-semibold hover:bg-emerald-600"
              >
                Update Note
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-4 py-2 bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-white rounded-md text-sm font-semibold hover:bg-gray-400 dark:hover:bg-slate-500"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Trading Notes List */}
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            <p className="text-sm">No trading notes yet. Click "+ Add Note" to start.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-gray-100 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 transition"
              >
                <div className="flex-1">
                  <p className="text-sm text-gray-900 dark:text-slate-100 font-medium">
                    {item.text}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(item)}
                    className="px-2 py-1 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-100 transition-colors text-xs"
                    title="Edit note"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="px-2 py-1 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors text-xs"
                    title="Delete note"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-sm text-gray-600 dark:text-slate-300 font-medium">Prepare your trades wisely!</p>
      </div>
    </div>
  );
}

// Make component globally available for React mounting
if (typeof window !== 'undefined') {
  window.TodoCard = TodoCard;
}
