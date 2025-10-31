const { useEffect, useMemo, useState } = React;

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
function formatMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Data Score Radar Chart Component
function DataScoreRadar({ entries }) {
  const scores = useMemo(() => {
    // Calculate various trading metrics (0-10 scale)
    const totalTrades = entries.length;
    if (totalTrades === 0) return { winRate: 0, riskReward: 0, consistency: 0, discipline: 0, execution: 0 };

    const winningTrades = entries.filter(e => e.pnl > 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 10 : 0;

    // Average P&L (normalized)
    const avgPnL = entries.reduce((sum, e) => sum + (e.pnl || 0), 0) / totalTrades;
    const riskReward = Math.min(Math.max((avgPnL / 100) * 10 + 5, 0), 10);

    // Consistency based on tags frequency
    const hasGoodTags = entries.filter(e => e.tags && e.tags.length > 0).length;
    const consistency = totalTrades > 0 ? (hasGoodTags / totalTrades) * 10 : 0;

    // Discipline based on mood tracking
    const hasMood = entries.filter(e => e.mood && e.mood.trim()).length;
    const discipline = totalTrades > 0 ? (hasMood / totalTrades) * 10 : 0;

    // Execution based on notes
    const hasNotes = entries.filter(e => e.note && e.note.trim().length > 10).length;
    const execution = totalTrades > 0 ? (hasNotes / totalTrades) * 10 : 0;

    return { winRate, riskReward, consistency, discipline, execution };
  }, [entries]);

  const metrics = [
    { label: 'Win Rate', value: scores.winRate, angle: 0 },
    { label: 'Risk/Reward', value: scores.riskReward, angle: 72 },
    { label: 'Consistency', value: scores.consistency, angle: 144 },
    { label: 'Discipline', value: scores.discipline, angle: 216 },
    { label: 'Execution', value: scores.execution, angle: 288 },
  ];

  const centerX = 100;
  const centerY = 100;
  const maxRadius = 80;

  // Generate points for the pentagon
  const dataPoints = metrics.map(m => {
    const angleRad = (m.angle - 90) * Math.PI / 180;
    const radius = (m.value / 10) * maxRadius;
    return {
      x: centerX + radius * Math.cos(angleRad),
      y: centerY + radius * Math.sin(angleRad),
      label: m.label,
      value: m.value
    };
  });

  const pathData = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ') + ' Z';

  // Guide circles
  const guideCircles = [2, 4, 6, 8, 10];

  return (
    <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/60 flex flex-col">
      <h3 className="text-sm font-semibold mb-2">Data Score</h3>
      <div className="flex-1 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-full max-w-[180px]">
          {/* Guide circles */}
          {guideCircles.map(val => (
            <circle
              key={val}
              cx={centerX}
              cy={centerY}
              r={(val / 10) * maxRadius}
              fill="none"
              stroke="rgba(148, 163, 184, 0.15)"
              strokeWidth="1"
            />
          ))}

          {/* Guide lines */}
          {metrics.map(m => {
            const angleRad = (m.angle - 90) * Math.PI / 180;
            const endX = centerX + maxRadius * Math.cos(angleRad);
            const endY = centerY + maxRadius * Math.sin(angleRad);
            return (
              <line
                key={m.label}
                x1={centerX}
                y1={centerY}
                x2={endX}
                y2={endY}
                stroke="rgba(148, 163, 184, 0.2)"
                strokeWidth="1"
              />
            );
          })}

          {/* Data polygon */}
          <path
            d={pathData}
            fill="rgba(99, 102, 241, 0.3)"
            stroke="rgba(99, 102, 241, 0.8)"
            strokeWidth="2"
          />

          {/* Data points */}
          {dataPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3"
              fill="rgb(99, 102, 241)"
            />
          ))}

          {/* Labels */}
          {metrics.map(m => {
            const angleRad = (m.angle - 90) * Math.PI / 180;
            const labelRadius = maxRadius + 15;
            const labelX = centerX + labelRadius * Math.cos(angleRad);
            const labelY = centerY + labelRadius * Math.sin(angleRad);
            return (
              <text
                key={m.label}
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fontSize="9"
                fill="rgb(203, 213, 225)"
              >
                {m.label}
              </text>
            );
          })}
        </svg>
        <div className="text-center mt-2 text-xl font-bold text-indigo-400">
          {((scores.winRate + scores.riskReward + scores.consistency + scores.discipline + scores.execution) / 5).toFixed(1)}/10
        </div>
      </div>
    </div>
  );
}

