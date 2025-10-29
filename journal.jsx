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

function DayCell({ date, entries, onSelect }) {
  const hasEntries = (entries?.length || 0) > 0;
  return (
    <button
      onClick={() => onSelect(date)}
      className={`text-left p-2 rounded-md border transition-colors duration-150 ${
        hasEntries ? 'border-emerald-600 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/30'
      } hover:bg-slate-800/40`}
    >
      <div className="text-xs text-slate-300">{date.getDate()}</div>
      {hasEntries && (
        <div className="mt-1 flex flex-col gap-1">
          {entries.slice(0, 2).map((e) => (
            <div key={e.id} className="text-[11px] truncate text-slate-100">
              {e.title}
            </div>
          ))}
          {entries.length > 2 && (
            <div className="text-[11px] text-slate-400">+{entries.length - 2} more</div>
          )}
        </div>
      )}
    </button>
  );
}

function PnLSummary({ entries }) {
  const monthlyPnL = useMemo(() => {
    const summary = {};
    entries.forEach(entry => {
      if (entry.pnl !== null) {
        const date = new Date(entry.date);
        const monthKey = date.toLocaleString('default', { year: 'numeric', month: 'long' });
        summary[monthKey] = (summary[monthKey] || 0) + Number(entry.pnl);
      }
    });
    return summary;
  }, [entries]);

  const weeklyPnL = useMemo(() => {
    const summary = {};
    entries.forEach(entry => {
      if (entry.pnl !== null) {
        const date = new Date(entry.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1); // Start from Monday
        const weekKey = `Week of ${weekStart.toLocaleDateString()}`;
        summary[weekKey] = (summary[weekKey] || 0) + Number(entry.pnl);
      }
    });
    return summary;
  }, [entries]);

  return (
    <div className="grid md:grid-cols-2 gap-4 mb-4">
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/60">
        <h3 className="text-lg font-semibold mb-2">Monthly P&L Summary</h3>
        <div className="overflow-auto max-h-48">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-300">
                <th className="py-2">Month</th>
                <th className="py-2">P&L</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(monthlyPnL).map(([month, total]) => (
                <tr key={month} className="border-t border-slate-700">
                  <td className="py-2">{month}</td>
                  <td className={`py-2 ${total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {total >= 0 ? '+' : ''}{total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/60">
        <h3 className="text-lg font-semibold mb-2">Weekly P&L Summary</h3>
        <div className="overflow-auto max-h-48">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-300">
                <th className="py-2">Week</th>
                <th className="py-2">P&L</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(weeklyPnL).map(([week, total]) => (
                <tr key={week} className="border-t border-slate-700">
                  <td className="py-2">{week}</td>
                  <td className={`py-2 ${total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {total >= 0 ? '+' : ''}{total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      const d = new Date(e.date);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [entries]);

  async function createEntry(e) {
    e.preventDefault();
    if (!selectedDate || !form.title.trim()) return;
    const payload = {
      dateISO: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toISOString(),
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
      <PnLSummary entries={entries} />
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">
          {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded-md bg-slate-800 border border-slate-600" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            Prev
          </button>
          <button className="px-2 py-1 rounded-md bg-slate-800 border border-slate-600" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </button>
          <button className="px-2 py-1 rounded-md bg-slate-800 border border-slate-600" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-slate-300 mb-2">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((row, i) => (
          <React.Fragment key={i}>
            {row.map((d, j) => (
              <div key={j} className="min-h-[84px]">
                {d ? (
                  <DayCell
                    date={d}
                    entries={byDay.get(d.toDateString()) || []}
                    onSelect={setSelectedDate}
                  />
                ) : (
                  <div className="rounded-md border border-slate-800 bg-slate-900/30" />
                )}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/60">
          <div className="font-semibold mb-2">Add Entry {selectedDate && `for ${selectedDate.toLocaleDateString()}`}</div>
          <form onSubmit={createEntry} className="grid gap-2">
            <input className="px-3 py-2 rounded-md bg-slate-800 border border-slate-600" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className="px-3 py-2 rounded-md bg-slate-800 border border-slate-600 min-h-[80px]" placeholder="Notes (setup, reasoning, outcome)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input className="px-3 py-2 rounded-md bg-slate-800 border border-slate-600" placeholder="PnL" value={form.pnl} onChange={(e) => setForm({ ...form, pnl: e.target.value })} />
              <input className="px-3 py-2 rounded-md bg-slate-800 border border-slate-600" placeholder="Mood (e.g. calm)" value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} />
              <input className="px-3 py-2 rounded-md bg-slate-800 border border-slate-600" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <button className="mt-1 px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600">Save</button>
          </form>
        </div>
        <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/60">
          <div className="font-semibold mb-2">Entries this month</div>
          {loading ? (
            <div className="text-sm text-slate-300">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-slate-300">No entries yet.</div>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="rounded-md border border-slate-700 p-2 bg-slate-900/40">
                  <div className="text-xs text-slate-300">{new Date(e.date).toLocaleDateString()}</div>
                  <div className="font-medium">{e.title}</div>
                  {e.note && <div className="text-sm text-slate-200 whitespace-pre-wrap">{e.note}</div>}
                  <div className="mt-1 text-xs text-slate-400 flex flex-wrap gap-3">
                    {e.pnl !== null && <span>PnL: {e.pnl}</span>}
                    {e.mood && <span>Mood: {e.mood}</span>}
                    {e.tags?.length > 0 && <span>Tags: {e.tags.join(', ')}</span>}
                  </div>
                  <div className="mt-2">
                    <button onClick={() => removeEntry(e.id)} className="px-2 py-1 rounded-md text-sm bg-rose-600 hover:bg-rose-700">Delete</button>
                  </div>
                </li>) )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

