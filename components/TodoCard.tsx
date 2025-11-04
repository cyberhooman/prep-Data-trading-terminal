'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

const CONFETTI_COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444", "#06b6d4"]

function ConfettiOverlay() {
  const pieces = Array.from({ length: 36 })
  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(80vh) rotate(720deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .confetti-piece { animation: none !important; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0">
        {pieces.map((_, i) => {
          const left = Math.random() * 100
          const delay = Math.random() * 0.5
          const duration = 2.5 + Math.random() * 1.2
          const size = 6 + Math.random() * 6
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
          return (
            <span
              key={i}
              className="confetti-piece absolute rounded-sm"
              style={{
                left: `${left}%`,
                top: "-10px",
                width: `${size}px`,
                height: `${size * 0.4}px`,
                backgroundColor: color,
                transform: "translateY(0)",
                animation: `confetti-fall ${duration}s ease-in forwards`,
                animationDelay: `${delay}s`,
              }}
            />
          )
        })}
      </div>
    </>
  )
}

export default function TodoCard() {
  const [items, setItems] = useState<any[]>([])
  const [dateInfo, setDateInfo] = useState({ date: "", time: "" })
  const [loading, setLoading] = useState(true)
  const [celebrating, setCelebrating] = useState(false)
  const wasAllDoneRef = useRef(false)
  const [inputValue, setInputValue] = useState("")

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const date = now.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      const time = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
      setDateInfo({ date, time })
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      const response = await fetch('/api/todos')
      const data = await response.json()
      setItems(data)
    } catch (error) {
      console.error('Error fetching todos:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (id: string) => {
    try {
      // Delete the item when checked
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
      })
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (error) {
      console.error('Error deleting todo:', error)
    }
  }

  const addItem = async (text: string) => {
    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const newItem = await response.json()
      setItems((prev) => [...prev, newItem])
    } catch (error) {
      console.error('Error adding todo:', error)
    }
  }

  const resetList = async () => {
    try {
      await Promise.all(
        items
          .filter((item) => item.done)
          .map((item) => fetch(`/api/todos/${item.id}`, { method: "DELETE" }))
      )
      await fetchItems()
    } catch (error) {
      console.error('Error resetting todos:', error)
    }
  }

  const markAllDone = async () => {
    try {
      await Promise.all(
        items
          .filter((item) => !item.done)
          .map((item) => toggleItem(item.id))
      )
    } catch (error) {
      console.error('Error marking all done:', error)
    }
  }

  const allDone = useMemo(() => items.length > 0 && items.every((i) => i.done), [items])

  useEffect(() => {
    if (allDone && !wasAllDoneRef.current) {
      setCelebrating(true)
      wasAllDoneRef.current = true
      const t = setTimeout(() => setCelebrating(false), 4000)
      return () => clearTimeout(t)
    }
    if (!allDone) {
      wasAllDoneRef.current = false
      setCelebrating(false)
    }
  }, [allDone])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      addItem(inputValue.trim())
      setInputValue("")
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  const Header = (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        allDone
          ? "bg-gradient-to-b from-emerald-700 to-emerald-600"
          : "bg-gradient-to-b from-slate-800 to-slate-700"
      }`}
    >
      <div className="flex items-center space-x-3">
        <span className="text-sm font-semibold text-slate-100">{dateInfo.date}</span>
        <span className="bg-white/10 text-slate-100 text-xs font-medium px-2 py-1 rounded-md">
          {dateInfo.time}
        </span>
      </div>

      {allDone ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">All done!</span>
          <button
            onClick={resetList}
            className="text-slate-900 font-semibold text-xs px-2 py-1 rounded-md bg-slate-100/80 hover:bg-slate-100 transition"
          >
            Reset
          </button>
        </div>
      ) : (
        <button onClick={markAllDone} className="text-slate-100 font-semibold text-sm hover:text-slate-300 transition">Done</button>
      )}
    </div>
  )

  return (
    <div
      className={`w-full rounded-2xl shadow-lg border overflow-hidden bg-slate-900/70 transition-all duration-500 ${
        allDone ? "border-emerald-700 ring-2 ring-emerald-700 scale-[1.01]" : "border-slate-700"
      } text-slate-100`}
    >
      {Header}

      <div
        className={`relative p-5 ${
          allDone
            ? "bg-[radial-gradient(circle,rgba(16,185,129,0.12)_1px,transparent_1px)]"
            : "bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]"
        } [background-size:10px_10px]`}
      >
        <h3 className="text-lg font-bold text-slate-100 mb-4">
          {allDone ? "You crushed it today" : "Things to do today"}
        </h3>

        {!allDone && (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                  item.done ? "bg-slate-800/70" : ""
                }`}
              >
                <label className="relative inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleItem(item.id)}
                    className="peer appearance-none absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded-md border transition-all duration-200 ease-out ${
                      item.done
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-slate-500 bg-slate-800"
                    }`}
                  >
                    <svg
                      className={`w-3 h-3 text-white transition-opacity duration-200 pointer-events-none ${
                        item.done ? "opacity-100" : "opacity-0"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 12 9"
                    >
                      <path d="M1 4.2L4 7L11 1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </label>

                <span
                  className={`text-sm transition-all duration-200 flex-1 ${
                    item.done ? "font-semibold text-slate-100" : "text-slate-100"
                  }`}
                >
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {allDone && (
          <div className="relative">
            <p className="mt-1 text-sm text-slate-200 font-medium">Take a breather and celebrate!</p>
            {celebrating && <ConfettiOverlay />}
          </div>
        )}

        {!allDone && (
          <div>
            <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Add a task..."
                className="flex-1 px-3 py-2 border border-slate-600 bg-slate-800 rounded-md text-sm text-slate-100 placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-500 text-white rounded-md text-sm font-semibold hover:bg-indigo-600"
              >
                Add
              </button>
            </form>
            <p className="mt-4 text-sm text-slate-300 font-medium">Keep up the great work today!</p>
          </div>
        )}
      </div>
    </div>
  )
}
