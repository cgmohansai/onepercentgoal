import { useEffect, useRef } from 'react'

// Calls `handler` when the user presses Escape, unless `disabled`.
// Uses a ref so the listener is subscribed once and always invokes the
// latest handler. Purely additive: existing close paths are untouched.
export function useEscapeKey(handler, disabled = false) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (disabled) return
    const onKeyDown = event => {
      if (event.key === 'Escape' && handlerRef.current) handlerRef.current(event)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [disabled])
}

export default useEscapeKey
