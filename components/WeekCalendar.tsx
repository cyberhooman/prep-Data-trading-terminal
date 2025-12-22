'use client'

import { useState, useEffect } from 'react'

interface Event {
  id: string
  title: string
  country: string
  timestamp: number
  formatted: string
  source: string
}

export default function WeekCalendar() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStart(new Date()))

  useEffect(() => {
    loadEvents()
    const interval = setInterval(loadEvents, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day // Adjust to Sunday
    return new Date(d.setDate(diff))
  }

  function getWeekDays(startDate: Date): Date[] {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate)
      day.setDate(startDate.getDate() + i)
      days.push(day)
    }
    return days
  }

  async function loadEvents() {
    try {
      const response = await fetch('/api/events')
      const data = await response.json()
      setEvents(data)
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoading(false)
    }
  }

  function getEventsForDay(date: Date): Event[] {
    const dayStart = new Date(date.setHours(0, 0, 0, 0))
    const dayEnd = new Date(date.setHours(23, 59, 59, 999))

    return events.filter(event => {
      const eventDate = new Date(event.timestamp)
      return eventDate >= dayStart && eventDate <= dayEnd
    })
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function isToday(date: Date): boolean {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  function navigateWeek(direction: 'prev' | 'next') {
    const newStart = new Date(currentWeekStart)
    newStart.setDate(newStart.getDate() + (direction === 'next' ? 7 : -7))
    setCurrentWeekStart(newStart)
  }

  function goToCurrentWeek() {
    setCurrentWeekStart(getWeekStart(new Date()))
  }

  const weekDays = getWeekDays(currentWeekStart)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="text-sm text-slate-300">Loading calendar...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* Calendar Header with Navigation */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek('prev')}
            className="p-1 hover:bg-slate-700 rounded transition"
            title="Previous week"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button
            onClick={goToCurrentWeek}
            className="px-2 py-1 text-xs font-medium bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded hover:bg-teal-500/30 transition"
          >
            Today
          </button>
          <button
            onClick={() => navigateWeek('next')}
            className="p-1 hover:bg-slate-700 rounded transition"
            title="Next week"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2 shrink-0">
          {weekDays.map((day, index) => (
            <div
              key={index}
              className={`text-center pb-2 border-b ${
                isToday(day)
                  ? 'border-teal-500'
                  : 'border-slate-700'
              }`}
            >
              <div className="text-[10px] text-slate-500 font-medium mb-1">
                {dayNames[index]}
              </div>
              <div className={`text-sm font-semibold ${
                isToday(day)
                  ? 'text-teal-400'
                  : 'text-slate-300'
              }`}>
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-7 gap-1 flex-1 overflow-y-auto custom-scrollbar">
          {weekDays.map((day, index) => {
            const dayEvents = getEventsForDay(new Date(day))
            return (
              <div
                key={index}
                className={`flex flex-col gap-1 p-1 rounded ${
                  isToday(day)
                    ? 'bg-teal-500/5 border border-teal-500/20'
                    : 'bg-slate-800/30'
                }`}
              >
                {dayEvents.length === 0 ? (
                  <div className="text-[10px] text-slate-600 italic text-center py-2">
                    No events
                  </div>
                ) : (
                  dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="bg-slate-800 border border-slate-700 rounded p-1.5 hover:border-teal-500/50 transition group"
                      title={event.title}
                    >
                      {/* Time */}
                      <div className="flex items-center gap-1 mb-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Country Badge */}
                      <div className="inline-block px-1.5 py-0.5 bg-teal-500/15 border border-teal-500/30 rounded mb-1">
                        <span className="text-[9px] font-bold font-mono text-teal-400">
                          {event.country}
                        </span>
                      </div>

                      {/* Event Title */}
                      <div className="text-[10px] text-slate-200 leading-tight line-clamp-2 group-hover:text-teal-300 transition">
                        {event.title}
                      </div>

                      {/* High Impact Badge */}
                      <div className="flex items-center gap-1 mt-1">
                        <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                        <span className="text-[8px] font-semibold font-mono text-red-400 uppercase">
                          High
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Events Count Footer */}
      <div className="mt-2 pt-2 border-t border-slate-700 shrink-0">
        <div className="text-[10px] text-slate-500 text-center font-mono">
          {events.length} event{events.length !== 1 ? 's' : ''} this week
        </div>
      </div>
    </div>
  )
}
