import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { isNativeApp } from './reminders'

import { Browser } from '@capacitor/browser'
import { App as CapacitorApp } from '@capacitor/app'
import { Keyboard as CapacitorKeyboard } from '@capacitor/keyboard'
import { apiFetch, getStoredToken, setStoredToken, removeStoredToken } from './services/apiClient'
import {
  getCurrentUser,
  verifyGoogleCredential,
  requestGoogleAccessToken,
  exchangeAuthorizationCode,
  createAuthorizationExchangeCode,
  updateAuthProfile,
  logout as authLogout,
} from './features/auth/authService'
import {
  GOOGLE_CLIENT_ID,
  WEB_APP_URL,
  isNativeShell,
  loadGoogleIdentityServices,
  parseAuthUrl,
  getNativeAuthReturn,
  cleanAuthUrlParams,
  buildNativeOAuthUrl,
  buildNativeReturnUrl,
} from './features/auth/authUtils'
import {
  fetchDashboard,
  createGoal as createGoalApi,
  updateGoal as updateGoalApi,
  completeGoal as completeGoalApi,
  deleteGoal as deleteGoalApi,
} from './features/goals/goalService'
import {
  presentGoal,
  createOptimisticGoal,
  mergeGoals,
  getFallbackGoals,
  createCompletionCard,
  saveImageToGallery,
  sanitizeFilename,
} from './features/goals/goalUtils'
import {
  fetchRotes as fetchRotesApi,
  toggleRote as toggleRoteApi,
} from './features/rotes/roteService'
import {
  getStoredRotes,
  persistRotes,
  computeRoteStats,
  mergeRotes,
} from './features/rotes/roteUtils'
import {
  fetchTimeline as fetchTimelineApi,
  fetchSprintHistory as fetchSprintHistoryApi,
} from './features/timeline/timelineService'
import {
  createEmptyTimeline,
  updateSprintInTimeline,
} from './features/timeline/timelineUtils'
import {
  DAY,
  getISTDate,
  getTodayYMD,
  getYearData,
  getSprintBoundary,
  formatDateWithTime,
} from './utils/dateUtils'

import { useEscapeKey } from './hooks/useEscapeKey'
import KineticTextLoader from './components/KineticTextLoader'
import SpotlightNavbar from './components/SpotlightNavbar'
import LandingPage from './components/LandingPage'
import OverviewPage from './components/OverviewPage'
import WorkspacePage from './components/WorkspacePage'
import PublicProfilePage from './components/PublicProfilePage'
import AuthScreen from './features/auth/components/AuthModal'
import AuthTransitionOverlay from './features/auth/components/AuthTransitionOverlay'
import AppReturnModal from './features/auth/components/AppReturnModal'
import ProfileSetupModal from './components/ProfileSetupModal'
import AddGoalModal from './features/goals/components/AddGoalModal'
import CompletionFlowModal from './features/goals/components/CompletionFlowModal'
import CompletedShareModal from './features/goals/components/CompletedShareModal'
import GoalDetailsModal from './features/goals/components/GoalDetailsModal'
import DeleteGoalConfirmModal from './features/goals/components/DeleteGoalConfirmModal'
import ErrorBoundary from './components/ErrorBoundary'
import { MOTIVATIONAL_QUOTES } from './constants/quotes'

if ('serviceWorker' in navigator) {
  const isCapacitorNative = () => Boolean(
    window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  )
  if (isCapacitorNative()) {
    // In the native WebView the bundled assets are local and fast, so a service
    // worker adds nothing but staleness risk across APK updates. Purge any
    // worker + caches a previous install left behind so a stale shell can never
    // block the app from booting.
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .catch(() => {})
      if (window.caches) {
        window.caches.keys().then(keys => Promise.all(keys.map(k => window.caches.delete(k)))).catch(() => {})
      }
    })
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

