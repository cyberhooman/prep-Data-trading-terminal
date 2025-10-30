const { useState, useEffect } = React;

function QuickNotes() {
  const [notes, setNotes] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [noteType, setNoteType] = useState('note'); // 'note' or 'warning'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const response = await fetch('/api/notes');
      const data = await response.json();
      setNotes(data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputValue.trim(),
          type: noteType,
        }),
      });
      const newNote = await response.json();
      setNotes((prev) => [newNote, ...prev]);
      setInputValue('');
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const deleteNote = async (id) => {
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  if (loading) {
    return (
      <div className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <div className="text-sm text-slate-300">Loading notes...</div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 p-5 shadow-lg">
      <h3 className="text-lg font-bold text-slate-100 mb-4">
        Quick Notes & Warnings
      </h3>

      <form onSubmit={addNote} className="mb-4 space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNoteType('note')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition ${
              noteType === 'note'
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Note
          </button>
          <button
            type="button"
            onClick={() => setNoteType('warning')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition ${
              noteType === 'warning'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Warning
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={noteType === 'warning' ? 'Enter trade warning...' : 'Enter quick note...'}
            className="flex-1 px-3 py-2 border border-slate-600 bg-slate-800 rounded-md text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
              noteType === 'warning'
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white'
            }`}
          >
            Add
          </button>
        </div>
      </form>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-4 text-center">
            No notes yet. Add your first trading note or warning above.
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`flex items-start justify-between gap-3 p-3 rounded-lg border transition ${
                note.type === 'warning'
                  ? 'bg-amber-900/20 border-amber-700/50'
                  : 'bg-slate-800/70 border-slate-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {note.type === 'warning' && (
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <span className={`text-xs font-medium ${
                    note.type === 'warning' ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-slate-100 break-words">{note.text}</p>
              </div>
              <button
                onClick={() => deleteNote(note.id)}
                className="flex-shrink-0 text-slate-400 hover:text-rose-400 transition"
                title="Delete note"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Make component globally available for React mounting
if (typeof window !== 'undefined') {
  window.QuickNotes = QuickNotes;
}
