import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { isNativeApp } from './reminders'

import { Browser } from '@capacitor/browser'
import { SocialLogin } from '@capgo/capacitor-social-login'
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
  isNativeShell,
  loadGoogleIdentityServices,
  parseAuthUrl,
  getNativeAuthReturn,
  cleanAuthUrlParams,
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
  haveGoalsDiffered,
  getFallbackGoals,
  trackDeletedGoalId,
  getDeletedGoalIds,
  clearDeletedGoalIds,
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
  haveRotesDiffered,
} from './features/rotes/roteUtils'
import {
  fetchTimeline as fetchTimelineApi,
  fetchSprintHistory as fetchSprintHistoryApi,
} from './features/timeline/timelineService'
import {
  createEmptyTimeline,
  updateSprintInTimeline,
  syncTimelineWithGoals,
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
import AdaptiveLoader, { isMobileDevice } from './components/AdaptiveBootLoader'
import SpotlightNavbar from './components/SpotlightNavbar'
import ToastPopup from './components/ToastPopup'
import LandingPage from './components/LandingPage'
import OverviewPage from './components/OverviewPage'
import WorkspacePage from './components/WorkspacePage'
import PublicProfilePage from './components/PublicProfilePage'
import NotFoundPage from './components/NotFoundPage'
import AuthScreen from './features/auth/components/AuthModal'
import AuthTransitionOverlay from './features/auth/components/AuthTransitionOverlay'
import AppReturnModal from './features/auth/components/AppReturnModal'
import ProfileSetupModal from './components/ProfileSetupModal'
import AddGoalModal from './features/goals/components/AddGoalModal'
import CompletionFlowModal from './features/goals/components/CompletionFlowModal'
import CompletedShareModal from './features/goals/components/CompletedShareModal'
import GoalDetailsModal from './features/goals/components/GoalDetailsModal'
import DeleteGoalConfirmModal from './features/goals/components/DeleteGoalConfirmModal'
import SyncStatusBadge from './components/SyncStatusBadge'
import OnboardingModal, { hasSeenOnboarding, markOnboardingSeen } from './components/OnboardingModal'
import {
  enqueueSyncAction,
  setSyncStatus,
  triggerTransientSync,
  executeSyncWithRipple,
  markRoteInFlight,
  unmarkRoteInFlight,
  markGoalInFlight,
  unmarkGoalInFlight,
  getSyncState,
  flushSyncQueue,
  SyncStatus
} from './services/syncManager'
import ErrorBoundary from './components/ErrorBoundary'
import { MOTIVATIONAL_QUOTES } from './constants/quotes'
import { resetMorphIndex, pauseMorphTimer, resumeMorphTimer } from './components/MorphText'

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

  // Reset scroll to top helper covering window, body, html and all scrollable containers
  const resetScrollToTop = useCallback(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    } catch {
      window.scrollTo(0, 0)
    }
    if (document.documentElement) {
      document.documentElement.scrollTop = 0
      document.documentElement.scrollLeft = 0
    }
    if (document.body) {
      document.body.scrollTop = 0
      document.body.scrollLeft = 0
    }
    const scrollContainers = document.querySelectorAll('.content, .app-shell, main, section, .workspace-page, .landing-page')
    scrollContainers.forEach(el => {
      if (el) {
        try {
          el.scrollTo({ top: 0, left: 0, behavior: 'instant' })
        } catch {}
        el.scrollTop = 0
        el.scrollLeft = 0
      }
    })
  }, [])

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
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed.map(presentGoal)
      }
    } catch {}
    return getFallbackGoals()
  })

  const [isGoalsLoading, setIsGoalsLoading] = useState(true)

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
    markRoteInFlight(targetIdStr)

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

    if (targetIdStr.startsWith('temp-')) {
      unmarkRoteInFlight(targetIdStr)
      showToast(targetStatus ? 'Routine completed locally' : 'Routine marked pending', false)
      return
    }

    // 2. Sync to server with guaranteed blue ripple duration and smooth toast after ripple
    try {
      await executeSyncWithRipple(async () => {
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
        return confirmedStatus
      }, {
        minRippleMs: 850,
        onSuccess: (confirmed) => {
          unmarkRoteInFlight(targetIdStr)
          showToast(confirmed ? 'Routine completed' : 'Routine marked pending', false)
        },
        onError: () => {
          unmarkRoteInFlight(targetIdStr)
          enqueueSyncAction({ type: 'TOGGLE_ROTE', roteId, date: todayStr, completed: targetStatus })
          showToast('Routine saved locally (waiting for internet)', true)
        }
      })
    } catch (err) {
      unmarkRoteInFlight(targetIdStr)
      console.warn('Network error toggling rote from overview; queued offline sync:', err)
    }
  }

  const [addGoalModalOpen, setAddGoalModalOpen] = useState(false)
  const [timelineHistory, setTimelineHistory] = useState(() => {
    try {
      const year = new Date().getFullYear()
      const stored = localStorage.getItem(`opg.timeline.${year}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') return parsed
      }
    } catch {}
    return createEmptyTimeline()
  })
  const [selectedTimelineYear, setSelectedTimelineYear] = useState(new Date().getFullYear())
  const [profile, setProfile] = useState(() => {
    try {
      const stored = localStorage.getItem('opg.profile')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [historyModal, setHistoryModal] = useState(null)
  const [completionFlow, setCompletionFlow] = useState(null)
  const [selectedGoalDetails, setSelectedGoalDetails] = useState(null)
  const [serverSprint, setServerSprint] = useState(() => {
    try {
      const stored = localStorage.getItem('opg.sprint.current')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const [currentPath, setCurrentPath] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'))

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const normalizedPath = currentPath.length > 1 && currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath
  const isRootPath = normalizedPath === '' || normalizedPath === '/' || normalizedPath === '/index.html'
  const shareMatch = normalizedPath.match(/^\/u\/([a-zA-Z0-9_-]+)$/)
  const shareUsername = shareMatch ? shareMatch[1] : null
  const isProfileRoute = normalizedPath.startsWith('/u')
  const isOutOfBound = !isRootPath && !shareUsername

  const [publicData, setPublicData] = useState(null)
  const [publicLoading, setPublicLoading] = useState(Boolean(shareUsername))
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
            const err = await response.json().catch(() => ({}))
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
      ...goal,
      title: goal.title,
      completion_note: goal.completion_note || goal.completed_note || ''
    })
  }

  const [sessionToken, setSessionToken] = useState(() => getStoredToken())
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const token = getStoredToken()
      if (!token) return null
      const stored = localStorage.getItem('opg.current_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [authReady, setAuthReady] = useState(() => {
    try {
      const token = getStoredToken()
      if (!token) return true
      const stored = localStorage.getItem('opg.current_user')
      return Boolean(stored)
    } catch {
      return false
    }
  })
  const [gisReady, setGisReady] = useState(false)
  const googleSignInInFlight = useRef(false)
  const gisInitializedRef = useRef(false)
  const [nativeAuthReturn, setNativeAuthReturn] = useState(() => getNativeAuthReturn())
  const [appReturnFlow, setAppReturnFlow] = useState(null)

  // Reset scroll to top whenever active tab changes or user logs in/out
  useEffect(() => {
    setHeaderHidden(false)
    resetScrollToTop()
    const raf1 = requestAnimationFrame(() => resetScrollToTop())
    const raf2 = requestAnimationFrame(() => {
      requestAnimationFrame(() => resetScrollToTop())
    })
    const timer1 = setTimeout(() => resetScrollToTop(), 50)
    const timer2 = setTimeout(() => resetScrollToTop(), 150)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [active, currentUser ? (currentUser.id || currentUser._id || currentUser.email || 'user') : 'guest', resetScrollToTop])

  // Constant top gap on every app open: the Android WebView can restore a
  // previous scroll position, making the header gap look different per open.
  // Force back to top on mount, focus, visibility return, and native resume.
  useEffect(() => {
    resetScrollToTop()
    const onReturn = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setHeaderHidden(false)
        resetScrollToTop()
      }
    }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    let resumeHandle = null
    try {
      if (isNativeShell() && CapacitorApp && typeof CapacitorApp.addListener === 'function') {
        const maybePromise = CapacitorApp.addListener('resume', onReturn)
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(h => { resumeHandle = h }).catch(() => {})
        } else {
          resumeHandle = maybePromise
        }
      }
    } catch {}
    return () => {
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
      try { if (resumeHandle && typeof resumeHandle.remove === 'function') resumeHandle.remove() } catch {}
    }
  }, [resetScrollToTop])

  useEffect(() => {
    if (authReady) {
      if (window.hideBootLoader) window.hideBootLoader()
      const el = document.getElementById('boot-loader')
      if (el && el.parentNode) {
        setTimeout(() => {
          if (el && el.parentNode) el.parentNode.removeChild(el)
        }, 200)
      }
    }
  }, [authReady, shareUsername])

  useEffect(() => {
    // Desktop web: remove any static boot-loader immediately so only React's AdaptiveLoader is active
    if (!isNativeShell() && !isMobileDevice()) {
      const el = document.getElementById('boot-loader')
      if (el && el.parentNode) el.parentNode.removeChild(el)
    }
  }, [])

  useEffect(() => {
    // Mark the native shell so it gets the same end-of-page clearance as
    // the mobile website, regardless of WebView viewport width.
    if (isNativeShell()) document.body.classList.add('capacitor-native')
  }, [])

  const [authLoading, setAuthLoading] = useState(false)
  const [authStatus, setAuthStatus] = useState('Signing you in…')
  const [authError, setAuthError] = useState('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
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

    // On web / mobile browser: only hide the dock when an input field is currently active/focused
    const checkWebKeyboard = () => {
      const activeEl = document.activeElement
      const isInput = activeEl &&
        (activeEl.tagName === 'INPUT' ||
         activeEl.tagName === 'TEXTAREA' ||
         activeEl.isContentEditable)
      if (!isInput) {
        setKeyboardOpen(false)
        return
      }
      const vv = window.visualViewport
      if (vv) {
        setKeyboardOpen(vv.height < window.innerHeight - 120)
      } else {
        setKeyboardOpen(true)
      }
    }

    const onFocusIn = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
        setTimeout(checkWebKeyboard, 300)
      }
    }
    const onFocusOut = () => {
      setTimeout(() => setKeyboardOpen(false), 100)
    }

    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', checkWebKeyboard)
    }

    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      if (vv) {
        vv.removeEventListener('resize', checkWebKeyboard)
      }
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
    if (authLoading) {
      pauseMorphTimer()
      return
    }
    resumeMorphTimer()
    const id = setInterval(() => setNow(getISTDate()), 1000)
    return () => clearInterval(id)
  }, [authLoading])

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
    // Bounded boot check: a hung backend (slow localhost server, cold start,
    // stalled proxy) must never hang the boot loader forever. On timeout we
    // keep the cached session and let the sync effects retry in background.
    getCurrentUser(token, { timeout: 12000 })
      .then(user => {
        if (user) {
          setCurrentUser(user)
          try { localStorage.setItem('opg.current_user', JSON.stringify(user)) } catch {}
        }
        setAuthReady(true)
      })
      .catch((err) => {
        if (err && err.code === 'TIMEOUT') {
          setAuthReady(true)
          return
        }
        if (token) {
          removeStoredToken()
          setSessionToken('')
          try { localStorage.removeItem('opg.current_user') } catch {}
        }
        setCurrentUser(null)
        setAuthReady(true)
      })
  }, [])

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('opg.current_user', JSON.stringify(currentUser))
      } else {
        localStorage.removeItem('opg.current_user')
      }
    } catch {}
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
        try {
          const user = await getCurrentUser(token, { timeout: 10000 })
          setCurrentUser(user)
          setAuthStatus('Preparing your dashboard…')
          const todayStr = getTodayYMD()
          const [dashResult, rotesResult] = await Promise.allSettled([
            fetchDashboard(token, { timeout: 8000 }),
            fetchRotesApi(todayStr, token, { timeout: 8000 }),
          ])

          if (dashResult.status === 'fulfilled' && dashResult.value) {
            const dashData = dashResult.value
            if (dashData.year) {
              setServerSprint(dashData.year)
              try { localStorage.setItem('opg.sprint.current', JSON.stringify(dashData.year)) } catch {}
            }
            const deletedIds = getDeletedGoalIds()
            const freshGoals = (dashData.goals || [])
              .filter(g => !deletedIds.has(String(g.id)))
              .map(presentGoal)
            updateGoalsAndSyncTimeline(freshGoals)
          }

          if (rotesResult.status === 'fulfilled' && rotesResult.value) {
            const rotesData = rotesResult.value
            if (rotesData && Array.isArray(rotesData.rotes)) {
              const stored = getStoredRotes(todayStr)
              const localRotes = stored?.rotes || []
              const mergedRotes = mergeRotes(rotesData.rotes, localRotes)
              handleRotesChanged({ ...rotesData, rotes: mergedRotes })
            }
          }
          setSyncStatus(SyncStatus.SYNCED)
          showToast('Welcome to OnePercentGoal')
        } catch {
          removeStoredToken()
          setSessionToken('')
          setAuthError('Your sign-in session could not be restored. Please try again.')
          setShowAuthModal(true)
        } finally {
          setAuthLoading(false)
        }
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
      .then(s => {
        if (s) {
          setServerSprint(s)
          try { localStorage.setItem('opg.sprint.current', JSON.stringify(s)) } catch {}
        }
      })
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
      try { localStorage.setItem('opg.profile', JSON.stringify(profileData)) } catch {}
      if (timelineData) {
        setTimelineHistory(timelineData)
        try { localStorage.setItem(`opg.timeline.${yr}`, JSON.stringify(timelineData)) } catch {}
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err)
    }
  }

  const loadDashboard = async (token, isBackground = false) => {
    if (!isBackground) setIsGoalsLoading(true)
    try {
      const dashData = await fetchDashboard(token)
      if (dashData.year) {
        setServerSprint(dashData.year)
        try { localStorage.setItem('opg.sprint.current', JSON.stringify(dashData.year)) } catch {}
      }
      const deletedIds = getDeletedGoalIds()
      const serverGoals = (dashData.goals || [])
        .filter(g => !deletedIds.has(String(g.id)))
        .map(presentGoal)

      setGoals(prev => {
        const merged = mergeGoals(prev, serverGoals)
        if (isBackground && haveGoalsDiffered(prev, merged)) {
          // Cross-device update incoming from server!
          // 1. Immediately start blue ripple
          setSyncStatus(SyncStatus.SYNCING)
          // 2. Wait 700ms so ripple is clearly seen radiating
          setTimeout(() => {
            // 3. When loaded, update entire app (goals, timeline, stats) simultaneously
            updateGoalsAndSyncTimeline(merged)
            // 4. Blue ripple completes and goes back to green
            setSyncStatus(SyncStatus.SYNCED)
          }, 700)
          return prev
        }
        try { localStorage.setItem('opg.dashboard.goals', JSON.stringify(merged)) } catch {}
        return merged
      })
    } catch {
      setGoals(prev => {
        if (prev && prev.length > 0) return prev
        const stored = localStorage.getItem('opg.dashboard.goals')
        if (stored !== null) {
          try {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) return parsed.map(presentGoal)
          } catch {}
        }
        return getFallbackGoals()
      })
    } finally {
      setIsGoalsLoading(false)
    }
  }

  const loadRotes = async (token, isBackground = false) => {
    const todayStr = getTodayYMD()
    const activeToken = token || sessionToken || localStorage.getItem('onepercentgoal.token') || localStorage.getItem('token')
    if (!activeToken) return
    try {
      const rotesData = await fetchRotesApi(todayStr, activeToken)
      if (rotesData && Array.isArray(rotesData.rotes)) {
        const stored = getStoredRotes(todayStr)
        const localRotes = stored?.rotes || []
        const merged = mergeRotes(rotesData.rotes, localRotes)
        if (isBackground && haveRotesDiffered(localRotes, merged)) {
          setSyncStatus(SyncStatus.SYNCING)
          setTimeout(() => {
            handleRotesChanged({ ...rotesData, rotes: merged })
            setSyncStatus(SyncStatus.SYNCED)
          }, 700)
        } else {
          handleRotesChanged({ ...rotesData, rotes: merged })
        }
      }
    } catch {}
  }

  // Cross-device live synchronization: fast poll every 1 second and on focus/resume.
  // Covers: website refresh (effect re-runs on mount with stored session),
  // native app reopen (Capacitor 'resume'), tab focus, and visibility return —
  // so Overview, Goals, Rote, Timeline and Profile all converge right after
  // any update on any device.
  useEffect(() => {
    if (!currentUser || !sessionToken) return

    const triggerSilentSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      // Pause background poll while active local mutation is syncing to prevent race conditions
      if (getSyncState().status === SyncStatus.SYNCING) return
      loadDashboard(sessionToken, true)
      loadRotes(sessionToken, true)
      flushSyncQueue(sessionToken)
    }

    // Re-sync immediately on mount / refresh when already logged in, so a
    // page reload with a stored session still flashes the syncing ripple and
    // pulls the latest server state into every view at once.
    triggerSilentSync()

    const interval = setInterval(triggerSilentSync, 1000)
    window.addEventListener('focus', triggerSilentSync)
    document.addEventListener('visibilitychange', triggerSilentSync)

    // Native Android: WebView focus/visibility events are unreliable on
    // app reopen — listen to the Capacitor resume event explicitly.
    let resumeHandle = null
    try {
      if (isNativeShell() && CapacitorApp && typeof CapacitorApp.addListener === 'function') {
        const maybePromise = CapacitorApp.addListener('resume', triggerSilentSync)
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(h => { resumeHandle = h }).catch(() => {})
        } else {
          resumeHandle = maybePromise
        }
      }
    } catch {}

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', triggerSilentSync)
      document.removeEventListener('visibilitychange', triggerSilentSync)
      try { if (resumeHandle && typeof resumeHandle.remove === 'function') resumeHandle.remove() } catch {}
    }
  }, [currentUser, sessionToken])

  // Startup & Post-Login Synchronization:
  // Immediately start the blue ripple, fetch updated goals & rotes from the server in parallel,
  // and smoothly update the entire application (overview, goals, routines) simultaneously when complete.
  useEffect(() => {
    if (!currentUser || !sessionToken) return

    let cancelled = false
    const initialSync = async () => {
      setSyncStatus(SyncStatus.SYNCING)
      const startTime = Date.now()
      const todayStr = getTodayYMD()

      try {
        // Bounded: each request aborts on its own deadline so a stalled
        // backend can never leave the sync badge / goals skeleton stuck.
        const [dashResult, rotesResult] = await Promise.allSettled([
          fetchDashboard(sessionToken, { timeout: 10000 }),
          fetchRotesApi(todayStr, sessionToken, { timeout: 10000 }),
          flushSyncQueue(sessionToken),
        ])

        if (cancelled) return

        let freshGoals = null
        if (dashResult.status === 'fulfilled' && dashResult.value) {
          const dashData = dashResult.value
          if (dashData.year) {
            setServerSprint(dashData.year)
            try { localStorage.setItem('opg.sprint.current', JSON.stringify(dashData.year)) } catch {}
          }
          const deletedIds = getDeletedGoalIds()
          freshGoals = (dashData.goals || [])
            .filter(g => !deletedIds.has(String(g.id)))
            .map(presentGoal)
        }

        let freshRotesPayload = null
        if (rotesResult.status === 'fulfilled' && rotesResult.value) {
          const rotesData = rotesResult.value
          if (rotesData && Array.isArray(rotesData.rotes)) {
            const stored = getStoredRotes(todayStr)
            const localRotes = stored?.rotes || []
            const mergedRotes = mergeRotes(rotesData.rotes, localRotes)
            freshRotesPayload = { ...rotesData, rotes: mergedRotes }
          }
        }

        // Smooth perception: guarantee blue ripple is visibly radiating for at least 750ms
        const elapsed = Date.now() - startTime
        if (elapsed < 750) {
          await new Promise(r => setTimeout(r, 750 - elapsed))
        }
        if (cancelled) return

        // Update entire app simultaneously with real server data
        if (freshGoals !== null) {
          updateGoalsAndSyncTimeline(prev => mergeGoals(prev, freshGoals))
        }
        if (freshRotesPayload !== null) {
          handleRotesChanged(freshRotesPayload)
        }

        setSyncStatus(SyncStatus.SYNCED)
      } catch (err) {
        if (!cancelled) setSyncStatus(SyncStatus.SYNCED)
      } finally {
        if (!cancelled) setIsGoalsLoading(false)
      }
    }

    initialSync()

    return () => {
      cancelled = true
    }
  }, [currentUser, sessionToken])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    if (data?.year && data.year !== selectedTimelineYear) {
      setSelectedTimelineYear(data.year)
    }
  }, [data?.year, currentUser, sessionToken])

  useEffect(() => {
    if (!currentUser || !sessionToken) return
    try {
      const cached = localStorage.getItem(`opg.timeline.${selectedTimelineYear}`)
      if (cached) {
        setTimelineHistory(JSON.parse(cached))
      }
    } catch {}
    refreshProfile(sessionToken, selectedTimelineYear)
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
      // Bounded verification: never leave "Signing you in…" hanging if the
      // backend stalls (e.g. localhost server not responding).
      const result = await verifyGoogleCredential(payload, { timeout: 15000 })

      // Always save session and log into the website Overview page first
      setStoredToken(result.token)
      setSessionToken(result.token)
      setCurrentUser(result.user)
      resetMorphIndex()
      setActive('Overview')
      setShowAuthModal(false)
      setAuthError('')
      resetScrollToTop()
      // First launch for brand-new accounts: one-time onboarding (FR-01)
      try {
        if (result.is_new && !hasSeenOnboarding(result.user?.id)) {
          setShowOnboarding(true)
        }
      } catch {}

      // Fetch fresh goals & routines from server while "Your dashboard is almost ready" is showing!
      // Bounded preload: each request aborts after 12s so the overlay can
      // never get stuck here — login always completes and the background
      // sync effect picks up whatever is still missing.
      setAuthStatus('Preparing your dashboard…')
      const todayStr = getTodayYMD()
      try {
        const [dashResult, rotesResult] = await Promise.allSettled([
          fetchDashboard(result.token, { timeout: 8000 }),
          fetchRotesApi(todayStr, result.token, { timeout: 8000 }),
        ])

        if (dashResult.status === 'fulfilled' && dashResult.value) {
          const dashData = dashResult.value
          if (dashData.year) {
            setServerSprint(dashData.year)
            try { localStorage.setItem('opg.sprint.current', JSON.stringify(dashData.year)) } catch {}
          }
          const deletedIds = getDeletedGoalIds()
          const freshGoals = (dashData.goals || [])
            .filter(g => !deletedIds.has(String(g.id)))
            .map(presentGoal)
          updateGoalsAndSyncTimeline(freshGoals)
        }

        if (rotesResult.status === 'fulfilled' && rotesResult.value) {
          const rotesData = rotesResult.value
          if (rotesData && Array.isArray(rotesData.rotes)) {
            const stored = getStoredRotes(todayStr)
            const localRotes = stored?.rotes || []
            const mergedRotes = mergeRotes(rotesData.rotes, localRotes)
            handleRotesChanged({ ...rotesData, rotes: mergedRotes })
          }
        }
      } catch (loadErr) {
        console.warn('Initial data load warning:', loadErr)
      }

      setSyncStatus(SyncStatus.SYNCED)
      showToast('Welcome to OnePercentGoal')

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
      const isTimeout = err && err.code === 'TIMEOUT'
      setAuthError(isTimeout
        ? 'Sign-in timed out — the server took too long to respond. Please check your connection (and that the backend is running on localhost) and try again.'
        : (err.message || 'Google authentication failed'))
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
    // Native Android account chooser via Credential Manager
    // (@capgo/capacitor-social-login, Capacitor 8 compatible). The returned
    // ID token is verified by the existing backend endpoint, so no backend
    // or protocol changes are involved.
    setAuthLoading(true)
    setAuthStatus('Choose your Google account…')
    setAuthError('')
    try {
      await SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID } })
      const { result } = await SocialLogin.login({
        provider: 'google',
        options: { scopes: ['email', 'profile'] },
      })
      const idToken = result?.idToken || ''
      if (!idToken) throw new Error('Google sign-in returned no credential.')
      await finishGoogleSignIn({ credential: idToken })
    } catch (error) {
      setAuthLoading(false)
      googleSignInInFlight.current = false
      const message = String(error?.message || '')
      // User dismissing the chooser is not an error — just stop loading.
      if (/cancel/i.test(message) || /USER_CANCELLED/i.test(message)) return
      // [28444] = app SHA-1 / package not registered in Google Cloud Console.
      setAuthError(message || 'Unable to sign in with Google. Please try again.')
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
    if (isNativeShell()) {
      try {
        await SocialLogin.logout({ provider: 'google' })
      } catch {
        // Native credential clear is best-effort; server session is
        // already revoked above so logout always completes.
      }
    }
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
    try {
      localStorage.removeItem('opg.current_user')
      localStorage.removeItem('opg.profile')
      localStorage.removeItem('opg.dashboard.goals')
      clearDeletedGoalIds()
    } catch {}
    resetScrollToTop()
  }

  const updateGoal = async (goal, payload) => {
    if (String(goal.id).startsWith('temp-')) return true
    const token = sessionToken || getStoredToken()
    try {
      return await executeSyncWithRipple(async () => {
        const updated = await updateGoalApi(goal.id, { ...payload, base_version: goal.version }, token)
        const saved = presentGoal(updated)
        setGoals(items => items.map(item => item.id === goal.id ? saved : item))
        await refreshProfile()
        return true
      }, {
        minRippleMs: 850,
        onSuccess: () => {
          showToast('Goal updated', false)
        },
        onError: (err) => {
          if (err && err.code === 'CONFLICT') {
            handleGoalConflict(goal.id, err.server)
            return
          }
          showToast('Goal updated locally (waiting for internet)', true)
        }
      })
    } catch { return false }
  }

  const updateGoalsAndSyncTimeline = updater => {
    setGoals(prevGoals => {
      const nextGoals = typeof updater === 'function' ? updater(prevGoals) : updater
      try {
        localStorage.setItem('opg.dashboard.goals', JSON.stringify(nextGoals))
      } catch {}
      setTimelineHistory(prevTimeline => {
        const nextTimeline = syncTimelineWithGoals(prevTimeline, data.year, data.sprint, nextGoals)
        try {
          localStorage.setItem(`opg.timeline.${data.year}`, JSON.stringify(nextTimeline))
        } catch {}
        return nextTimeline
      })
      setHistoryModal(prevModal => {
        if (prevModal && Number(prevModal.sprint_number) === Number(data.sprint) && Number(prevModal.year) === Number(data.year)) {
          const total = nextGoals.length
          const completed = nextGoals.filter(g => Boolean(g.done || g.completed)).length
          const totalPercent = nextGoals.reduce((sum, g) => sum + (Number(g.value ?? g.progress_percent ?? g.progress ?? 0)), 0)
          const average_progress = total ? Math.round(totalPercent / total) : 0
          return {
            ...prevModal,
            goal_count: total,
            completed_count: completed,
            average_progress,
            goals: nextGoals.map(g => ({
              id: g.id,
              title: g.title,
              target: g.target || 100,
              progress: g.progress || 0,
              progress_percent: g.value ?? g.progress_percent ?? (g.target ? Math.round((g.progress / g.target) * 100) : 0),
              completed: Boolean(g.done || g.completed),
              completion_note: g.completion_note || null,
              created_at: g.created_at,
            }))
          }
        }
        return prevModal
      })
      return nextGoals
    })
  }

  // Reconciles a 409 conflict response: adopts the server copy (newer version)
  // instead of blindly overwriting it, and tells the user what happened.
  const handleGoalConflict = useCallback((goalId, serverCopy) => {
    if (serverCopy) {
      const saved = presentGoal(serverCopy)
      updateGoalsAndSyncTimeline(items => items.map(item => String(item.id) === String(goalId) ? saved : item))
    }
    showToast('Goal changed on another device — refreshed to latest', true)
  }, [])

  const updateProgress = async (goal, progress_percent) => {
    markGoalInFlight(goal.id)
    // 1. Instantly update in-memory state, timeline, and persist to localStorage
    updateGoalsAndSyncTimeline(items => items.map(item => item.id === goal.id ? presentGoal({ ...item, progress_percent }) : item))

    const token = sessionToken || getStoredToken()
    if (!token || String(goal.id).startsWith('temp-')) {
      unmarkGoalInFlight(goal.id)
      enqueueSyncAction({ type: 'UPDATE_GOAL', goalId: goal.id, payload: { progress_percent } })
      setSyncStatus(SyncStatus.SYNCED)
      showToast('Progress saved locally', false)
      return
    }

    try {
      await executeSyncWithRipple(async () => {
        const updated = await updateGoalApi(goal.id, { progress_percent, base_version: goal.version }, token)
        const saved = presentGoal(updated)
        updateGoalsAndSyncTimeline(items => items.map(item => item.id === goal.id ? saved : item))
        refreshProfile(token).catch(() => {})
        return saved
      }, {
        minRippleMs: 850,
        onSuccess: () => {
          unmarkGoalInFlight(goal.id)
          showToast('Sprint progress updated', false)
        },
        onError: (err) => {
          unmarkGoalInFlight(goal.id)
          if (err && err.code === 'CONFLICT') {
            handleGoalConflict(goal.id, err.server)
            return
          }
          enqueueSyncAction({ type: 'UPDATE_GOAL', goalId: goal.id, payload: { progress_percent } })
          showToast('Progress saved locally (waiting for internet)', true)
        }
      })
    } catch (err) {
      unmarkGoalInFlight(goal.id)
      console.warn('Network error updating goal progress on server; saved locally:', err)
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
    markGoalInFlight(goal.id)
    const tempCompleted = { ...goal, done: true, value: 100, completion_note: note }
    updateGoalsAndSyncTimeline(items => items.map(item => item.id === goal.id ? tempCompleted : item))
    setCompletionFlow(null)
    setCompletedShare({ goal: tempCompleted, note, image: null })

    if (String(goal.id).startsWith('temp-')) {
      unmarkGoalInFlight(goal.id)
      showToast('Goal completed locally', false)
      return
    }

    const token = sessionToken || getStoredToken()
    if (!token) {
      unmarkGoalInFlight(goal.id)
      setSyncStatus(SyncStatus.SYNCED)
      showToast('Goal completed locally', false)
      return
    }

    try {
      await executeSyncWithRipple(async () => {
        const updated = await completeGoalApi(goal.id, note, token, goal.version ?? null)
        const saved = presentGoal(updated)
        updateGoalsAndSyncTimeline(items => items.map(item => item.id === saved.id ? saved : item))
        refreshProfile(token).catch(() => {})
        createCompletionCard(saved, note)
          .then(image => setCompletedShare(prev => prev && prev.goal.id === saved.id ? { ...prev, image } : prev))
          .catch(() => {})
        return saved
      }, {
        minRippleMs: 850,
        onSuccess: () => {
          unmarkGoalInFlight(goal.id)
          showToast('Goal completed', false)
        },
        onError: (err) => {
          unmarkGoalInFlight(goal.id)
          if (err && err.code === 'CONFLICT') {
            handleGoalConflict(goal.id, err.server)
            return
          }
          enqueueSyncAction({ type: 'COMPLETE_GOAL', goalId: goal.id, note })
          showToast('Goal completed locally (waiting for internet)', true)
        }
      })
    } catch (err) {
      unmarkGoalInFlight(goal.id)
      console.warn('Network error completing goal on server; queued offline sync:', err)
    }
  }

  const deleteGoal = (goal) => {
    setDeleteConfirmFlow(goal)
  }

  const confirmDeleteGoal = async (goal) => {
    if (!goal) return
    const goalToDelete = goal
    markGoalInFlight(goalToDelete.id)
    setDeleteConfirmFlow(null)

    // 1. Optimistically remove from state, timeline, and instantly persist to localStorage
    updateGoalsAndSyncTimeline(items => items.filter(item => String(item.id) !== String(goalToDelete.id)))

    // 2. Persistently track deleted ID so stale server sync or page refreshes NEVER resurrect it
    trackDeletedGoalId(goalToDelete.id)

    // 3. Persist deletion to server in background if authenticated
    if (String(goalToDelete.id).startsWith('temp-')) {
      unmarkGoalInFlight(goalToDelete.id)
      showToast('Goal deleted', false)
      return
    }

    const token = sessionToken || getStoredToken()
    if (!token) {
      unmarkGoalInFlight(goalToDelete.id)
      setSyncStatus(SyncStatus.SYNCED)
      showToast('Goal deleted', false)
      return
    }

    try {
      await executeSyncWithRipple(async () => {
        const ok = await deleteGoalApi(goalToDelete.id, token)
        if (!ok) throw new Error('Delete failed on server')
        refreshProfile(token).catch(() => {})
        return ok
      }, {
        minRippleMs: 850,
        onSuccess: () => {
          unmarkGoalInFlight(goalToDelete.id)
          showToast('Goal deleted', false)
        },
        onError: () => {
          unmarkGoalInFlight(goalToDelete.id)
          enqueueSyncAction({ type: 'DELETE_GOAL', goalId: goalToDelete.id })
          showToast('Goal deleted locally (waiting for internet)', true)
        }
      })
    } catch (err) {
      unmarkGoalInFlight(goalToDelete.id)
      console.warn('Failed to delete goal on server; queued offline sync:', err)
    }
  }

  const addGoal = async (title) => {
    const cleanTitle = title?.trim()
    if (!cleanTitle) return

    // 1. Immediately close modal so user is never stuck waiting on "Saving..."
    setAddGoalModalOpen(false)

    // 2. Immediately create an optimistic goal and update entire website & timeline instantly
    const tempGoal = createOptimisticGoal(cleanTitle)
    updateGoalsAndSyncTimeline(items => [...items, tempGoal])

    // 3. Persist to server in background with guaranteed visible blue ripple and smooth toast
    const token = sessionToken || getStoredToken()
    if (!token) {
      setSyncStatus(SyncStatus.PENDING)
      showToast('Goal created locally (waiting for internet)', true)
      enqueueSyncAction({ type: 'CREATE_GOAL', tempId: tempGoal.id, title: cleanTitle })
      return
    }

    try {
      await executeSyncWithRipple(async () => {
        const created = await createGoalApi(cleanTitle, token)
        const saved = presentGoal(created)
        updateGoalsAndSyncTimeline(items => items.map(item => item.id === tempGoal.id ? saved : item))
        refreshProfile(token).catch(() => {})
        return saved
      }, {
        minRippleMs: 850,
        onSuccess: () => {
          showToast('Goal created', false)
        },
        onError: () => {
          enqueueSyncAction({ type: 'CREATE_GOAL', tempId: tempGoal.id, title: cleanTitle })
          showToast('Goal created locally (waiting for internet)', true)
        }
      })
    } catch (err) {
      console.warn('Network error creating goal on server; saved locally:', err)
    }
  }

  const openSprintHistory = async sprintNumber => {
    const sNum = Number(sprintNumber)
    const isCurrentActiveSprint = sNum === Number(data.sprint) && Number(selectedTimelineYear) === Number(data.year)

    // If opening the active sprint, construct and display IMMEDIATELY from live state (0ms delay)
    if (isCurrentActiveSprint) {
      const currentGoalsList = goals.map(g => ({
        id: g.id,
        title: g.title,
        target: g.target || 100,
        progress: g.progress || 0,
        progress_percent: g.value ?? g.progress_percent ?? (g.target ? Math.round((g.progress / g.target) * 100) : 0),
        completed: Boolean(g.done || g.completed),
        completion_note: g.completion_note || null,
        created_at: g.created_at,
      }))
      const total = currentGoalsList.length
      const completed = currentGoalsList.filter(g => g.completed).length
      const totalPercent = currentGoalsList.reduce((sum, g) => sum + (Number(g.progress_percent || 0)), 0)
      const avg = total ? Math.round(totalPercent / total) : 0

      const cached = (timelineHistory.sprints || []).find(s => Number(s.sprint_number) === sNum)
      const activeSprintData = {
        year: data.year,
        sprint_number: sNum,
        sprint_start: cached?.sprint_start || getSprintBoundary(data.year, sNum - 1),
        sprint_end: cached?.sprint_end || getSprintBoundary(data.year, sNum),
        goal_count: total,
        completed_count: completed,
        average_progress: avg,
        goals: currentGoalsList,
      }
      setHistoryModal(activeSprintData)
      setTimelineHistory(items => updateSprintInTimeline(items, sNum, activeSprintData))
      return
    }

    const cached = (timelineHistory.sprints || []).find(s => Number(s.sprint_number) === sNum)
    if (cached?.goals) return setHistoryModal(cached)
    try {
      const sprint = await fetchSprintHistoryApi(sNum, selectedTimelineYear, sessionToken)
      setTimelineHistory(items => updateSprintInTimeline(items, sNum, sprint))
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
  // Aggregate profile metric: average progress across ACTIVE goals only.
  // Never the completed/total ratio, and never substituted for a goal's own %.
  const activeGoalsForAvg = goals.filter(g => !g.done && !g.completed)
  const avgActiveProgress = activeGoalsForAvg.length > 0
    ? Math.round(activeGoalsForAvg.reduce((sum, g) => sum + (Number(g.value ?? g.progress_percent ?? 0) || 0), 0) / activeGoalsForAvg.length)
    : 0

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

  if (isOutOfBound) {
    if (isProfileRoute) {
      return (
        <NotFoundPage
          title="Profile Not Found"
          subtitle="User not found"
          buttonText="Go Home"
          headerHidden={headerHidden}
        />
      )
    }
    return (
      <NotFoundPage
        title="Page Not Found"
        subtitle="Page not found"
        buttonText="Go Home"
        headerHidden={headerHidden}
      />
    )
  }

  if (!authReady) {
    return <AdaptiveLoader text="Loading" />
  }

  if (!currentUser) {
    return (
      <main className="app-shell logged-out">
        <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
          <SpotlightNavbar items={[]} />
        </header>

        <section className="content" key="content-guest">
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

        {toastMsg && <ToastPopup message={toastMsg} showTick={!toastNoTick} />}
      </main>
    )
  }

  return (
    <main className={`app-shell${active !== 'Overview' ? ' section-mode' : ''}`}>
      <div
        className="sync-status-container"
        style={{
          position: 'fixed',
          top: 'calc(14px + var(--safe-top, 0px))',
          right: '16px',
          zIndex: 9999,
          pointerEvents: 'auto',
        }}
      >
        <SyncStatusBadge onShowToast={showToast} />
      </div>

      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <SpotlightNavbar
          key={currentUser ? 'logged-in' : 'logged-out'}
          active={active}
          setActive={setActive}
          keyboardHidden={keyboardOpen}
            items={['Overview', 'Goals', 'Rote', 'Notes', 'Timeline', 'Profile']}
        />
      </header>

      <section
        className="content"
        id="top"
        key={`content-${currentUser ? (currentUser.id || currentUser._id || currentUser.email || 'user') : 'guest'}-${active}`}
      >
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
            setActive={setActive}
            roteStats={roteOverviewStats}
            isGoalsLoading={isGoalsLoading}
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
            avgActiveProgress={avgActiveProgress}
            quoteIndices={quoteIndices}
            roteOverviewStats={roteOverviewStats}
            setActive={setActive}
            setAddGoalModalOpen={setAddGoalModalOpen}
            showGoalDetails={showGoalDetails}
            toggleRoteFromOverview={toggleRoteFromOverview}
            isGoalsLoading={isGoalsLoading}
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
          onDelete={deleteGoal}
        />
        <DeleteGoalConfirmModal
          goal={deleteConfirmFlow}
          onCancel={() => setDeleteConfirmFlow(null)}
          onConfirm={confirmDeleteGoal}
        />
      </section>

      {toastMsg && <ToastPopup message={toastMsg} showTick={!toastNoTick} />}
      {showOnboarding && (
        <OnboardingModal
          onClose={() => {
            try { markOnboardingSeen(currentUser?.id) } catch {}
            setShowOnboarding(false)
          }}
        />
      )}
      <AppReturnModal
        appReturnFlow={appReturnFlow}
        onClose={() => setAppReturnFlow(null)}
      />
      <AuthTransitionOverlay active={authLoading} message={authStatus} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