// Progress Tracker Heatmap Component
function ProgressTracker({ entries }) {
  const heatmapData = useMemo(() => {
    const data = {};
    entries.forEach(e => {
      const d = new Date(e.date);
      // Use UTC date components to avoid timezone shifts
      const date = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toDateString();
      if (!data[date]) {
        data[date] = { count: 0, totalPnL: 0 };
      }
      data[date].count += 1;
      data[date].totalPnL += e.pnl || 0;
    });
    return data;
  }, [entries]);

  // Get last 12 weeks of data
  const weeks = useMemo(() => {
    const result = [];
    const today = new Date();
    for (let w = 11; w >= 0; w--) {
      const weekData = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (w * 7 + (6 - d)));
        const dateKey = date.toDateString();
        const dayData = heatmapData[dateKey] || { count: 0, totalPnL: 0 };
        weekData.push({ date, ...dayData });
      }
      result.push(weekData);
    }
    return result;
  }, [heatmapData]);

  const getHeatColor = (pnl, count) => {
    if (count === 0) return 'rgba(51, 65, 85, 0.3)';
    if (pnl > 200) return 'rgba(34, 197, 94, 0.9)';
    if (pnl > 100) return 'rgba(34, 197, 94, 0.7)';
    if (pnl > 0) return 'rgba(34, 197, 94, 0.5)';
    if (pnl > -100) return 'rgba(239, 68, 68, 0.5)';
    if (pnl > -200) return 'rgba(239, 68, 68, 0.7)';
    return 'rgba(239, 68, 68, 0.9)';
  };

  return (
    <div className="rounded-xl border border-slate-700 p-4 bg-slate-900/60">
      <h3 className="text-sm font-semibold mb-3">Progress Tracker</h3>
      <div className="flex gap-1">
        {weeks.map((week, wIdx) => (
          <div key={wIdx} className="flex flex-col gap-1">
            {week.map((day, dIdx) => (
              <div
                key={dIdx}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getHeatColor(day.totalPnL, day.count) }}
                title={`${day.date.toLocaleDateString()}: ${day.count} trades, $${day.totalPnL.toFixed(2)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
        <span>Less</span>
        <div className="flex gap-1">
          {[0.3, 0.5, 0.7, 0.9].map(opacity => (
            <div
              key={opacity}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: `rgba(34, 197, 94, ${opacity})` }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

// Account Balance Chart Component
function AccountBalanceChart({ entries }) {
  const balanceData = useMemo(() => {
    if (entries.length === 0) return [];

    // Sort entries by date
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Starting balance
    let balance = 10000; // Default starting balance
    const data = [{ date: sorted[0]?.date, balance: balance }];

    sorted.forEach(entry => {
      balance += entry.pnl || 0;
      data.push({ date: entry.date, balance });
    });

    return data;
  }, [entries]);

  const { minBalance, maxBalance } = useMemo(() => {
    if (balanceData.length === 0) return { minBalance: 10000, maxBalance: 10000 };
    const balances = balanceData.map(d => d.balance);
    return {
      minBalance: Math.min(...balances),
      maxBalance: Math.max(...balances)
    };
  }, [balanceData]);

  const svgWidth = 300;
  const svgHeight = 100;
  const padding = 10;

  const points = balanceData.map((d, i) => {
    const x = (i / (balanceData.length - 1 || 1)) * (svgWidth - 2 * padding) + padding;
    const y = svgHeight - padding - ((d.balance - minBalance) / (maxBalance - minBalance || 1)) * (svgHeight - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const pathData = points ? `M ${points}` : '';

  return (
    <div className="rounded-xl border border-slate-700 p-4 bg-slate-900/60">
      <h3 className="text-sm font-semibold mb-3">Account Balance</h3>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-2xl font-bold text-slate-100">
          ${balanceData[balanceData.length - 1]?.balance.toFixed(2) || '0.00'}
        </div>
        <div className={`text-sm ${balanceData[balanceData.length - 1]?.balance >= 10000 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {balanceData[balanceData.length - 1]?.balance >= 10000 ? '+' : ''}
          {((balanceData[balanceData.length - 1]?.balance || 10000) - 10000).toFixed(2)}
        </div>
      </div>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-20">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = svgHeight - (pct / 100) * svgHeight;
          return (
            <line
              key={pct}
              x1={padding}
              y1={y}
              x2={svgWidth - padding}
              y2={y}
              stroke="rgba(148, 163, 184, 0.1)"
              strokeWidth="1"
            />
          );
        })}

        {/* Balance line */}
        {pathData && (
          <>
            <polyline
              points={points}
              fill="none"
              stroke="rgb(99, 102, 241)"
              strokeWidth="2"
            />
            {/* Area under curve */}
            <polygon
              points={`${padding},${svgHeight - padding} ${points} ${svgWidth - padding},${svgHeight - padding}`}
              fill="rgba(99, 102, 241, 0.1)"
            />
          </>
        )}
      </svg>
    </div>
  );
}

// Enhanced Day Cell with P&L
function DayCell({ date, entries, onSelect, isToday }) {
  const dailyPnL = useMemo(() => {
    return entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
  }, [entries]);

  const hasEntries = entries.length > 0;
  const isProfitable = dailyPnL > 0;
  const isLoss = dailyPnL < 0;

  return (
    <button
      onClick={() => onSelect(date)}
      className={`relative w-full text-left p-1.5 rounded-md border transition-all duration-200 ${
        isToday
          ? 'border-blue-500 bg-blue-900/30'
          : hasEntries
            ? isProfitable
              ? 'border-emerald-600/50 bg-emerald-900/20 hover:bg-emerald-900/30'
              : 'border-rose-600/50 bg-rose-900/20 hover:bg-rose-900/30'
            : 'border-slate-700/50 bg-slate-900/20 hover:bg-slate-800/40'
      }`}
    >
      <div className="text-[11px] text-slate-400 font-medium mb-0.5">{date.getDate()}</div>
      {hasEntries && (
        <div>
          <div className={`text-xs font-bold leading-tight ${isProfitable ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-300'}`}>
            {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(0)}
          </div>
          <div className="text-[9px] text-slate-500 leading-tight">
            {entries.length} {entries.length > 1 ? 'trades' : 'trade'}
          </div>
        </div>
      )}
    </button>
  );
}

// Monthly Goals Component
function MonthlyGoals({ entries, cursor }) {
  const stats = useMemo(() => {
    const totalPnL = entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
    const winningDays = new Set();
    const losingDays = new Set();

    entries.forEach(e => {
      const d = new Date(e.date);
      // Use UTC date components to avoid timezone shifts
      const date = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toDateString();
      if (e.pnl > 0) winningDays.add(date);
      else if (e.pnl < 0) losingDays.add(date);
    });

    const totalTradingDays = winningDays.size + losingDays.size;
    const winRate = totalTradingDays > 0 ? (winningDays.size / totalTradingDays) * 100 : 0;

    return {
      totalPnL,
      tradingDays: totalTradingDays,
      winRate: winRate.toFixed(1),
      totalTrades: entries.length
    };
  }, [entries]);

  const monthName = cursor.toLocaleString('default', { month: 'long' });
  const goalPnL = 5000; // Monthly goal

  return (
    <div className="rounded-xl border border-slate-700 p-4 bg-slate-900/60">
      <h3 className="text-sm font-semibold mb-3">{monthName} Goals</h3>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Monthly P&L</span>
            <span>{stats.totalPnL.toFixed(0)} / {goalPnL}</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${stats.totalPnL >= goalPnL ? 'bg-emerald-500' : stats.totalPnL >= 0 ? 'bg-blue-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(Math.abs(stats.totalPnL) / goalPnL * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400">Win Rate</div>
            <div className="text-xl font-bold text-slate-100">{stats.winRate}%</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400">Days</div>
            <div className="text-xl font-bold text-slate-100">{stats.tradingDays}</div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-2">
          <div className="text-xs text-slate-400">Total Trades</div>
          <div className="text-xl font-bold text-slate-100">{stats.totalTrades}</div>
        </div>
      </div>
    </div>
  );
}

function JournalCalendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [form, setForm] = useState({ title: '', note: '', pnl: '', mood: '', tags: '' });

  const monthKey = useMemo(() => formatMonthKey(cursor), [cursor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/journal?month=${encodeURIComponent(monthKey)}`);
        const data = await res.json();
        if (!cancelled) setEntries(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const days = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const firstWeekday = (start.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const totalDays = end.getDate();
    const cells = [];

    // Add empty cells before the first day
    for (let i = 0; i < firstWeekday; i++) {
      cells.push(null);
    }

    // Add all days of the month
    for (let d = 1; d <= totalDays; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }

    // Add empty cells to complete the last week
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      const d = new Date(e.date);
      // Use UTC date components to avoid timezone shifts
      const key = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [entries]);

  const todayString = new Date().toDateString();

  async function createEntry(e) {
    e.preventDefault();
    if (!selectedDate || !form.title.trim()) return;
    // Create date at noon UTC to avoid timezone issues when converting to/from ISO
    const dateUTC = new Date(Date.UTC(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12, 0, 0));
    const payload = {
      dateISO: dateUTC.toISOString(),
      title: form.title.trim(),
      note: form.note.trim(),
      pnl: form.pnl === '' ? null : Number(form.pnl),
      mood: form.mood.trim(),
      tags: form.tags,
    };
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const saved = await res.json();
    setEntries((prev) => [...prev, saved]);
    setForm({ title: '', note: '', pnl: '', mood: '', tags: '' });
  }

  async function removeEntry(id) {
    await fetch(`/api/journal/${id}`, { method: 'DELETE' });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-slate-100">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <DataScoreRadar entries={entries} />
        <ProgressTracker entries={entries} />
        <AccountBalanceChart entries={entries} />
        <MonthlyGoals entries={entries} cursor={cursor} />
      </div>

      {/* Calendar Section */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold">
            {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors text-xs font-medium"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              ← Prev
            </button>
            <button
              className="px-2.5 py-1 rounded-md bg-indigo-600 border border-indigo-500 hover:bg-indigo-700 transition-colors text-xs font-medium"
              onClick={() => setCursor(startOfMonth(new Date()))}
            >
              Today
            </button>
            <button
              className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors text-xs font-medium"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              Next →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-500 font-semibold mb-1">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={i} className="aspect-square">
              {d ? (
                <DayCell
                  date={d}
                  entries={byDay.get(d.toDateString()) || []}
                  onSelect={setSelectedDate}
                  isToday={d.toDateString() === todayString}
                />
              ) : (
                <div className="h-full rounded-md border border-slate-800/30 bg-slate-900/10" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Entry Form and List */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-700 p-4 bg-slate-900/60">
          <div className="font-semibold text-lg mb-3">
            Add Entry {selectedDate && `- ${selectedDate.toLocaleDateString()}`}
          </div>
          <form onSubmit={createEntry} className="space-y-3">
            <input
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
              placeholder="Trade Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors min-h-[100px] resize-none"
              placeholder="Trade notes: setup, entry, exit, lessons learned..."
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
                placeholder="P&L ($)"
                type="number"
                step="0.01"
                value={form.pnl}
                onChange={(e) => setForm({ ...form, pnl: e.target.value })}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
                placeholder="Mood"
                value={form.mood}
                onChange={(e) => setForm({ ...form, mood: e.target.value })}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors"
                placeholder="Tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold"
            >
              Save Entry
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-700 p-4 bg-slate-900/60">
          <div className="font-semibold text-lg mb-3">Recent Entries</div>
          {loading ? (
            <div className="text-sm text-slate-400 text-center py-8">Loading entries...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8">No entries yet. Start tracking your trades!</div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {entries.slice().reverse().map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-700 p-3 bg-slate-900/40 hover:bg-slate-900/60 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-xs text-slate-400">{new Date(e.date).toLocaleDateString()}</div>
                      <div className="font-semibold text-slate-100">{e.title}</div>
                    </div>
                    <div className={`text-lg font-bold ${e.pnl > 0 ? 'text-emerald-400' : e.pnl < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {e.pnl !== null ? `${e.pnl >= 0 ? '+' : ''}$${e.pnl.toFixed(2)}` : '-'}
                    </div>
                  </div>
                  {e.note && (
                    <div className="text-sm text-slate-300 mb-2 whitespace-pre-wrap line-clamp-3">{e.note}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {e.mood && (
                        <span className="px-2 py-1 rounded bg-slate-800 text-slate-300">
                          {e.mood}
                        </span>
                      )}
                      {e.tags?.length > 0 && e.tags.map(tag => (
                        <span key={tag} className="px-2 py-1 rounded bg-indigo-900/40 text-indigo-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => removeEntry(e.id)}
                      className="px-3 py-1 rounded-md text-xs bg-rose-600/20 hover:bg-rose-600 border border-rose-600/50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Make component globally available for React mounting
if (typeof window !== 'undefined') {
  window.JournalCalendar = JournalCalendar;
}
