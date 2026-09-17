import React, { useState, useRef, useEffect } from 'react'
import { getTodayYMD } from '../../../utils/dateUtils'
import SpecularButton from '../../../SpecularButton'
import {
  fetchRotes as fetchRotesApi,
  createRote as createRoteApi,
  toggleRote as toggleRoteApi,
  deleteRote as deleteRoteApi,
} from '../roteService'
import {
  getStoredRotes,
  persistRotes,
  createOptimisticRote,
  reconcileRotesData,
} from '../roteUtils'
import AddRoteModal from './AddRoteModal'

export function RotePage({ user, onRotesChanged }) {
  const todayStr = getTodayYMD()
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  
  const cacheRef = useRef({})
  const pendingTogglesRef = useRef(new Set())
  const pendingTempTogglesRef = useRef(new Set())
  const [loadedDates, setLoadedDates] = useState({})
  
  const [rotesData, setRotesData] = useState({ date: todayStr, user_joined_date: todayStr, rotes: [], completed_dates: [], stats: { total_rotes: 0, completed_rotes: 0 } })
  const [addModalOpen, setAddModalOpen] = useState(false)

  const fetchRotes = async (dateStr) => {
    if (cacheRef.current[dateStr]) {
      setRotesData(cacheRef.current[dateStr])
      setLoadedDates(prev => ({ ...prev, [dateStr]: true }))
    } else {
      const stored = getStoredRotes(dateStr)
      if (stored && Array.isArray(stored.rotes)) {
        cacheRef.current[dateStr] = stored
        setRotesData(stored)
        setLoadedDates(prev => ({ ...prev, [dateStr]: true }))
      }
    }

    try {
      const serverData = await fetchRotesApi(dateStr)
      const stored = getStoredRotes(dateStr)
      const localRotes = stored?.rotes || []
      const mergedData = reconcileRotesData(serverData, localRotes, pendingTempTogglesRef.current)

      cacheRef.current[dateStr] = mergedData
      persistRotes(dateStr, mergedData)
      setRotesData(mergedData)
      setLoadedDates(prev => ({ ...prev, [dateStr]: true }))
      if (dateStr === todayStr && onRotesChanged) {
        onRotesChanged(mergedData)
      }
    } catch (err) {
      console.error('Failed to fetch rotes:', err)
      setLoadedDates(prev => ({ ...prev, [dateStr]: true }))
    }
  }

  useEffect(() => {
    fetchRotes(selectedDate)
  }, [selectedDate])

  const toggleRote = async (roteId) => {
    const targetIdStr = String(roteId)
    
    // Determine target completed status
    const currentRotes = rotesData?.rotes || []
    const currentItem = currentRotes.find(r => String(r.id) === targetIdStr)
    const targetStatus = currentItem ? !currentItem.completed : true

    // Optimistically update instantly
    const updated = currentRotes.map(r => String(r.id) === targetIdStr ? { ...r, completed: targetStatus } : r)
    const doneCount = updated.filter(r => r.completed).length
    const nextState = {
      ...rotesData,
      rotes: updated,
      stats: { ...(rotesData?.stats || {}), completed_rotes: doneCount }
    }
    setRotesData(nextState)
    cacheRef.current[selectedDate] = nextState
    persistRotes(selectedDate, nextState)

    if (selectedDate === todayStr && onRotesChanged) {
      onRotesChanged(nextState)
    }

    if (targetIdStr.startsWith('temp-')) {
      pendingTempTogglesRef.current.add(targetIdStr)
      return
    }

    // Send update request to backend in background
    try {
      const result = await toggleRoteApi(roteId, { date: selectedDate, completed: targetStatus })
      const confirmedStatus = Boolean(result.completed)
      if (confirmedStatus !== targetStatus) {
        setRotesData(prev => {
          const reUpdated = prev.rotes.map(r => String(r.id) === targetIdStr ? { ...r, completed: confirmedStatus } : r)
          const reDoneCount = reUpdated.filter(r => r.completed).length
          const reNextState = {
            ...prev,
            rotes: reUpdated,
            stats: { ...prev.stats, completed_rotes: reDoneCount }
          }
          cacheRef.current[selectedDate] = reNextState
          persistRotes(selectedDate, reNextState)
          if (selectedDate === todayStr && onRotesChanged) {
            onRotesChanged(reNextState)
          }
          return reNextState
        })
      }
    } catch (err) {
      console.error('Failed to update rote in system database:', err)
      // Revert optimistic update on failure
      setRotesData(prev => {
        const revUpdated = prev.rotes.map(r => String(r.id) === targetIdStr ? { ...r, completed: !targetStatus } : r)
        const revDoneCount = revUpdated.filter(r => r.completed).length
        const revNextState = {
          ...prev,
          rotes: revUpdated,
          stats: { ...prev.stats, completed_rotes: revDoneCount }
        }
        cacheRef.current[selectedDate] = revNextState
        persistRotes(selectedDate, revNextState)
        if (selectedDate === todayStr && onRotesChanged) {
          onRotesChanged(revNextState)
        }
        return revNextState
      })
    }
  }

  const deleteRote = async (roteId) => {
    const targetIdStr = String(roteId)
    const currentRotes = rotesData?.rotes || []
    const updated = currentRotes.filter(r => String(r.id) !== targetIdStr)
    const doneCount = updated.filter(r => r.completed).length
    const nextState = {
      ...rotesData,
      rotes: updated,
      stats: { ...(rotesData?.stats || {}), total_rotes: updated.length, completed_rotes: doneCount }
    }
    setRotesData(nextState)
    cacheRef.current[selectedDate] = nextState
    persistRotes(selectedDate, nextState)

    if (selectedDate === todayStr && onRotesChanged) {
      onRotesChanged(nextState)
    }

    if (String(roteId).startsWith('temp-')) return

    try {
      await deleteRoteApi(roteId)
    } catch (err) {
      console.error('Failed to delete rote:', err)
    }
  }

  const createRote = async (title) => {
    setAddModalOpen(false)

    const tempItem = createOptimisticRote(title, todayStr)
    const tempId = tempItem.id

    const currentRotes = rotesData?.rotes || []
    const updated = [...currentRotes, tempItem]
    const doneCount = updated.filter(r => r.completed).length
    const nextState = {
      ...rotesData,
      rotes: updated,
      stats: { ...(rotesData?.stats || {}), total_rotes: updated.length, completed_rotes: doneCount }
    }
    setRotesData(nextState)
    cacheRef.current[todayStr] = nextState
    persistRotes(todayStr, nextState)

    if (onRotesChanged) {
      onRotesChanged(nextState)
    }

    try {
      const newItem = await createRoteApi({ title, description: '', date: todayStr })
      setRotesData(prev => {
        const wasCompleted = pendingTempTogglesRef.current.has(tempId)
        pendingTempTogglesRef.current.delete(tempId)

        const reUpdated = prev.rotes.map(r => r.id === tempId ? { ...newItem, completed: wasCompleted || r.completed } : r)
        const reDoneCount = reUpdated.filter(r => r.completed).length
        const updatedNextState = {
          ...prev,
          rotes: reUpdated,
          stats: { ...prev.stats, total_rotes: reUpdated.length, completed_rotes: reDoneCount }
        }
        cacheRef.current[todayStr] = updatedNextState
        persistRotes(todayStr, updatedNextState)
        if (onRotesChanged) {
          onRotesChanged(updatedNextState)
        }
        return updatedNextState
      })
      if (pendingTempTogglesRef.current.has(tempId)) {
        toggleRote(newItem.id)
      }
    } catch (err) {
      console.error('Failed to create rote:', err)
    }
  }

  const joinedDateStr = rotesData.user_joined_date || todayStr
  const joinedDateParts = joinedDateStr.split('-')
  const joinedYear = Number(joinedDateParts[0]) || 2026
  const joinedMonth = (Number(joinedDateParts[1]) || 1) - 1

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7

  const canGoPrev = viewYear > joinedYear || (viewYear === joinedYear && viewMonth > joinedMonth)
  const todayDateObj = new Date()
  const canGoNext = viewYear < todayDateObj.getFullYear() || (viewYear === todayDateObj.getFullYear() && viewMonth < todayDateObj.getMonth())

  const handlePrevMonth = () => {
    if (!canGoPrev) return
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (!canGoNext) return
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const isSelectedDate = (dateString) => dateString === selectedDate
  const isToday = (dateString) => dateString === todayStr
  const isCompletedDate = (dateString) => (rotesData.completed_dates || []).includes(dateString)

  const isDateDisabled = (year, month, day) => {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (dStr < joinedDateStr) return true
    if (dStr > todayStr) return true
    return false
  }

  const formatDateDisplay = (dateString) => {
    if (!dateString) return ''
    const parts = dateString.split('-')
    if (parts.length !== 3) return dateString
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    const mName = d.toLocaleString('en-US', { month: 'long' })
    return `${mName} ${d.getDate()}, ${d.getFullYear()}`
  }

  const completedCount = rotesData.stats?.completed_rotes || 0
  const totalCount = rotesData.stats?.total_rotes || 0
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const isCurrentDateLoaded = Boolean(loadedDates[selectedDate])

  return (
    <div className="workspace-page rote-page-custom">
      <header className="goals-page-header">
        <div className="goals-header-left">
          <span className="goals-sprint-badge">DAY-WISE</span>
          <h1 className="goals-sprint-title">
            Routine <em>Rote</em>
          </h1>
          <p className="goals-subtitle">
            Completing unwanted tasks that you feel don't develop yourself — like record writing, mandatory paperwork, or mechanical chores.
          </p>
        </div>
        {selectedDate === todayStr && (
          <SpecularButton
            size="md"
            radius={18}
            tint="#ffffff"
            tintOpacity={0}
            blur={0}
            textColor="#f5f5f5"
            lineColor="#ffffff"
            baseColor="#525252"
            intensity={1}
            shineSize={10}
            shineFade={40}
            thickness={1}
            speed={0.35}
            followMouse
            proximity={250}
            autoAnimate={false}
            onClick={() => setAddModalOpen(true)}
          >
            + Add Routine Rote
          </SpecularButton>
        )}
      </header>

      <div className="rote-layout-grid">
        <div className="rote-calendar-card card">
          <div className="rote-calendar-header">
            <button type="button" className="calendar-nav-btn" onClick={handlePrevMonth} disabled={!canGoPrev} aria-label="Previous month">‹</button>
            <div className="calendar-month-title">
              <span>{monthNames[viewMonth]} {viewYear}</span>
            </div>
            <button type="button" className="calendar-nav-btn" onClick={handleNextMonth} disabled={!canGoNext} aria-label="Next month">›</button>
          </div>

          <div className="rote-calendar-weekdays">
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>

          <div className="rote-calendar-days-grid">
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`blank-${idx}`} className="calendar-day-cell blank" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1
              const dateString = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
              const disabled = isDateDisabled(viewYear, viewMonth, dayNum)
              const selected = isSelectedDate(dateString)
              const today = isToday(dateString)
              const completed = isCompletedDate(dateString)

              return (
                <button
                  key={dayNum}
                  disabled={disabled}
                  className={`calendar-day-cell ${selected ? 'selected' : ''} ${today ? 'today' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => setSelectedDate(dateString)}
                >
                  <span className="day-number">{dayNum}</span>
                </button>
              )
            })}
          </div>

          <div className="rote-calendar-footer">
            <span>Active since {joinedDateStr}</span>
            {selectedDate !== todayStr && (
              <>
                <span className="footer-dot-sep">•</span>
                <button className="calendar-today-link" onClick={() => {
                  setSelectedDate(todayStr);
                  setViewYear(new Date().getFullYear());
                  setViewMonth(new Date().getMonth());
                }}>
                  Today
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rote-checklist-card card">
          <div className="rote-day-header">
            <div>
              <span className="rote-day-label">
                {selectedDate === todayStr ? 'TODAY\'S ROUTINES' : 'HISTORICAL DAY CHECKLIST'}
              </span>
              <h2>{formatDateDisplay(selectedDate)}</h2>
            </div>
            <div className="rote-day-counter">
              <b>{completedCount} / {totalCount}</b>
              <span>Done</span>
            </div>
          </div>

          {totalCount > 0 && (
            <div className="rote-day-progress-bar-wrap">
              <div className="rote-day-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          <div className="rote-list">
            {!isCurrentDateLoaded ? (
              <div className="rote-skeleton-wrap">
                <div className="rote-skeleton-row" />
                <div className="rote-skeleton-row" />
              </div>
            ) : rotesData.rotes && rotesData.rotes.length > 0 ? (
              rotesData.rotes.map(rote => {
                return (
                  <div
                    key={rote.id}
                    className={`rote-row ${rote.completed ? 'completed' : ''}`}
                    role="checkbox"
                    aria-checked={!!rote.completed}
                    aria-label={`Mark ${rote.title} as ${rote.completed ? 'not done' : 'done'}`}
                    tabIndex={0}
                    onClick={() => toggleRote(rote.id)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleRote(rote.id) } }}
                    style={{ cursor: 'pointer', touchAction: 'manipulation' }}
                  >
                    <div className="rote-checkbox" aria-hidden="true">
                      {rote.completed ? '✓' : ''}
                    </div>
                    <div className="rote-info">
                      <span className="rote-title">{rote.title}</span>
                    </div>
                    <div className="rote-meta">
                      <span className={`rote-status-tag ${rote.completed ? 'done' : 'pending'}`}>
                        {rote.completed ? 'DONE' : 'PENDING'}
                      </span>
                      <button type="button" className="rote-delete-btn" onClick={(e) => { e.stopPropagation(); deleteRote(rote.id); }}>
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rote-empty-state">
                <p>{selectedDate === todayStr ? 'No routine rotes configured for today.' : 'No routine rotes were logged for this day.'}</p>
                {selectedDate === todayStr && (
                  <button className="add-button" style={{ marginTop: '12px', display: 'inline-block' }} onClick={() => setAddModalOpen(true)}>+ Add Routine Rote</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddRoteModal 
        isOpen={addModalOpen} 
        onClose={() => setAddModalOpen(false)} 
        onSubmit={createRote} 
      />
    </div>
  )
}

export default RotePage