function App() {
  const [now, setNow] = useState(getISTDate())
  const [active, setActive] = useState('Overview')
  const [quoteIndices, setQuoteIndices] = useState([0, 1])
  const [headerHidden, setHeaderHidden] = useState(false)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let scrollTimeout = null

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY < lastScrollY) {
        setHeaderHidden(false)
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setHeaderHidden(true)
      }

      if (scrollTimeout) clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        setHeaderHidden(false)
      }, 250)

      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [])

  useEffect(() => {
    if (active === 'Overview') {
      const len = MOTIVATIONAL_QUOTES.length
      if (len > 1) {
        const i1 = Math.floor(Math.random() * len)
        let i2 = Math.floor(Math.random() * len)
        while (i2 === i1) {
          i2 = Math.floor(Math.random() * len)
        }
        setQuoteIndices([i1, i2])
      }
    }
  }, [active])

  const [goals, setGoals] = useState(() => {
    try {
      const stored = localStorage.getItem('opg.dashboard.goals')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed.map(presentGoal)
      }
    } catch {}
    return []
  })

  const [roteOverviewStats, setRoteOverviewStats] = useState(() => {
    const todayStr = getTodayYMD()
    const data = getStoredRotes(todayStr)
    if (data && Array.isArray(data.rotes)) {
      const { total, completed, percentage } = computeRoteStats(data.rotes)
      return { total, completed, percentage, rotes: data.rotes }
    }
    return { total: 0, completed: 0, percentage: 0, rotes: [] }
  })

  const handleRotesChanged = useCallback((updatedData) => {
    const todayStr = getTodayYMD()
    let dataToUse = updatedData
    if (!dataToUse || !Array.isArray(dataToUse.rotes)) {
      dataToUse = getStoredRotes(todayStr)
    }

    if (dataToUse && Array.isArray(dataToUse.rotes)) {
      const { total, completed, percentage } = computeRoteStats(dataToUse.rotes)
      const nextStats = { total, completed, percentage, rotes: dataToUse.rotes }

      setRoteOverviewStats(nextStats)
      persistRotes(todayStr, dataToUse)
    }
  }, [])

  const toggleRoteFromOverview = async (roteId) => {
    const todayStr = getTodayYMD()
    const targetIdStr = String(roteId)
    const currentRotes = roteOverviewStats.rotes || []
    const currentItem = currentRotes.find(r => String(r.id) === targetIdStr)
    const targetStatus = currentItem ? !currentItem.completed : true

    // 1. Instant optimistic update for the entire website
    const updated = currentRotes.map(r => String(r.id) === targetIdStr ? { ...r, completed: targetStatus } : r)
    const doneCount = updated.filter(r => r.completed).length
    const nextData = {
      date: todayStr,
      rotes: updated,
      stats: { total_rotes: updated.length, completed_rotes: doneCount }
    }
    handleRotesChanged(nextData)

    if (targetIdStr.startsWith('temp-')) return

    // 2. Sync to server in background
    try {
      const result = await toggleRoteApi(roteId, { date: todayStr, completed: targetStatus })
      const confirmedStatus = Boolean(result.completed)
      if (confirmedStatus !== targetStatus) {
        const reUpdated = currentRotes.map(r => String(r.id) === targetIdStr ? { ...r, completed: confirmedStatus } : r)
        const reDoneCount = reUpdated.filter(r => r.completed).length
        handleRotesChanged({
          date: todayStr,
          rotes: reUpdated,
          stats: { total_rotes: reUpdated.length, completed_rotes: reDoneCount }
        })
      }
    } catch (err) {
      console.error('Failed to toggle rote from overview:', err)
      // Revert optimistic update on failure
      const reverted = currentRotes.map(r => String(r.id) === targetIdStr ? { ...r, completed: !targetStatus } : r)
      const revertedDone = reverted.filter(r => r.completed).length
      handleRotesChanged({
        date: todayStr,
        rotes: reverted,
        stats: { total_rotes: reverted.length, completed_rotes: revertedDone }
      })
    }
  }

  const [addGoalModalOpen, setAddGoalModalOpen] = useState(false)
  const [timelineHistory, setTimelineHistory] = useState(() => createEmptyTimeline())
  const [selectedTimelineYear, setSelectedTimelineYear] = useState(new Date().getFullYear())
  const [profile, setProfile] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [completionFlow, setCompletionFlow] = useState(null)
  const [selectedGoalDetails, setSelectedGoalDetails] = useState(null)
  const [serverSprint, setServerSprint] = useState(null)

  const shareMatch = window.location.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)/)
  const shareUsername = shareMatch ? shareMatch[1] : null
  const [publicData, setPublicData] = useState(null)
  const [publicLoading, setPublicLoading] = useState(false)
  const [publicError, setPublicError] = useState('')
  const [publicYear, setPublicYear] = useState(new Date().getFullYear())

  useEffect(() => {
    if (shareUsername) {
      const fetchPublic = async () => {
        setPublicLoading(true)
        setPublicError('')
        try {
          const response = await apiFetch(`/api/u/${shareUsername}?year=${publicYear}`)
          if (!response.ok) {
            const err = await response.json()
            throw new Error(err.detail || 'User profile not found')
          }
          const result = await response.json()
          setPublicData(result)
        } catch (err) {
          setPublicError(err.message || 'Failed to load public profile')
        } finally {
          setPublicLoading(false)
        }
      }
      fetchPublic()
    }
  }, [shareUsername, publicYear])

  const showGoalDetails = goal => {
    setSelectedGoalDetails({
      title: goal.title,
      completion_note: goal.completion_note || goal.completed_note || ''
    })
  }

  const [sessionToken, setSessionToken] = useState(() => getStoredToken())
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const googleSignInInFlight = useRef(false)
  const gisInitializedRef = useRef(false)
  const [nativeAuthReturn, setNativeAuthReturn] = useState(() => getNativeAuthReturn())
  const [appReturnFlow, setAppReturnFlow] = useState(null)

  useEffect(() => {
    if (window.hideBootLoader) {
      window.hideBootLoader()
    } else {
      const el = document.getElementById('boot-loader')
      if (el && el.parentNode) el.parentNode.removeChild(el)
    }
  }, [authReady])

  const [authLoading, setAuthLoading] = useState(false)
  const [authStatus, setAuthStatus] = useState('Signing you in…')
  const [authError, setAuthError] = useState('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastNoTick, setToastNoTick] = useState(false)
  const toastTimeoutRef = useRef(null)
  const showToast = (msg, noTick = false) => {
    setToastMsg(msg)
    setToastNoTick(Boolean(noTick))
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToastMsg(''), 2500)
  }
  useEscapeKey(() => { if (!authLoading) setShowAuthModal(false) }, !showAuthModal)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const exitPendingRef = useRef(false)

  useEffect(() => {
    if (isNativeApp()) {
      const handles = []
      const Keyboard = CapacitorKeyboard
      const onShow = () => setKeyboardOpen(true)
      const onHide = () => setKeyboardOpen(false)
      const attach = handle => { if (handle) handles.push(handle) }
      try {
        const r1 = Keyboard.addListener('keyboardWillShow', onShow)
        const r2 = Keyboard.addListener('keyboardWillHide', onHide)
        if (r1 && typeof r1.then === 'function') { r1.then(attach).catch(() => {}) } else { attach(r1) }
        if (r2 && typeof r2.then === 'function') { r2.then(attach).catch(() => {}) } else { attach(r2) }
      } catch {}
      return () => { handles.forEach(h => { if (h && h.remove) h.remove() }) }
    }

    const vv = window.visualViewport
    if (!vv) return
    let baseline = window.innerHeight || vv.height
    const check = () => {
      const cur = window.innerHeight || vv.height
      setKeyboardOpen(cur < baseline - 120)
    }
    const onOrientation = () => {
      setTimeout(() => {
        baseline = window.innerHeight || vv.height
        check()
      }, 300)
    }
    vv.addEventListener('resize', check)
    vv.addEventListener('scroll', check)
    window.addEventListener('orientationchange', onOrientation)
    check()
    return () => {
      vv.removeEventListener('resize', check)
      vv.removeEventListener('scroll', check)
      window.removeEventListener('orientationchange', onOrientation)
    }
  }, [])

  useEffect(() => {
    if (nativeAuthReturn && !sessionToken && !currentUser) setShowAuthModal(true)
  }, [nativeAuthReturn, sessionToken, currentUser])

  const [deleteConfirmFlow, setDeleteConfirmFlow] = useState(null)
  const [completedShare, setCompletedShare] = useState(null)
  const savedShareRef = useRef(new Set())
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    if (!completedShare || !completedShare.image) return
    if (!isNativeApp()) return
    const key = `${completedShare.goal.id}:${completedShare.note}`
    if (savedShareRef.current.has(key)) return
    savedShareRef.current.add(key)
    saveImageToGallery(completedShare.image, `onepercentgoal-${sanitizeFilename(completedShare.goal.title)}.png`)
      .then(saved => showToast(saved ? 'Saved to your Photos' : 'Image could not be saved'))
      .catch(() => showToast('Image could not be saved'))
  }, [completedShare])

  useEffect(() => {
    const id = setInterval(() => setNow(getISTDate()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const { token: tokenFromUrl, accessToken: accessTokenFromUrl } = parseAuthUrl(window.location.href)

    if (tokenFromUrl) {
      setStoredToken(tokenFromUrl)
      cleanAuthUrlParams()
    } else if (accessTokenFromUrl) {
      cleanAuthUrlParams()
      finishGoogleSignIn({ access_token: accessTokenFromUrl })
      return
    }
    const token = tokenFromUrl || getStoredToken()
    if (token) {
      setSessionToken(token)
    }
    getCurrentUser(token)
      .then(user => {
        if (user) {
          setCurrentUser(user)
        }
        setAuthReady(true)
      })
      .catch(() => {
        if (token) {
          removeStoredToken()
          setSessionToken('')
        }
        setCurrentUser(null)
        setAuthReady(true)
      })
  }, [])

  useEffect(() => {
    const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile|wv/i.test(navigator.userAgent)
    if (isNativeShell() || !isMobileBrowser || !currentUser) return
    const handler = event => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [currentUser])

  useEffect(() => {
    if (!isNativeShell()) return
    let activeHandle = null
    const restoreSession = async url => {
      let { token, code } = parseAuthUrl(url)

      if (code) {
        setAuthLoading(true)
        setAuthStatus('Verifying secure handover…')
        try {
          const data = await exchangeAuthorizationCode(code)
          if (data?.token) {
            token = data.token
          }
        } catch {}
      }

      if (token) {
        setAuthLoading(true)
        setAuthStatus('Finishing sign-in…')
        setStoredToken(token)
        setSessionToken(token)
        setActive('Overview')
        setShowAuthModal(false)
        Browser.close().catch(() => {})
        getCurrentUser(token)
          .then(user => {
            setCurrentUser(user)
            setActive('Overview')
            setShowAuthModal(false)
            showToast('Welcome to OnePercentGoal')
          })
          .catch(() => {
            removeStoredToken()
            setSessionToken('')
            setAuthError('Your sign-in session could not be restored. Please try again.')
            setShowAuthModal(true)
          })
          .finally(() => setAuthLoading(false))
      }
    }
    // If the user backs out of the external sign-in browser without
    // completing, clear the loading overlay — otherwise it stays forever.
    // Idempotent: only ever clears the flag, never sets it.
    let browserHandle = null
    const browserResult = Browser.addListener('browserFinished', () => {
      setAuthLoading(false)
    })
    if (browserResult && typeof browserResult.then === 'function') {
      browserResult.then(handle => { browserHandle = handle }).catch(() => {})
    } else {
      browserHandle = browserResult
    }
    const result = CapacitorApp.addListener('appUrlOpen', event => restoreSession(event.url || ''))
    CapacitorApp.getLaunchUrl().then(result => restoreSession(result?.url || '')).catch(() => {})
    if (result && typeof result.then === 'function') {
      result.then(handle => { activeHandle = handle }).catch(() => {})
    } else {
      activeHandle = result
    }
    return () => { if (activeHandle) activeHandle.remove(); if (browserHandle) browserHandle.remove() }
  }, [])

  useEffect(() => {
    if (!isNativeShell()) return
    const app = window.Capacitor.Plugins.App
    let activeHandle = null
    const result = app.addListener('backButton', () => {
      if (showAuthModal) { setShowAuthModal(false); return }
      if (addGoalModalOpen) { setAddGoalModalOpen(false); return }
      if (editModalOpen) { setEditModalOpen(false); return }
      if (completionFlow) { setCompletionFlow(null); return }
      if (completedShare) { setCompletedShare(null); return }
      if (deleteConfirmFlow) { setDeleteConfirmFlow(null); return }
      if (selectedGoalDetails) { setSelectedGoalDetails(null); return }
      if (historyModal) { setHistoryModal(null); return }
      if (active !== 'Overview') {
        setActive('Overview')
        setHeaderHidden(false)
        window.scrollTo({ top: 0, behavior: 'instant' })
        return
      }
      if (exitPendingRef.current) {
        exitPendingRef.current = false
        app.exitApp()
        return
      }
      exitPendingRef.current = true
      showToast('Press back again to exit', true)
      setTimeout(() => { exitPendingRef.current = false }, 2500)
    })
    if (result && typeof result.then === 'function') {
      result.then(handle => { activeHandle = handle }).catch(() => {})
    } else {
      activeHandle = result
    }
    return () => { if (activeHandle) activeHandle.remove() }
  }, [showAuthModal, addGoalModalOpen, editModalOpen, completionFlow, completedShare, deleteConfirmFlow, selectedGoalDetails, historyModal, active])

  useEffect(() => {
    apiFetch('/api/sprint/current')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setServerSprint(s) })
      .catch(() => {})
  }, [])

  const fallbackData = useMemo(() => getYearData(now), [now])
  const data = useMemo(() => {
    if (!serverSprint) return fallbackData
    const checkpointEnd = new Date(serverSprint.sprint_end)
    const sprintStart = new Date(serverSprint.sprint_start)
    const startTs = Date.UTC(serverSprint.year, 0, 1, 0, 0, 0) - (5.5 * 3600 * 1000)
    const elapsed = Math.max(0, now.getTime() - startTs)
    // Live fraction (full precision) so the 6-decimal readout visibly ticks
    // with the clock; the backend snapshot is rounded to 2 decimals and static.
    const livePercentage = Math.min(100, Math.max(0, (elapsed / (serverSprint.days_in_year * DAY)) * 100))
    return {
      year: serverSprint.year,
      total: serverSprint.days_in_year,
      elapsed,
      percentage: livePercentage,
      sprint: serverSprint.sprint_number,
      sprint_number: serverSprint.sprint_number,
      sprint_start: serverSprint.sprint_start,
      sprint_end: serverSprint.sprint_end,
      checkpointEnd,
      sprintStart,
    }
  }, [serverSprint, fallbackData, now])

  const deadlineStr = useMemo(() => {
    if (!data?.checkpointEnd) return ''
    return formatDateWithTime(data.checkpointEnd)
  }, [data])

  const day = Math.floor(data.elapsed / DAY) + 1
  const hr = now.getHours()
  const greeting = hr < 4 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night'
  const completeGoals = goals.filter(g => g.done).length

  const refreshProfile = async (token, year) => {
    const activeToken = token || sessionToken
    if (!activeToken) return
    const yr = year || selectedTimelineYear
    try {
      const [profileRes, timelineData] = await Promise.all([
        apiFetch(`/api/profile?year=${yr}`, { headers: { Authorization: `Bearer ${activeToken}` } }),
        fetchTimelineApi(yr, activeToken).catch(() => null)
      ])
      if (!profileRes.ok) throw new Error('Unable to load profile')
      const profileData = await profileRes.json()
      setProfile(profileData)
      if (timelineData) setTimelineHistory(timelineData)
    } catch (err) {
      console.error('Failed to refresh profile:', err)
    }
  }

  const loadDashboard = async token => {
    try {
      const dashData = await fetchDashboard(token)
      if (dashData.year) {
        setServerSprint(dashData.year)
      }
      const serverGoals = (dashData.goals || []).map(presentGoal)
      setGoals(prev => {
        const merged = mergeGoals(prev, serverGoals)
        try { localStorage.setItem('opg.dashboard.goals', JSON.stringify(merged)) } catch {}
        return merged
      })
    } catch {
      setGoals(prev => {
        if (prev && prev.length > 0) return prev
        return getFallbackGoals()
      })
    }
  }

  const loadRotes = async token => {
    const todayStr = getTodayYMD()
    const activeToken = token || sessionToken || localStorage.getItem('onepercentgoal.token') || localStorage.getItem('token')
    if (!activeToken) return
    try {
      const rotesData = await fetchRotesApi(todayStr, activeToken)
      if (rotesData && Array.isArray(rotesData.rotes)) {
        const stored = getStoredRotes(todayStr)
        const localRotes = stored?.rotes || []
        const merged = mergeRotes(rotesData.rotes, localRotes)
        handleRotesChanged({ ...rotesData, rotes: merged })
      }
    } catch {}
  }

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    loadDashboard(sessionToken)
    refreshProfile(sessionToken, selectedTimelineYear)
    loadRotes(sessionToken)
  }, [currentUser, sessionToken, data.year, selectedTimelineYear])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    setSelectedTimelineYear(data.year)
  }, [data.year, currentUser, sessionToken])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    fetchTimelineApi(selectedTimelineYear, sessionToken)
      .then(timeline => {
        setTimelineHistory(timeline)
        setHistoryModal(null)
      })
      .catch(() => setTimelineHistory(createEmptyTimeline(selectedTimelineYear)))
  }, [selectedTimelineYear, currentUser, sessionToken])

  const finishGoogleSignIn = async (payload) => {
    if (!payload || googleSignInInFlight.current) return
    googleSignInInFlight.current = true
    setAuthLoading(true)
    setAuthStatus('Signing you in…')
    setAuthError('')
    setShowAuthModal(false)
    try {
      await new Promise(resolve => requestAnimationFrame(resolve))
      const result = await verifyGoogleCredential(payload)

      // Always save session and log into the website Overview page first
      setStoredToken(result.token)
      setSessionToken(result.token)
      setCurrentUser(result.user)
      setActive('Overview')
      setShowAuthModal(false)
      showToast('Welcome to OnePercentGoal')
      setAuthError('')

      // If launched from native app with auth_return, provide seamless transition
      if (nativeAuthReturn) {
        const code = await createAuthorizationExchangeCode(result.token)
        const appReturnUrl = buildNativeReturnUrl(nativeAuthReturn, { code, token: result.token })

        setAppReturnFlow({
          appUrl: appReturnUrl,
        })
        cleanAuthUrlParams()

        // Attempt direct intent / scheme navigation to switch to the app
        try {
          const a = document.createElement('a')
          a.href = appReturnUrl
          document.body.appendChild(a)
          a.click()
          a.remove()
        } catch {}
      }
    } catch (err) {
      setAuthError(err.message || 'Google authentication failed')
      setShowAuthModal(true)
    } finally {
      setAuthLoading(false)
      googleSignInInFlight.current = false
    }
  }

  useEffect(() => {
    if (currentUser || sessionToken || isNativeShell() || gisInitializedRef.current) return
    gisInitializedRef.current = true
    loadGoogleIdentityServices()
      .then(() => {
        setGisReady(true)
      })
      .catch(error => {
        gisInitializedRef.current = false
        setAuthError(error.message || 'Google sign-in is unavailable')
      })
  }, [currentUser, sessionToken, authReady])

  const handleNativeGoogle = async () => {
    // Native sign-in runs through the production website's Google GIS flow
    // inside an in-app browser tab (@capacitor/browser + @capacitor/app are
    // both Capacitor 8 core plugins, so there is no peer conflict). The web
    // app verifies the Google credential with the existing backend endpoint
    // and hands a short-lived single-use exchange code back via the
    // com.onepercentgoal.app://auth deep link, which the appUrlOpen /
    // getLaunchUrl restore above exchanges for a session. No backend or
    // protocol changes are involved, and no native SDK plugin is required.
    setAuthLoading(true)
    setAuthStatus('Opening Google…')
    setAuthError('')
    try {
      const oauthUrl = buildNativeOAuthUrl()
      const isUsableWebUrl = oauthUrl && /^https:\/\//i.test(oauthUrl)
      if (!isUsableWebUrl) {
        throw new Error('Google sign-in is unavailable in this build. Please update the app and try again.')
      }
      await Browser.open({ url: oauthUrl })
      // Loading clears via `browserFinished` (user backs out) or via the
      // appUrlOpen deep-link restore on success.
    } catch (error) {
      setAuthLoading(false)
      googleSignInInFlight.current = false
      setAuthError(error?.message || 'Unable to open Google sign-in. Please try again.')
    }
  }

  const handleGoogle = () => {
    if (isNativeShell()) {
      handleNativeGoogle()
      return
    }
    if (!window.google?.accounts?.oauth2) {
      setAuthError('Google sign-in is still loading. Please try again.')
      return
    }
    setAuthLoading(true)
    setAuthStatus('Opening Google…')
    setAuthError('')
    try {
      requestGoogleAccessToken({
        clientId: GOOGLE_CLIENT_ID,
        onToken: access_token => finishGoogleSignIn({ access_token }),
        onError: err => {
          setAuthLoading(false)
          googleSignInInFlight.current = false
          setAuthError(err.message)
        },
        onCancel: () => {
          setAuthLoading(false)
          googleSignInInFlight.current = false
        },
      })
    } catch (error) {
      setAuthLoading(false)
      googleSignInInFlight.current = false
      setAuthError(error.message || 'Unable to open Google sign-in. Please try again.')
    }
  }

  const completeProfile = async form => {
    setProfileLoading(true)
    setProfileError('')
    try {
      const result = await updateAuthProfile(form, sessionToken)
      setCurrentUser(result.user)
      await refreshProfile()
    } catch (error) {
      setProfileError(error.message || 'Unable to save profile')
    } finally {
      setProfileLoading(false)
    }
  }

  const logout = async () => {
    const token = sessionToken
    authLogout(token).catch(() => {})
    // Native sign-in runs through the web GIS flow, so there is no native
    // SDK account cache to clear — revoking the server session above plus
    // removing the local token completes logout on every platform.
    showToast('Logged Out')
    setActive('Overview')
    setShowAuthModal(false)
    setSessionToken('')
    setCurrentUser(null)
    setGoals([])
    setProfile(null)
    setTimelineHistory(createEmptyTimeline())
    setHistoryModal(null)
    setCompletionFlow(null)
  }

  const updateGoal = async (goal, payload) => {
    if (String(goal.id).startsWith('temp-')) return true
    try {
      const updated = await updateGoalApi(goal.id, payload, sessionToken)
      const saved = presentGoal(updated)
      setGoals(items => items.map(item => item.id === goal.id ? saved : item))
      await refreshProfile()
      return true
    } catch { return false }
  }

  const updateProgress = async (goal, progress_percent) => {
    const previous = goal.value
    setGoals(items => items.map(item => item.id === goal.id ? presentGoal({ ...item, progress_percent }) : item))
    const saved = await updateGoal(goal, { progress_percent })
    if (!saved) {
      setGoals(items => items.map(item => item.id === goal.id ? presentGoal({ ...item, progress_percent: previous }) : item))
    }
  }

  const startCompletion = goal => setCompletionFlow({ goal, note: '', step: 'note' })

  const continueCompletion = () => {
    if (!completionFlow) return
    const note = completionFlow.note.trim()
    if (!note) return
    setCompletionFlow(flow => flow ? { ...flow, note, step: 'confirm' } : flow)
  }

  const completeGoal = async () => {
    if (!completionFlow) return
    const note = completionFlow.note.trim()
    const goal = completionFlow.goal
    const tempCompleted = { ...goal, done: true, value: 100 }
    setGoals(items => items.map(item => item.id === goal.id ? tempCompleted : item))
    setCompletionFlow(null)
    setCompletedShare({ goal: tempCompleted, note, image: null })
    showToast('Goal Completed')

    if (String(goal.id).startsWith('temp-')) return

    try {
      const updated = await completeGoalApi(goal.id, note, sessionToken)
      const saved = presentGoal(updated)
      setGoals(items => items.map(item => item.id === saved.id ? saved : item))
      refreshProfile()
      createCompletionCard(saved, note)
        .then(image => setCompletedShare(prev => prev && prev.goal.id === saved.id ? { ...prev, image } : prev))
        .catch(() => {})
    } catch {
      showToast('Could not complete goal')
    }
  }

  const deleteGoal = (goal) => {
    setDeleteConfirmFlow(goal)
  }

  const confirmDeleteGoal = async (goal) => {
    setGoals(items => items.filter(item => item.id !== goal.id))

    if (String(goal.id).startsWith('temp-')) return

    try {
      await deleteGoalApi(goal.id, sessionToken)
      await refreshProfile()
    } catch (err) {
      console.error('Failed to delete goal:', err)
      showToast('The goal could not be deleted')
    }
  }

  const addGoal = async (title) => {
    const cleanTitle = title?.trim()
    if (!cleanTitle) return

    // 1. Immediately close modal so user is never stuck waiting on "Saving..."
    setAddGoalModalOpen(false)

    // 2. Immediately create an optimistic goal and update entire website instantly
    const tempGoal = createOptimisticGoal(cleanTitle)
    setGoals(items => [...items, tempGoal])

    // 3. Persist to server in background
    try {
      const created = await createGoalApi(cleanTitle, sessionToken)
      const saved = presentGoal(created)
      setGoals(items => items.map(item => item.id === tempGoal.id ? saved : item))
      await refreshProfile()
    } catch (err) {
      console.error('Failed to create goal:', err)
      setGoals(items => items.filter(item => item.id !== tempGoal.id))
      showToast('The goal could not be saved')
    }
  }

  const openSprintHistory = async sprintNumber => {
    const cached = timelineHistory.sprints.find(sprint => sprint.sprint_number === sprintNumber)
    if (cached?.goals) return setHistoryModal(cached)
    try {
      const sprint = await fetchSprintHistoryApi(sprintNumber, selectedTimelineYear, sessionToken)
      setTimelineHistory(items => updateSprintInTimeline(items, sprintNumber, sprint))
      setHistoryModal(sprint)
    } catch {}
  }

  const handleUpdateProfile = async (username, displayName, profilePhoto = null, bio = null) => {
    try {
      const result = await updateAuthProfile({
        username,
        display_name: displayName,
        profile_photo: profilePhoto,
        bio: bio !== null ? bio : currentUser?.bio || ""
      }, sessionToken)
      setCurrentUser(result.user)
      if (profile) {
        setProfile(prev => ({
          ...prev,
          user: result.user
        }))
      }
      return result.user
    } catch (e) {
      throw e
    }
  }

  const userLabel = currentUser?.display_name || currentUser?.name || currentUser?.email || 'Sai'
  const needsProfile = Boolean(currentUser?.needs_profile)
  const streak = profile?.stats?.current_streak ?? 0
  const completionRate = profile?.stats?.completion_rate ?? 0

  if (!authReady) {
    if (isNativeApp()) return null
    return (
      <div className="ktl-fullscreen-overlay">
        <KineticTextLoader text="Loading" />
      </div>
    )
  }

  if (shareUsername) {
    return (
      <PublicProfilePage
        publicData={publicData}
        publicLoading={publicLoading}
        publicError={publicError}
        publicYear={publicYear}
        setPublicYear={setPublicYear}
        handleGoogle={handleGoogle}
        headerHidden={headerHidden}
      />
    )
  }

  if (!currentUser) {
    return (
      <main className="app-shell logged-out">
        <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
          <SpotlightNavbar items={[]} />
        </header>

        <section className="content">
          <LandingPage
            onGetStarted={() => setShowAuthModal(true)}
            onSignIn={() => setShowAuthModal(true)}
            serverSprint={serverSprint}
          />
        </section>

        {showAuthModal && (
          <div className="modal-backdrop" onClick={() => !authLoading && setShowAuthModal(false)}>
            <AuthScreen
              onGoogle={handleGoogle}
              gisReady={gisReady}
              native={isNativeShell()}
              loading={authLoading}
              error={authError}
              onClose={() => !authLoading && setShowAuthModal(false)}
            />
          </div>
        )}

        <AuthTransitionOverlay active={authLoading} message={authStatus} />

        {toastMsg && (
          <div className="bottom-toast-notification" role="status" aria-live="polite">
            {!toastNoTick && <span className="toast-tick" aria-hidden="true">✓</span>}
            <span className="toast-text">{toastMsg}</span>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <SpotlightNavbar
          active={active}
          setActive={setActive}
          keyboardHidden={keyboardOpen}
          items={['Overview', 'Goals', 'Rote', 'Timeline', 'Profile']}
        />
      </header>

      <section className="content" id="top">
        {active !== 'Overview' ? (
          <WorkspacePage
            active={active}
            data={{ ...data, day, total: data.total }}
            user={currentUser}
            goals={goals}
            profile={profile}
            history={timelineHistory}
            historyModal={historyModal}
            selectedYear={selectedTimelineYear}
            availableYears={timelineHistory.years}
            onSelectYear={setSelectedTimelineYear}
            onOpenSprint={openSprintHistory}
            onCloseSprint={() => setHistoryModal(null)}
            onProgress={updateProgress}
            onComplete={startCompletion}
            onDelete={deleteGoal}
            onAdd={() => setAddGoalModalOpen(true)}
            onShowGoalDetails={showGoalDetails}
            onUpdateProfile={handleUpdateProfile}
            showToast={showToast}
            onLogout={logout}
            onRotesChanged={handleRotesChanged}
            editModalOpen={editModalOpen}
            setEditModalOpen={setEditModalOpen}
            roteStats={roteOverviewStats}
          />
        ) : (
          <OverviewPage
            userLabel={userLabel}
            greeting={greeting}
            data={{ ...data, day, total: data.total }}
            now={now}
            goals={goals}
            completeGoals={completeGoals}
            streak={streak}
            completionRate={completionRate}
            quoteIndices={quoteIndices}
            roteOverviewStats={roteOverviewStats}
            setActive={setActive}
            setAddGoalModalOpen={setAddGoalModalOpen}
            showGoalDetails={showGoalDetails}
            toggleRoteFromOverview={toggleRoteFromOverview}
          />
        )}

        {needsProfile && (
          <ProfileSetupModal
            user={currentUser}
            onSubmit={completeProfile}
            loading={profileLoading}
            error={profileError}
          />
        )}
        <AddGoalModal
          isOpen={addGoalModalOpen}
          onClose={() => setAddGoalModalOpen(false)}
          onSubmit={addGoal}
          loading={false}
          deadline={deadlineStr}
        />
        <CompletionFlowModal
          flow={completionFlow}
          setFlow={setCompletionFlow}
          onContinue={continueCompletion}
          onComplete={completeGoal}
          onCancel={() => setCompletionFlow(null)}
        />
        <CompletedShareModal
          completedShare={completedShare}
          onClose={() => setCompletedShare(null)}
        />
        <GoalDetailsModal
          goal={selectedGoalDetails}
          onClose={() => setSelectedGoalDetails(null)}
        />
        <DeleteGoalConfirmModal
          goal={deleteConfirmFlow}
          onCancel={() => setDeleteConfirmFlow(null)}
          onConfirm={confirmDeleteGoal}
        />
        {toastMsg && (
          <div className="dock-toast" role="status" aria-live="polite">
            {!toastNoTick && <span className="dock-toast-tick" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 12 12" focusable="false"><path d="M2 6.4 4.8 9.2 10 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
            <span className="dock-toast-text">{toastMsg}</span>
          </div>
        )}
        <AppReturnModal
          appReturnFlow={appReturnFlow}
          onClose={() => setAppReturnFlow(null)}
        />
        <AuthTransitionOverlay active={authLoading} message={authStatus} />
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
