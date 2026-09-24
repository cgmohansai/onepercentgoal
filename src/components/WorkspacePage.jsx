import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Gear, SignOut, ShareNetwork, PencilSimple, Fire } from '@phosphor-icons/react'
import SpecularButton from '../SpecularButton'
import {
  isNativeApp,
  checkNotificationPermission,
  requestNotificationPermission,
  scheduleDailyReminders,
  cancelDailyReminders,
  areExactAlarmsAllowed,
  requestExactAlarmAccess,
  getTargetDates,
} from '../reminders'
import {
  DAY,
  getSprintBoundary,
  formatDateWithTime,
} from '../utils/dateUtils'
import {
  getSprintTileState,
  formatSprintDateRange,
} from '../features/timeline/timelineUtils'
import GoalRow from '../features/goals/components/GoalRow'
import RotePage from '../features/rotes/components/RotePage'
import SprintHistoryModal from '../features/timeline/components/SprintHistoryModal'
import EditProfileModal from './EditProfileModal'
import AppFooter from './AppFooter'
import HeaderInfoTooltip from './HeaderInfoTooltip'
import NotesSection from '../features/notes/components/NotesSection'

function formatDisplayReminderTime(val) {
  if (!val) return ''
  const parts = String(val).split(':')
  if (parts.length < 2) return val
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return val
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  const minStr = String(m).padStart(2, '0')
  return `${hour12}:${minStr} ${ampm}`
}

