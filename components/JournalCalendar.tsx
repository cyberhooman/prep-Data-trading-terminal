'use client'

import { useState, useEffect } from 'react'

interface JournalEntry {
  id: string
  date: string
  content: string
  mood?: 'great' | 'good' | 'neutral' | 'bad'
  pnl?: number
}

export default function JournalCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEntries()
  }, [])

  const fetchEntries = async () => {
    try {
      const response = await fetch('/api/journal')
      const data = await response.json()
      setEntries(data)
    } catch (error) {
      console.error('Error fetching journal entries:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveEntry = async () => {
    if (!selectedDate || !editContent.trim()) return

    try {
      const existingEntry = entries.find(e => e.date === selectedDate)

      if (existingEntry) {
        await fetch(`/api/journal/${existingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editContent })
        })
      } else {
        await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate, content: editContent })
        })
      }

      await fetchEntries()
      setIsEditing(false)
    } catch (error) {
      console.error('Error saving journal entry:', error)
    }
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDay = firstDay.getDay()

    return { daysInMonth, startingDay }
  }

  const { daysInMonth, startingDay } = getDaysInMonth(currentDate)

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const formatDateKey = (day: number) => {
    const year = currentDate.getFullYear()
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0')
    const dayStr = day.toString().padStart(2, '0')
    return `${year}-${month}-${dayStr}`
  }

  const getEntryForDay = (day: number) => {
    const dateKey = formatDateKey(day)
    return entries.find(e => e.date === dateKey)
  }

  const handleDayClick = (day: number) => {
    const dateKey = formatDateKey(day)
    const entry = getEntryForDay(day)
    setSelectedDate(dateKey)
    setEditContent(entry?.content || '')
    setIsEditing(true)
  }

  const isToday = (day: number) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    )
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      {/* Calendar Grid */}
      <div>
        {/* Month Navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem'
        }}>
          <button onClick={prevMonth} className="btn btn-ghost btn-sm">
            ← Prev
          </button>
          <h3 style={{
            fontSize: '1.25rem',
            fontWeight: '700',
            color: 'var(--text-primary)'
          }}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <button onClick={nextMonth} className="btn btn-ghost btn-sm">
            Next →
          </button>
        </div>

        {/* Weekday Headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.25rem',
          marginBottom: '0.5rem'
        }}>
          {weekDays.map(day => (
            <div key={day} style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              fontWeight: '600',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              padding: '0.5rem'
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.25rem'
        }}>
          {/* Empty cells for days before month starts */}
          {Array.from({ length: startingDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{ aspectRatio: '1' }} />
          ))}

          {/* Days of the month */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const entry = getEntryForDay(day)
            const hasEntry = !!entry
            const today = isToday(day)

            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: today ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  background: hasEntry ? 'var(--accent-primary)' : 'var(--bg-primary)',
                  color: hasEntry ? 'var(--text-inverse)' : today ? 'var(--accent-primary)' : 'var(--text-primary)',
                  fontWeight: today || hasEntry ? '700' : '500',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  padding: 0
                }}
                onMouseOver={(e) => {
                  if (!hasEntry) {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                  }
                }}
                onMouseOut={(e) => {
                  if (!hasEntry) {
                    e.currentTarget.style.background = 'var(--bg-primary)'
                  }
                }}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      {/* Entry Editor/Viewer */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: '1.5rem'
      }}>
        {selectedDate ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem'
            }}>
              <h4 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: 'var(--text-primary)'
              }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
              </h4>
              <button
                onClick={() => setSelectedDate(null)}
                className="btn btn-ghost btn-sm"
              >
                Close
              </button>
            </div>

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your trading notes for this day..."
              style={{
                width: '100%',
                minHeight: '200px',
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />

            <button onClick={saveEntry} className="btn-primary" style={{ width: '100%' }}>
              Save Entry
            </button>
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '250px',
            color: 'var(--text-muted)'
          }}>
            <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Select a date</p>
            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
              Click on any day to add or view notes
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
