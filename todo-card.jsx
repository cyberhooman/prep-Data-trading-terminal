const { useState, useEffect, useMemo, useRef } = React;

function TodoCard() {
  const [items, setItems] = useState([]);
  const [dateInfo, setDateInfo] = useState({ date: "", time: "" });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

  const updateItem = async (id, text) => {
    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const updatedItem = await response.json();
      setItems((prev) => prev.map((item) => (item.id === id ? updatedItem : item)));
      setEditingId(null);
    } catch (error) {
      console.error('Error updating note:', error);
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
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-slate-800 to-slate-700">
      <div className="flex items-center space-x-3">
        <span className="text-sm font-semibold text-slate-100">{dateInfo.date}</span>
        <span className="bg-white/10 text-slate-100 text-xs font-medium px-2 py-1 rounded-md">
          {dateInfo.time}
        </span>
      </div>
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="text-slate-100 font-semibold text-sm hover:text-slate-300 transition"
      >
        {showAddForm ? 'Cancel' : '+ Add Note'}
      </button>
    </div>
  );

  return (
    <div className="w-full rounded-2xl shadow-lg border border-slate-700 overflow-hidden bg-slate-900/70 text-slate-100">
      {Header}

      <div className="relative p-5 bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10px_10px]">
        <h3 className="text-lg font-bold text-slate-100 mb-4">
          Data Trading Preparation
        </h3>

        {/* Permanent Trading Rule */}
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-amber-200 font-medium">
              Only take an advantage when <span className="text-emerald-400 font-bold">GREEN</span> across the board or <span className="text-red-400 font-bold">RED</span> across the board
            </p>
          </div>
        </div>

        {/* Add Note Form */}
        {showAddForm && (
          <form onSubmit={handleFormSubmit} className="mb-4 p-4 bg-slate-800/50 border border-slate-600 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Currency Pair</label>
                <input
                  type="text"
                  value={formData.pair}
                  onChange={(e) => setFormData({...formData, pair: e.target.value.toUpperCase()})}
                  placeholder="e.g., GBPCAD, USDCAD"
                  className="w-full px-3 py-2 border border-slate-600 bg-slate-800 rounded text-sm text-slate-100 placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Data Condition</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({...formData, condition: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-600 bg-slate-800 rounded text-sm text-slate-100"
                >
                  <option value="stronger">📈 Data Stronger</option>
                  <option value="weaker">📉 Data Weaker</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Range Low</label>
                <input
                  type="text"
                  value={formData.rangeLow}
                  onChange={(e) => setFormData({...formData, rangeLow: e.target.value})}
                  placeholder="e.g., 1.7500"
                  className="w-full px-3 py-2 border border-slate-600 bg-slate-800 rounded text-sm text-slate-100 placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Range High</label>
                <input
                  type="text"
                  value={formData.rangeHigh}
                  onChange={(e) => setFormData({...formData, rangeHigh: e.target.value})}
                  placeholder="e.g., 1.7800"
                  className="w-full px-3 py-2 border border-slate-600 bg-slate-800 rounded text-sm text-slate-100 placeholder:text-slate-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Lot Size</label>
                <input
                  type="text"
                  value={formData.lotSize}
                  onChange={(e) => setFormData({...formData, lotSize: e.target.value})}
                  placeholder="e.g., 0.5, 1.0"
                  className="w-full px-3 py-2 border border-slate-600 bg-slate-800 rounded text-sm text-slate-100 placeholder:text-slate-400"
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

        {/* Trading Notes List */}
        {items.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">No trading notes yet. Click "+ Add Note" to start.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-800/70 border border-slate-700 hover:border-slate-600 transition"
              >
                <div className="flex-1">
                  <p className="text-sm text-slate-100 font-medium">
                    {item.text}
                  </p>
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="px-2 py-1 text-red-400 hover:text-red-300 transition-colors text-xs"
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
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-sm text-slate-300 font-medium">Prepare your trades wisely!</p>
      </div>
    </div>
  );
}

// Make component globally available for React mounting
if (typeof window !== 'undefined') {
  window.TodoCard = TodoCard;
}