export function WorkspacePage({
  active,
  data,
  user,
  goals,
  profile,
  history,
  historyModal,
  selectedYear,
  availableYears,
  onSelectYear,
  onOpenSprint,
  onCloseSprint,
  onProgress,
  onComplete,
  onDelete,
  onAdd,
  onShowGoalDetails,
  onUpdateProfile,
  showToast,
  onLogout,
  onRotesChanged,
  editModalOpen,
  setEditModalOpen,
  setActive,
  roteStats,
  isGoalsLoading = false,
}) {

  // Profile image cropping state
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropImageDims, setCropImageDims] = useState({ width: 200, height: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const settingsMenuRef = useRef(null)

  const currentSprintRef = useRef(null)

  const handleScrollToCurrentSprint = useCallback(() => {
    const doScroll = () => {
      const el =
        currentSprintRef.current ||
        document.getElementById('current-sprint-tile') ||
        document.querySelector('.sprint-tile.current')
      if (!el) return

      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      } catch (err) {
        el.scrollIntoView(true)
      }

      // Also ensure mobile scroll container (.content) is centered smoothly
      const content = el.closest('.content')
      if (content && content.scrollHeight > content.clientHeight) {
        const elRect = el.getBoundingClientRect()
        const contentRect = content.getBoundingClientRect()
        const targetScrollTop =
          content.scrollTop + (elRect.top - contentRect.top) - (content.clientHeight / 2) + (el.clientHeight / 2)
        content.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
      }

      el.classList.remove('sprint-tile-highlight-pulse')
      void el.offsetWidth
      el.classList.add('sprint-tile-highlight-pulse')
      setTimeout(() => {
        el.classList.remove('sprint-tile-highlight-pulse')
      }, 1600)
    }

    if (selectedYear !== data.year) {
      if (typeof onSelectYear === 'function') {
        onSelectYear(data.year)
      }
      setTimeout(doScroll, 180)
      return
    }

    doScroll()
  }, [selectedYear, data.year, onSelectYear])

  const [remindersEnabled, setRemindersEnabled] = useState(() => localStorage.getItem('opg.reminders.enabled') === '1')
  const [reminderTime, setReminderTime] = useState(() => localStorage.getItem('opg.reminders.time') || '21:00')
  const [remindersBusy, setRemindersBusy] = useState(false)

  useEffect(() => {
    if (!isNativeApp()) return
    if (localStorage.getItem('opg.reminders.enabled') !== '1') return
    const [hour, minute] = (localStorage.getItem('opg.reminders.time') || '21:00').split(':').map(Number)
    checkNotificationPermission()
      .then(granted => {
        if (granted) return scheduleDailyReminders(hour, minute)
        setRemindersEnabled(false)
        return null
      })
      .catch(err => console.error('Failed to restore reminders:', err))
  }, [])

  const saveReminders = async (explicitEnabled = true) => {
    if (!isNativeApp()) {
      showToast('Reminders are available in the app version')
      return
    }
    const isTargetEnabled = typeof explicitEnabled === 'boolean' ? explicitEnabled : true
    if (reminderRescheduleTimer.current) clearTimeout(reminderRescheduleTimer.current)
    setRemindersBusy(true)
    try {
      if (isTargetEnabled) {
        const granted = await requestNotificationPermission()
        if (!granted) {
          setRemindersEnabled(false)
          localStorage.setItem('opg.reminders.enabled', '0')
          showToast('Permission denied — allow notifications in Settings')
          return
        }
        const [hour, minute] = reminderTime.split(':').map(Number)
        const pending = await scheduleDailyReminders(hour, minute)
        setRemindersEnabled(true)
        localStorage.setItem('opg.reminders.enabled', '1')
        localStorage.setItem('opg.reminders.time', reminderTime)
        const exactAlarms = await areExactAlarmsAllowed()
        const { targetGoal } = getTargetDates(hour, minute)
        const now = new Date()
        const isToday = targetGoal.getDate() === now.getDate() && targetGoal.getMonth() === now.getMonth()
        const dayLabel = isToday ? 'today' : '(starts tomorrow)'
        if (!exactAlarms) {
          requestExactAlarmAccess()
          showToast(pending >= 1 ? `Reminders set for ${reminderTime} ${dayLabel} — allow "Alarms & reminders"` : 'Reminders could not be scheduled')
        } else {
          showToast(pending >= 1 ? `Daily reminders scheduled for ${reminderTime} ${dayLabel}` : 'Reminders could not be scheduled')
        }
      } else {
        await cancelDailyReminders()
        setRemindersEnabled(false)
        localStorage.setItem('opg.reminders.enabled', '0')
        showToast('Reminders paused')
      }
    } catch (err) {
      console.error('Failed to update reminders:', err)
      showToast('Failed to update reminders')
    } finally {
      setRemindersBusy(false)
    }
  }

  const handleRemindersToggle = checked => {
    setRemindersEnabled(checked)
    saveReminders(checked)
  }

  const reminderRescheduleTimer = useRef(null)

  // Whenever the time is changed while reminders are on, immediately follow
  // the updated time: cancel the old alarms and schedule the new ones.
  const handleReminderTimeChange = value => {
    setReminderTime(value)
    if (!isNativeApp() || !remindersEnabled) return
    if (reminderRescheduleTimer.current) clearTimeout(reminderRescheduleTimer.current)
    reminderRescheduleTimer.current = setTimeout(async () => {
      try {
        const [hour, minute] = String(value || '').split(':').map(Number)
        if (Number.isNaN(hour) || Number.isNaN(minute)) return
        const granted = await checkNotificationPermission()
        if (!granted) {
          showToast('Permission denied — allow notifications in Settings')
          return
        }
        await scheduleDailyReminders(hour, minute)
        localStorage.setItem('opg.reminders.enabled', '1')
        localStorage.setItem('opg.reminders.time', value)
        const exactAlarms = await areExactAlarmsAllowed()
        const { targetGoal } = getTargetDates(hour, minute)
        const now = new Date()
        const isToday = targetGoal.getDate() === now.getDate() && targetGoal.getMonth() === now.getMonth()
        const dayLabel = isToday ? 'today' : '(starts tomorrow)'
        if (!exactAlarms) {
          requestExactAlarmAccess()
          showToast(`Moved to ${value} ${dayLabel} — allow "Alarms & reminders" or it won't fire on time`)
        } else {
          showToast(`Reminders moved to ${value} ${dayLabel}`)
        }
      } catch (err) {
        console.error('Failed to reschedule reminders:', err)
      }
    }, 100)
  }

  useEffect(() => () => {
    if (reminderRescheduleTimer.current) clearTimeout(reminderRescheduleTimer.current)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setShowSettingsMenu(false)
      }
    }
    if (showSettingsMenu) {
      document.addEventListener('pointerdown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [showSettingsMenu])

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    } catch {
      window.scrollTo(0, 0)
    }
    const contentEl = document.querySelector('.content')
    if (contentEl) {
      contentEl.scrollTop = 0
      contentEl.scrollLeft = 0
    }
  }, [active])

  // Calculate active sprint date range
  const sprintNum = (data.percentage && data.percentage > 0)
    ? Math.min(100, Math.max(1, Math.floor(data.percentage)))
    : (data.sprint_number || data.sprint || 1)
  const sprintStart = data.sprintStart || getSprintBoundary(data.year, sprintNum - 1)
  const sprintEnd = data.checkpointEnd || new Date(data.sprint_end)
  const dateStr = `${formatDateWithTime(sprintStart)} — ${formatDateWithTime(sprintEnd)}`

  if (active === 'Goals') {
    return (
      <div className="workspace-page goals-page-custom">
        <header className="goals-page-header">
          <div className="goals-badge-row">
            <span className="goals-sprint-badge">ACTIVE SPRINT CYCLE</span>
          </div>
          <div className="goals-title-action-row">
            <div className="goals-title-col">
              <h1 className="goals-sprint-title" style={{ margin: 0, display: 'inline-flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="title-main-text" style={{ whiteSpace: 'nowrap' }}>
                  Sprint <em>#{String(sprintNum).padStart(2, '0')}</em>
                </span>
                <HeaderInfoTooltip
                  description="All current sprint goals present here. Compounding progress is built 1% at a time."
                />
              </h1>
              <div className="goals-sprint-dates" style={{ marginTop: '4px' }}>({dateStr})</div>
            </div>
            <SpecularButton
              size="md"
              radius={9999}
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
              onClick={onAdd}
            >
              Create Sprint Goal
            </SpecularButton>
          </div>
        </header>
        
        <section className="all-goals card">
          <div className="goal-list">
            {(goals && goals.length > 0) ? (
              (() => {
                const activeGoals = goals.filter(g => !(g.done || g.completed))
                const completedGoals = goals.filter(g => (g.done || g.completed))
                const renderRow = goal => (
                  <GoalRow
                    goal={goal}
                    onProgress={onProgress}
                    onComplete={onComplete}
                    onDelete={onDelete}
                    onShowDetails={onShowGoalDetails}
                    key={goal.id}
                  />
                )
                return (
                  <>
                    {activeGoals.map(renderRow)}
                    {completedGoals.length > 0 && (
                      <>
                        <div className="goal-section-separator" aria-hidden="true">
                          <span>Completed</span>
                        </div>
                        {completedGoals.map(renderRow)}
                      </>
                    )}
                  </>
                )
              })()
            ) : (
              <div className="rote-empty-state goals-empty-state">
                <p>No sprint goals configured yet for this sprint.</p>
                <button
                  type="button"
                  className="add-button"
                  style={{ marginTop: '10px', display: 'inline-block' }}
                  onClick={onAdd}
                >
                  + Create Sprint Goal
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    )
  }

  if (active === 'Rote') {
    return <RotePage user={user} onRotesChanged={onRotesChanged} onShowToast={showToast} isLoading={isGoalsLoading} />
  }

  if (active === 'Notes') {
    return (
      <NotesSection
        goals={goals}
        rotes={roteStats?.rotes || []}
        showToast={showToast}
        onShowGoalDetails={onShowGoalDetails}
        onNavigateRote={() => { if (setActive) setActive('Rote') }}
      />
    )
  }

  if (active === 'Timeline') {
    return (
      <div className="workspace-page timeline-page-custom">
        <header className="timeline-page-header">
          <div className="goals-badge-row">
            <span className="goals-sprint-badge">THE YEAR IN 100 PARTS</span>
          </div>
          <div className="goals-title-action-row">
            <div className="goals-title-col">
              <h1 className="timeline-title" style={{ margin: 0, display: 'inline-flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="title-main-text" style={{ whiteSpace: 'nowrap' }}>
                  Sprint <em>Timeline</em>
                </span>
                <HeaderInfoTooltip
                  description="Track your compounding progress across all 100 sprints. Click a sprint tile to inspect detailed history."
                />
              </h1>
              <div className="timeline-year-dates" style={{ marginTop: '4px' }}>({selectedYear})</div>
            </div>
            <SpecularButton
              size="md"
              radius={9999}
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
              onClick={handleScrollToCurrentSprint}
            >
              Current Sprint
            </SpecularButton>
          </div>
        </header>

        <section className="timeline">
          {(history?.sprints || []).map(summary => {
            const number = summary.sprint_number
            const state = getSprintTileState(number, selectedYear, data.year, data.sprint)
            const tileDateStr = formatSprintDateRange(summary.sprint_start, summary.sprint_end)
            return (
              <button
                className={`sprint-tile ${state}`}
                key={number}
                ref={state === 'current' && selectedYear === data.year ? currentSprintRef : null}
                id={state === 'current' && selectedYear === data.year ? 'current-sprint-tile' : undefined}
                onClick={() => onOpenSprint(number)}
              >
                <span>SPRINT</span>
                <b>
                  #{String(number).padStart(2, '0')}
                  <span className="sprint-tile-dates">({tileDateStr})</span>
                </b>
                <small>{summary.completed_count} done</small>
                <strong>{summary.average_progress}% avg</strong>
                {state === 'current' && selectedYear === data.year && <i>NOW</i>}
              </button>
            )
          })}

          {selectedYear === data.year && (() => {
            const upcomingTiles = []
            for (let N = data.sprint + 1; N <= 100; N++) {
              const upcomingStart = getSprintBoundary(selectedYear, N - 1)
              const upcomingEnd = getSprintBoundary(selectedYear, N)
              const upcomingDateStr = formatSprintDateRange(upcomingStart, upcomingEnd)
              
              upcomingTiles.push(
                <div key={`upcoming-${N}`} className="sprint-tile upcoming" style={{ background: '#161815', border: '1px dashed #343630', borderRadius: '6px', cursor: 'default', opacity: 0.55, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                  <div>
                    <span style={{ color: '#7f8279', fontFamily: '"DM Mono", monospace', fontSize: '8px', letterSpacing: '.12em', textTransform: 'uppercase', display: 'block' }}>SPRINT</span>
                    <b style={{ display: 'block', marginTop: '9px', color: '#676a62', fontFamily: '"Instrument Serif", serif', fontSize: '30px', fontWeight: '400' }}>
                      #{String(N).padStart(2, '0')}
                      <span className="sprint-tile-dates">
                        ({upcomingDateStr})
                      </span>
                    </b>
                  </div>
                  <div>
                    <small style={{ display: 'block', marginTop: '18px', color: '#989c92', fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                      UPCOMING
                    </small>
                    <strong style={{ display: 'block', marginTop: '6px', color: '#676a62', fontFamily: '"DM Mono", monospace', fontSize: '12px', fontWeight: '500' }}>
                      Not started yet
                    </strong>
                  </div>
                </div>
              )
            }
            return upcomingTiles
          })()}
        </section>

        <div className="timeline-years">
          {(availableYears || []).map(year => (
            <button key={year} className={year === selectedYear ? 'timeline-year active' : 'timeline-year'} onClick={() => onSelectYear(year)}>
              {year}
            </button>
          ))}
        </div>

        {historyModal && <SprintHistoryModal sprint={historyModal} onClose={onCloseSprint} onShowGoalDetails={onShowGoalDetails} />}
      </div>
    )
  }

  if (active === 'Profile') {
    const joined = profile?.user?.active_since || { year: data.year, sprint_number: data.sprint }
    const yearProgress = profile?.year || data
    const profileUser = profile?.user || user || {}
    const stats = profile?.stats || {
      current_streak: 0,
      longest_streak: 0,
    }

    // Direct instant calculation matching Overview containers
    const goalsCompleted = (goals || []).filter(g => g.done).length
    const totalGoals = (goals || []).length
    // FR-02: aggregate is the average of ACTIVE goals' own percentages — never completed/total.
    const activeGoalsList = (goals || []).filter(g => !(g.done || g.completed))
    const goalRate = activeGoalsList.length > 0
      ? Math.round(activeGoalsList.reduce((sum, g) => sum + (Number(g.value ?? g.progress_percent ?? 0) || 0), 0) / activeGoalsList.length)
      : 0

    const rotesCompleted = roteStats?.completed || 0
    const totalRotes = roteStats?.total || 0
    const roteRate = roteStats?.percentage ?? (totalRotes > 0 ? Math.round((rotesCompleted / totalRotes) * 100) : 0)

    return (
      <div className="workspace-page profile-page-custom">
        <header className="profile-page-header">
          <div className="profile-header-left" style={{ width: '100%' }}>
            <div className="goals-badge-row">
              <span className="goals-sprint-badge">ACCOUNT OVERVIEW</span>
            </div>
            <div className="profile-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
              <h1 className="profile-title" style={{ margin: 0, display: 'inline-flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="title-main-text" style={{ whiteSpace: 'nowrap' }}>
                  User <em>Profile</em>
                </span>
                <HeaderInfoTooltip
                  description="Manage your personal settings, view cumulative statistics, and inspect sprint achievements."
                />
              </h1>
              
              <div 
                ref={settingsMenuRef} 
                className="profile-settings-menu-container" 
                style={{ position: 'relative' }}
              >
                <button
                  type="button"
                  className="profile-settings-btn circular-settings-btn"
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  title="Account Settings & Logout"
                  aria-label="Settings"
                >
                  <Gear size={17} weight="bold" />
                </button>

                {showSettingsMenu && (
                  <div className="profile-settings-dropdown">
                    <button
                      type="button"
                      className="profile-dropdown-item logout"
                      onClick={() => {
                        setShowSettingsMenu(false)
                        if (onLogout) onLogout()
                      }}
                    >
                      <SignOut size={16} weight="bold" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="profile-hero-grid">
          <section className="profile-hero card compact-hero">
            {/* Main User Identity & Actions */}
            <div className="profile-hero-top-row">
              <div className="profile-user-left">
                <div
                  className="profile-avatar compact-avatar"
                  onClick={() => document.getElementById('avatar-file-input').click()}
                  title="Click to upload profile photo"
                >
                  {profileUser.profile_photo ? (
                    <img
                      src={profileUser.profile_photo}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      alt="Profile"
                    />
                  ) : (
                    (profileUser.display_name || profileUser.username || 'U').slice(0, 1).toUpperCase()
                  )}
                  
                  <div className="avatar-upload-overlay">
                    UPLOAD
                  </div>
                  
                  <input
                    type="file"
                    id="avatar-file-input"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 1500000) {
                        showToast('Image is too large — please use an image under 1.5 MB')
                        return
                      }
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        const img = new Image()
                        img.src = reader.result
                        img.onload = () => {
                          setCropImageDims({ width: img.width, height: img.height })
                          setCropImageSrc(reader.result)
                          setCropZoom(1)
                          setCropOffset({ x: 0, y: 0 })
                        }
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                </div>

                <div className="profile-meta-compact">
                  <div className="profile-name-row">
                    <h3 className="profile-display-name">
                      {profileUser.display_name || profileUser.name || 'Sai'}
                    </h3>
                    <span className="profile-handle">{profileUser.username ? `@${profileUser.username}` : ''}</span>
                  </div>
                  <p className="profile-active-meta">
                    Active since sprint {String(joined.sprint_number).padStart(2, '0')} · {joined.year}
                  </p>
                </div>
              </div>

              {/* Year progress percentage badge (Right side - same level) */}
              <div className="profile-col-progress compact-progress">
                <span>{yearProgress.percentage.toFixed(2)}%</span>
                <small>of '{String(yearProgress.year).slice(-2)}</small>
              </div>
            </div>

            {/* Dynamic Bio details below identity row */}
            {profileUser.bio && (
              <div className="profile-bio-dynamic">
                <span className="bio-label">BIO</span>
                <p className="bio-content-text">{profileUser.bio}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="profile-action-btns">
              <button className="profile-edit-btn" onClick={() => setEditModalOpen(true)}>
                <PencilSimple size={14} weight="bold" />
                <span>Edit Profile</span>
              </button>
              <button
                className="profile-edit-btn share-btn"
                title="Share Profile"
                aria-label="Share Profile"
                onClick={() => {
                  if (!profileUser.username) {
                    showToast('Set your username first')
                    setEditModalOpen(true)
                    return
                  }
                  const baseShareUrl = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost'))
                    ? window.location.origin
                    : 'https://onepercentgoal.vercel.app'
                  const shareUrl = `${baseShareUrl}/u/${profileUser.username}`
                  try {
                    const result = navigator.clipboard.writeText(shareUrl)
                    if (result && typeof result.then === 'function') {
                      result.then(() => {
                        showToast('Profile link copied')
                      }).catch(() => {
                        showToast(shareUrl, true)
                      })
                    } else {
                      showToast('Profile link copied')
                    }
                  } catch {
                    showToast(shareUrl, true)
                  }
                }}
              >
                <ShareNetwork size={14} weight="bold" />
                <span>Share Profile</span>
              </button>
            </div>
          </section>

          {/* Right side OnePercentGoal branding card */}
          <section className="profile-brand-card card">
            <div className="profile-brand-header-row">
              <div className="profile-brand-logo-wrap">
                <img src="/favicon.ico" alt="OnePercentGoal" className="profile-brand-logo-img" />
              </div>
              <span className="profile-brand-title">OnePercentGoal</span>
            </div>
            <div className="profile-brand-subtitle">100 SPRINTS · 3.6 DAYS EACH · 37.78X ANNUAL YIELD</div>
            <p className="profile-brand-tagline">Make every 1% count.</p>
          </section>
        </div>

        <section className="profile-combined-stats-card card">
          <div className="stats-dashboard-header">
            <h3 className="stats-dashboard-title">
              Your <em>Progress</em>
            </h3>
          </div>

          <div className="combined-stats-grid">
            {/* Tile 1: GOALS COMPLETED */}
            <div className="combined-stat-item">
              <span className="combined-stat-label">GOALS COMPLETED</span>
              <b className="combined-stat-value">{goalsCompleted}</b>
              <span className="combined-stat-desc">
                {totalGoals > 0 ? `of ${totalGoals} goals` : 'No active goals'}
              </span>
            </div>

            {/* Tile 2: AVG ACTIVE PROGRESS (Restrained Accent) */}
            <div className="combined-stat-item is-accent">
              <span className="combined-stat-label">AVG ACTIVE PROGRESS</span>
              <b className="combined-stat-value accent-value">{goalRate}%</b>
              <div className="stat-progress-indicator">
                <div
                  className="stat-progress-bar accent-fill"
                  style={{ width: `${Math.min(100, Math.max(0, goalRate))}%` }}
                />
              </div>
              <span className="combined-stat-desc">Average of active goals</span>
            </div>

            {/* Tile 3: ROTE COMPLETION */}
            <div className="combined-stat-item">
              <span className="combined-stat-label">ROTE COMPLETION</span>
              <b className="combined-stat-value">{roteRate}%</b>
              <div className="stat-progress-indicator">
                <div
                  className="stat-progress-bar neutral-fill"
                  style={{ width: `${Math.min(100, Math.max(0, roteRate))}%` }}
                />
              </div>
              <span className="combined-stat-desc">
                {rotesCompleted > 0
                  ? `${rotesCompleted} of ${totalRotes} rotes completed`
                  : 'No rotes completed yet'}
              </span>
            </div>

            {/* Tile 4: CURRENT STREAK (Relevant Streak Fire Icon) */}
            <div className="combined-stat-item">
              <div className="combined-stat-label-row">
                <span className="combined-stat-label">CURRENT STREAK</span>
                <Fire size={14} weight="fill" className="streak-relevant-icon" />
              </div>
              <div className="streak-value-row">
                <b className="combined-stat-value">{stats.current_streak || 0}</b>
                <span className="streak-unit-text">{stats.current_streak === 1 ? 'sprint' : 'sprints'}</span>
              </div>
              <span className="combined-stat-desc">
                Best: {stats.longest_streak || 0} {stats.longest_streak === 1 ? 'sprint' : 'sprints'}
              </span>
            </div>
          </div>
        </section>

        <section className="reminders-card card">
          <div className="reminders-card-header">
            <div>
              <p className="eyebrow" style={{ color: '#c9f36a', margin: '0 0 6px' }}>DAILY REMINDERS</p>
              <h3>Stay on track</h3>
            </div>
            {isNativeApp() && (
              <label className="reminders-toggle" title={remindersEnabled ? 'Pause reminders' : 'Enable reminders'}>
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={event => handleRemindersToggle(event.target.checked)}
                  disabled={remindersBusy}
                />
                <span className="reminders-toggle-track" />
              </label>
            )}
          </div>

          <p className="reminders-desc">
            Get a daily nudge to focus on your sprint goals and complete your rotes before the day ends.
          </p>

          {isNativeApp() ? (
            <>
              <div className="reminders-time-row">
                <span>Reminder time</span>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={event => handleReminderTimeChange(event.target.value)}
                  disabled={remindersBusy}
                />
              </div>
              <div
                className="reminders-status-msg"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: remindersEnabled ? 'rgba(201, 243, 106, 0.08)' : '#191b18',
                  border: `1px solid ${remindersEnabled ? 'rgba(201, 243, 106, 0.28)' : '#32352f'}`,
                  color: remindersEnabled ? '#c9f36a' : '#8c9085',
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '13px',
                  fontWeight: 500,
                  boxSizing: 'border-box'
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: remindersEnabled ? '#c9f36a' : '#555850',
                    boxShadow: remindersEnabled ? '0 0 8px rgba(201, 243, 106, 0.6)' : 'none',
                    flex: 'none'
                  }}
                />
                <span>
                  {remindersBusy
                    ? 'Updating…'
                    : remindersEnabled
                      ? (() => {
                          const [h, m] = String(reminderTime || '').split(':').map(Number)
                          if (Number.isNaN(h) || Number.isNaN(m)) return `Daily reminders at ${formatDisplayReminderTime(reminderTime)}`
                          const { targetGoal } = getTargetDates(h, m)
                          const now = new Date()
                          const isToday = targetGoal.getDate() === now.getDate() && targetGoal.getMonth() === now.getMonth()
                          return `Daily reminders at ${formatDisplayReminderTime(reminderTime)} (${isToday ? 'fires today' : 'starts tomorrow'})`
                        })()
                      : 'Scheduled reminders is off'}
                </span>
              </div>
              <p className="reminders-note">
                {remindersEnabled
                  ? `Fires daily at ${formatDisplayReminderTime(reminderTime)} (device time). Two notifications: sprint goals + rote completion.`
                  : 'Use the toggle switch above to turn on daily reminders.'}
              </p>
            </>
          ) : (
            <p className="reminders-note">Available in the OnePercentGoal app, check the releases in github repository</p>
          )}
        </section>

        <AppFooter year={yearProgress.year} />

        {historyModal && <SprintHistoryModal sprint={historyModal} onClose={onCloseSprint} onShowGoalDetails={onShowGoalDetails} />}
        
        <EditProfileModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          user={profileUser}
          onSubmit={async (username, displayName, bio) => {
            setEditLoading(true)
            setEditError('')
            try {
              await onUpdateProfile(username, displayName, null, bio)
              setEditModalOpen(false)
            } catch (err) {
              setEditError(err.message || 'Failed to save changes')
            } finally {
              setEditLoading(false)
            }
          }}
          loading={editLoading}
          error={editError}
        />
      
        {cropImageSrc && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}>
            <div style={{
              background: '#1d1f1c',
              border: '1px solid #343630',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '340px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: '0 0 16px', color: '#eef0e9', fontSize: '18px', fontWeight: 500 }}>Crop Profile Photo</h3>
              
              {/* Viewport Mask */}
              {(() => {
                const baseScale = Math.max(200 / cropImageDims.width, 200 / cropImageDims.height)
                const imgWidth = cropImageDims.width * baseScale
                const imgHeight = cropImageDims.height * baseScale
                
                return (
                  <div style={{
                    width: '200px',
                    height: '200px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#141613',
                    border: '2px solid #c9f36a',
                    boxShadow: '0 0 20px rgba(201, 243, 106, 0.25)',
                    touchAction: 'none'
                  }}
                    onMouseDown={(e) => {
                      setIsDragging(true)
                      dragStart.current = { x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y }
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging) return
                      setCropOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                    
                    onTouchStart={(e) => {
                      setIsDragging(true)
                      const touch = e.touches[0]
                      dragStart.current = { x: touch.clientX - cropOffset.x, y: touch.clientY - cropOffset.y }
                    }}
                    onTouchMove={(e) => {
                      if (!isDragging) return
                      const touch = e.touches[0]
                      setCropOffset({ x: touch.clientX - dragStart.current.x, y: touch.clientY - dragStart.current.y })
                    }}
                    onTouchEnd={() => setIsDragging(false)}
                  >
                    <img
                      src={cropImageSrc}
                      draggable="false"
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: `${imgWidth}px`,
                        height: `${imgHeight}px`,
                        transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                        transformOrigin: 'center center',
                        cursor: 'move',
                        userSelect: 'none',
                        pointerEvents: 'none'
                      }}
                    />
                  </div>
                )
              })()}
              
              {/* Zoom Slider */}
              <div style={{ width: '100%', margin: '20px 0 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8c9085', fontFamily: '"DM Mono", monospace', marginBottom: '8px' }}>
                  <span>ZOOM</span>
                  <span>{Math.round(cropZoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.05"
                  value={cropZoom}
                  onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: '#c9f36a',
                    background: '#2b2e29',
                    height: '4px',
                    borderRadius: '2px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
              </div>
              
              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button
                  type="button"
                  className="add-button"
                  onClick={() => setCropImageSrc(null)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: '1px solid #343630',
                    color: '#8c9085',
                    borderRadius: '24px',
                    padding: '10px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                
                <button
                  type="button"
                  className="add-button"
                  onClick={() => {
                    const img = new Image()
                    img.src = cropImageSrc
                    img.onload = async () => {
                      const canvas = document.createElement('canvas')
                      canvas.width = 200
                      canvas.height = 200
                      const ctx = canvas.getContext('2d')
                      if (!ctx) return
                      
                      ctx.fillStyle = '#1d1f1c'
                      ctx.fillRect(0, 0, 200, 200)
                      
                      const baseScale = Math.max(200 / img.width, 200 / img.height)
                      const drawWidth = img.width * baseScale * cropZoom
                      const drawHeight = img.height * baseScale * cropZoom
                      const dx = 100 - drawWidth / 2 + cropOffset.x
                      const dy = 100 - drawHeight / 2 + cropOffset.y
                      
                      ctx.drawImage(img, dx, dy, drawWidth, drawHeight)
                      
                      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.85)
                      try {
                        await onUpdateProfile(
                          profileUser.username || `user_${profileUser.id}`,
                          profileUser.display_name || profileUser.name || 'User',
                          croppedBase64
                        )
                        setCropImageSrc(null)
                      } catch (err) {
                        console.error('Failed to save profile photo:', err)
                        showToast('Could not save profile photo')
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    background: '#c9f36a',
                    color: '#1d1f1c',
                    border: 'none',
                    borderRadius: '24px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}

export default WorkspacePage
