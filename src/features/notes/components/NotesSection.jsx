import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MagnifyingGlass, Plus, PushPin, PencilSimple, X } from '@phosphor-icons/react'
import HeaderInfoTooltip from '../../../components/HeaderInfoTooltip'
import {
  getStoredNotes,
  persistNotes,
  mergeNotes,
  noteLinks,
  isTempNote,
  createLocalNote,
  fetchNotes,
  createNote as createNoteApi,
  updateNote as updateNoteApi,
  deleteNote as deleteNoteApi,
} from '../noteService'
import {
  enqueueSyncAction,
  executeSyncWithRipple,
  SyncStatus,
  setSyncStatus,
  getSyncQueue,
  setSyncQueue,
  subscribeSyncStatus,
} from '../../../services/syncManager.js'
import { getStoredToken } from '../../../services/apiClient.js'

function snippet(body) {
  const clean = String(body || '').trim().replace(/\s+/g, ' ')
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean
}

function formatDate(iso) {
  try {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function linksOf(note) {
  return noteLinks(note)
}

/**
 * Personal Notes (FR-06): dedicated section for private notes with optional
 * reference links to any number of goals and rotes. Account-only,
 * local-first, idempotent sync via client-generated ids.
 */
export function NotesSection({ goals = [], rotes = [], showToast, onShowGoalDetails, onNavigateRote }) {
  const [notes, setNotes] = useState(() => getStoredNotes())
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [editorNote, setEditorNote] = useState(null)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [busy, setBusy] = useState(false)
  const searchInputRef = useRef(null)

  const goalList = useMemo(
    () => (Array.isArray(goals) ? goals : []).filter(g => !(g.done || g.completed) && !String(g.id).startsWith('temp-')),
    [goals]
  )
  const roteList = useMemo(
    () => (Array.isArray(rotes) ? rotes : []).filter(r => !String(r.id).startsWith('temp-')),
    [rotes]
  )
  const goalMap = useMemo(() => {
    const map = new Map()
    for (const g of (Array.isArray(goals) ? goals : [])) map.set(String(g.id), g)
    return map
  }, [goals])
  const roteMap = useMemo(() => {
    const map = new Map()
    for (const r of roteList) map.set(String(r.id), r)
    return map
  }, [roteList])

  const notify = (msg, noTick) => {
    if (showToast) showToast(msg, noTick)
  }

  // Truthful failure message: "waiting for internet" only when actually
  // offline; otherwise say exactly what failed so it can be diagnosed.
  const syncFailMsg = (err) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'Note saved locally (waiting for internet)'
    }
    if (err && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.name === 'TypeError')) {
      return 'Note saved locally — server not reachable, will retry'
    }
    if (err && err.status === 404 && err.message && /^(goal|rote|note) not found$/i.test(err.message.trim())) {
      return 'Note saved locally — linked goal/rote missing, will retry'
    }
    if (err && err.status === 404) {
      return 'Note saved locally — server needs a restart for notes, will retry'
    }
    if (err && err.status) {
      return `Note saved locally — server refused (HTTP ${err.status}), will retry`
    }
    return 'Note saved locally — will sync automatically'
  }
  const offlineSavedMsg = (err) => syncFailMsg(err)

  const refresh = useCallback(async () => {
    const token = getStoredToken()
    if (!token) return
    try {
      const server = await fetchNotes({ includeDeleted: true, token })
      setNotes(prev => {
        const merged = mergeNotes(server, prev)
        persistNotes(merged)
        return merged
      })
    } catch {}
  }, [])

  useEffect(() => {
    refresh()
    // Reconcile after background queue flushes (e.g. offline creates that
    // just synced) whenever the tab regains focus or becomes visible.
    const onFocus = () => refresh()
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    // Refresh right after any sync settles so freshly flushed creates
    // replace their local temps instead of lingering as duplicates.
    let prevSyncing = false
    const unsub = subscribeSyncStatus((state) => {
      const syncing = state.status === SyncStatus.SYNCING
      if (prevSyncing && !syncing) refresh()
      prevSyncing = syncing
    })
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      unsub()
    }
  }, [refresh])

  const upsertLocal = (fn) => {
    setNotes(prev => {
      const next = fn(prev)
      persistNotes(next)
      return next
    })
  }

  const linkPayload = (links) => (Array.isArray(links) ? links : []).map(l => ({
    goal_id: l.goal_id ?? null,
    rote_id: l.rote_id ?? null,
  }))

  const primaryOf = (links) => ({
    goalId: links.find(l => l.goal_id != null)?.goal_id ?? null,
    roteId: links.find(l => l.rote_id != null)?.rote_id ?? null,
  })

  const commitCreate = async ({ title, body, pinned = false, links }) => {
    const payloadLinks = linkPayload(links)
    const local = createLocalNote({ title, body, pinned, links: payloadLinks })
    upsertLocal(prev => [local, ...prev])
    const token = getStoredToken()
    if (!token) {
      enqueueSyncAction({ type: 'CREATE_NOTE', title, body, pinned, links: payloadLinks, tempId: local.id })
      notify('Note saved locally', false)
      return
    }
    try {
      const saved = await executeSyncWithRipple(
        () => createNoteApi({ title, body, pinned, links: payloadLinks, clientId: local.id }, token),
        { minRippleMs: 600 }
      )
      upsertLocal(prev => prev.map(n => (n.id === local.id ? saved : n)))
      notify('Note saved', false)
    } catch (err) {
      enqueueSyncAction({ type: 'CREATE_NOTE', title, body, pinned, links: payloadLinks, tempId: local.id })
      notify(offlineSavedMsg(err), true)
    }
  }

  const handleCreate = async ({ title, body, pinned, links }) => {
    if (busy) return
    setBusy(true)
    try {
      await commitCreate({ title, body, pinned, links })
      setCreating(false)
    } finally {
      setBusy(false)
    }
  }

  const commitUpdate = async (note, { title, body, pinned, links }) => {
    const payloadLinks = linkPayload(links)
    const { goalId, roteId } = primaryOf(payloadLinks)
    const now = new Date().toISOString()
    upsertLocal(prev => prev.map(n => (
      String(n.id) === String(note.id)
        ? { ...n, title, body, pinned, links: payloadLinks, goal_id: goalId, rote_id: roteId, updated_at: now }
        : n
    )))
    // Unsynced temp note: just keep the queued create current.
    if (isTempNote(note)) {
      try {
        const queue = getSyncQueue()
        setSyncQueue(queue.map(q => (
          q.type === 'CREATE_NOTE' && q.tempId === note.id
            ? { ...q, title, body, links: payloadLinks }
            : q
        )))
      } catch {}
      return
    }
    const token = getStoredToken()
    if (!token) {
      enqueueSyncAction({ type: 'UPDATE_NOTE', noteId: note.id, title, body, pinned, links: payloadLinks, baseVersion: note.version })
      notify('Note saved locally', false)
      return
    }
    try {
      const saved = await executeSyncWithRipple(
        () => updateNoteApi(note.id, { title, body, pinned, links: payloadLinks }, note.version, token),
        { minRippleMs: 600 }
      )
      upsertLocal(prev => prev.map(n => (String(n.id) === String(note.id) ? saved : n)))
      notify('Note updated', false)
    } catch (err) {
      if (err && err.code === 'CONFLICT') {
        const serverCopy = err.server
        const conflictCopy = createLocalNote({
          title: title ? `${title} (my edit)` : 'My edit (conflicted)',
          body: `My edit (conflicted):\n${body}`,
          links: payloadLinks,
        })
        upsertLocal(prev => [
          conflictCopy,
          ...prev.map(n => (String(n.id) === String(note.id) ? { ...serverCopy } : n)),
        ])
        enqueueSyncAction({ type: 'CREATE_NOTE', title: conflictCopy.title, body: conflictCopy.body, links: payloadLinks, tempId: conflictCopy.id })
        notify('Note changed elsewhere — kept both versions', true)
        refresh()
        return
      }
      enqueueSyncAction({ type: 'UPDATE_NOTE', noteId: note.id, title, body, pinned, links: payloadLinks, baseVersion: note.version })
      notify(offlineSavedMsg(err), true)
    }
  }

  // Instant pin: optimistic flip, silent background sync — no ripple, no toast.
  // Also refreshes the open editor so the modal star updates immediately.
  const togglePin = async (note) => {
    const pinned = !note.pinned
    const now = new Date().toISOString()
    upsertLocal(prev => prev.map(n => (
      String(n.id) === String(note.id) ? { ...n, pinned, updated_at: now } : n
    )))
    setEditorNote(prev => (prev && String(prev.id) === String(note.id) ? { ...prev, pinned } : prev))
    if (isTempNote(note)) {
      try {
        const queue = getSyncQueue()
        setSyncQueue(queue.map(q => (
          q.type === 'CREATE_NOTE' && q.tempId === note.id ? { ...q, pinned } : q
        )))
      } catch {}
      return
    }
    const token = getStoredToken()
    if (!token) {
      enqueueSyncAction({ type: 'UPDATE_NOTE', noteId: note.id, pinned, baseVersion: note.version })
      return
    }
    try {
      const saved = await updateNoteApi(note.id, { pinned }, note.version, token)
      upsertLocal(prev => prev.map(n => (String(n.id) === String(note.id) ? saved : n)))
    } catch (err) {
      if (err && err.code === 'CONFLICT') {
        refresh()
        return
      }
      enqueueSyncAction({ type: 'UPDATE_NOTE', noteId: note.id, pinned, baseVersion: note.version })
    }
  }

  const commitDelete = async (note) => {
    if (isTempNote(note)) {
      // Never synced: drop locally and discard its queued create.
      try {
        const queue = getSyncQueue()
        setSyncQueue(queue.filter(q => !(q.type === 'CREATE_NOTE' && q.tempId === note.id)))
      } catch {}
      upsertLocal(prev => prev.filter(n => String(n.id) !== String(note.id)))
    } else {
      upsertLocal(prev => prev.map(n => (String(n.id) === String(note.id) ? { ...n, deleted: true } : n)))
      const token = getStoredToken()
      if (!token) {
        enqueueSyncAction({ type: 'DELETE_NOTE', noteId: note.id })
      } else {
        try {
          await deleteNoteApi(note.id, token)
          setSyncStatus(SyncStatus.SYNCED)
        } catch {
          enqueueSyncAction({ type: 'DELETE_NOTE', noteId: note.id })
        }
      }
      notify('Note deleted', false)
    }
    setConfirmDeleteId(null)
    setEditorNote(null)
  }

  const matchesQuery = (note, q) => {
    if (!q) return true
    return `${note.title || ''}\n${note.body || ''}`.toLowerCase().includes(q)
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (Array.isArray(notes) ? notes : []).filter(n => {
      if (n.deleted) return false
      if (!matchesQuery(n, q)) return false
      return true
    })
    return list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    })
  }, [notes, query])

  const openSearch = () => {
    setSearchOpen(true)
    setTimeout(() => {
      try { searchInputRef.current && searchInputRef.current.focus() } catch {}
    }, 60)
  }

  const renderLinkChip = (note) => {
    const links = linksOf(note)
    if (links.length === 0) return null
    return (
      <span className="note-links">
        {links.map((l, i) => {
          const isGoal = l.goal_id != null
          const target = isGoal ? goalMap.get(String(l.goal_id)) : roteMap.get(String(l.rote_id))
          const label = l.goal_title || l.rote_title || target?.title || (isGoal ? 'Goal' : 'Rote')
          return (
            <button
              key={`${isGoal ? 'g' : 'r'}-${l.goal_id ?? l.rote_id}-${i}`}
              type="button"
              className="note-link-chip"
              onClick={(e) => {
                e.stopPropagation()
                if (isGoal && target && onShowGoalDetails) onShowGoalDetails(target)
                else if (!isGoal && onNavigateRote) onNavigateRote()
              }}
              title={isGoal ? `Open goal: ${label}` : `Open rote: ${label}`}
            >
              {label}
            </button>
          )
        })}
      </span>
    )
  }

  return (
    <div className="workspace-page notes-page-custom">
      <header className="goals-page-header">
        <div className="goals-badge-row" aria-hidden="true" />
        <div className="goals-title-action-row">
          <h1 className="goals-sprint-title" style={{ display: 'inline-flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <span className="title-main-text" style={{ whiteSpace: 'nowrap' }}>
              Personal <em>Notes</em>
            </span>
            <HeaderInfoTooltip description="Only you can see these. Link a note to any goals or rotes for reference — notes sync across your devices and work offline." />
          </h1>
          <div className="notes-header-actions">
            <button type="button" className="notes-icon-btn" aria-label="Search notes" title="Search notes" onClick={openSearch}>
              <MagnifyingGlass size={17} />
            </button>
            <button type="button" className="add-button" onClick={() => setCreating(true)}>
              <Plus size={14} weight="bold" /> New note
            </button>
          </div>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rote-empty-state notes-empty-state">
          <p>
            {notes.filter(n => !n.deleted).length === 0
              ? 'No notes yet. Capture anything — ideas, reflections, reminders.'
              : 'Nothing matches. Try a different search.'}
          </p>
          {notes.filter(n => !n.deleted).length === 0 && (
            <button className="add-button" style={{ marginTop: '12px', display: 'inline-block' }} onClick={() => setCreating(true)}>
              + Write your first note
            </button>
          )}
        </div>
      ) : (
        <div className="notes-grid">
          {visible.map(note => (
            <article
              key={note.id}
              className={`note-card card${note.pinned ? ' pinned' : ''}`}
              onClick={() => { setEditorNote(note); setConfirmDeleteId(null) }}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') { setEditorNote(note); setConfirmDeleteId(null) } }}
            >
              <div className="note-card-top">
                <span className="note-card-title">{note.title || 'Untitled'}</span>
                <span className="note-card-icons">
                  <button
                    type="button"
                    aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                    className={`note-pin-btn inline${note.pinned ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); togglePin(note) }}
                  >
                    <PushPin size={14} weight={note.pinned ? 'fill' : 'regular'} />
                  </button>
                </span>
              </div>
              <p className="note-card-snippet">{snippet(note.body)}</p>
              <div className="note-card-foot">
                {renderLinkChip(note)}
                <span className="note-card-right">
                  {isTempNote(note) && <span className="note-pending-dot" title="Not synced yet — will sync when online" />}
                  <span className="note-card-date">{formatDate(note.updated_at)}</span>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {searchOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSearchOpen(false)}>
          <div className="modal-content notes-search-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search notes">
            <div className="notes-search-field">
              <MagnifyingGlass size={17} />
              <input
                ref={searchInputRef}
                aria-label="Search notes"
                placeholder="Search notes…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="notes-icon-btn sm" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="notes-search-results">
              {visible.length === 0 ? (
                <p className="notes-empty">No matching notes.</p>
              ) : (
                visible.slice(0, 30).map(note => (
                  <button
                    key={note.id}
                    type="button"
                    className="notes-search-hit"
                    onClick={() => { setSearchOpen(false); setEditorNote(note); setConfirmDeleteId(null) }}
                  >
                    <strong>{note.title || 'Untitled'}</strong>
                    <span>{snippet(note.body)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(editorNote || creating) && (
        <NoteEditorModal
          key={editorNote ? String(editorNote.id) : 'new'}
          note={editorNote}
          goals={goalList}
          rotes={roteList}
          goalMap={goalMap}
          roteMap={roteMap}
          busy={busy}
          onClose={() => { setEditorNote(null); setCreating(false); setConfirmDeleteId(null) }}
          onCreate={handleCreate}
          onSave={async (patch) => {
            await commitUpdate(editorNote, patch)
            setEditorNote(null)
          }}
          onTogglePin={() => editorNote && togglePin(editorNote)}
          onDelete={() => editorNote && setConfirmDeleteId(editorNote.id)}
          confirmDelete={Boolean(editorNote) && confirmDeleteId === editorNote.id}
          onConfirmDelete={() => editorNote && commitDelete(editorNote)}
          onCancelDelete={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

function SelectedLinksBox({ links, goalMap, roteMap, pickerOpen, onTogglePicker, onRemove, goals, rotes, onToggle }) {
  const labelFor = (l) => {
    if (l.goal_id != null) {
      const g = goalMap.get(String(l.goal_id))
      return { kind: 'goal', id: l.goal_id, title: g?.title || 'Goal' }
    }
    const r = roteMap.get(String(l.rote_id))
    return { kind: 'rote', id: l.rote_id, title: r?.title || 'Rote' }
  }
  return (
    <div className="note-links-box">
      <div className="note-links-box-row">
        <span className="note-links-box-label">Linked</span>
        <span className="note-links-box-chips">
          {links.length === 0 && <span className="note-links-none">None</span>}
          {links.map((l, i) => {
            const info = labelFor(l)
            return (
              <span key={`${info.kind}-${info.id}-${i}`} className="note-link-chip static">
                {info.title}
                <button
                  type="button"
                  aria-label={`Remove link to ${info.title}`}
                  className="note-link-remove"
                  onClick={() => onRemove(info.kind, info.id)}
                >
                  <X size={12} weight="bold" />
                </button>
              </span>
            )
          })}
        </span>
        <button type="button" className="notes-icon-btn sm" aria-label="Choose links" title="Choose links" onClick={onTogglePicker}>
          <PencilSimple size={15} />
        </button>
      </div>
      {pickerOpen && (
        <div className="note-link-picker">
          {goals.length > 0 && (
            <div className="note-link-group">
              <span>Goals</span>
              {goals.map(g => {
                const checked = links.some(l => String(l.goal_id) === String(g.id))
                return (
                  <label key={g.id} className="note-link-option">
                    <input type="checkbox" checked={checked} onChange={() => onToggle('goal', g.id)} />
                    {g.title}
                  </label>
                )
              })}
            </div>
          )}
          {rotes.length > 0 && (
            <div className="note-link-group">
              <span>Rotes</span>
              {rotes.map(r => {
                const checked = links.some(l => String(l.rote_id) === String(r.id))
                return (
                  <label key={r.id} className="note-link-option">
                    <input type="checkbox" checked={checked} onChange={() => onToggle('rote', r.id)} />
                    {r.title}
                  </label>
                )
              })}
            </div>
          )}
          {goals.length === 0 && rotes.length === 0 && (
            <p className="notes-empty">No goals or rotes to link yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function NoteEditorModal({ note, goals, rotes, goalMap, roteMap, busy, onClose, onCreate, onSave, onTogglePin, onDelete, confirmDelete, onConfirmDelete, onCancelDelete }) {
  const isNew = !note
  const initialLinks = !isNew
    ? (() => {
      const fromLinks = linksOf(note).map(l => ({ goal_id: l.goal_id ?? null, rote_id: l.rote_id ?? null }))
      if (fromLinks.length > 0) return fromLinks
      if (note.goal_id != null || note.rote_id != null) {
        return [{ goal_id: note.goal_id ?? null, rote_id: note.rote_id ?? null }]
      }
      return []
    })()
    : []
  const [title, setTitle] = useState(note?.title || '')
  const [body, setBody] = useState(note?.body || '')
  const [pinned, setPinned] = useState(Boolean(note?.pinned))
  const [links, setLinks] = useState(initialLinks)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = isNew
    ? body.trim().length > 0
    : (title.trim() !== (note.title || '') || body.trim() !== (note.body || '') || pinned !== Boolean(note.pinned) || JSON.stringify(links) !== JSON.stringify(initialLinks))

  const toggle = (kind, id) => {
    const idStr = String(id)
    const exists = links.some(l => String(kind === 'goal' ? l.goal_id : l.rote_id) === idStr);
    if (exists) {
      setLinks(links.filter(l => String(kind === 'goal' ? l.goal_id : l.rote_id) !== idStr));
    } else {
      setLinks([...links, kind === 'goal' ? { goal_id: id, rote_id: null } : { goal_id: null, rote_id: id }]);
    }
  };

  const handleSave = async () => {
    if (!body.trim() || saving || busy) return
    setSaving(true)
    try {
      if (isNew) {
        await onCreate({ title: title.trim(), body: body.trim(), pinned, links })
      } else {
        await onSave({ title: title.trim(), body: body.trim(), pinned, links })
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePin = () => {
    if (isNew) {
      setPinned(v => !v)
    } else {
      onTogglePin()
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-content note-editor-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isNew ? 'New note' : 'Edit note'}>
        <div className="note-editor-top">
          <span className="notes-eyebrow">{isNew ? 'NEW NOTE' : 'EDIT NOTE'}</span>
          <button
            type="button"
            className={`note-pin-btn${(isNew ? pinned : note.pinned) ? ' active' : ''}`}
            title={(isNew ? pinned : note.pinned) ? 'Unpin' : 'Pin to top'}
            onClick={handlePin}
          >
            <PushPin size={15} weight={(isNew ? pinned : note.pinned) ? 'fill' : 'regular'} />
          </button>
        </div>
        <input
          aria-label="Note title"
          className="notes-title-input"
          placeholder="Title (optional)"
          value={title}
          maxLength={140}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          aria-label="Note body"
          className="note-editor-body"
          value={body}
          rows={8}
          onChange={e => setBody(e.target.value)}
        />
        <SelectedLinksBox
          links={links}
          goalMap={goalMap}
          roteMap={roteMap}
          pickerOpen={pickerOpen}
          onTogglePicker={() => setPickerOpen(v => !v)}
          onRemove={toggle}
          goals={goals}
          rotes={rotes}
          onToggle={toggle}
        />
        <div className="note-editor-actions">
          {confirmDelete ? (
            <>
              <span className="note-delete-prompt">Delete this note?</span>
              <button type="button" className="opg-btn opg-btn-danger" onClick={onConfirmDelete}>Yes, delete</button>
              <button type="button" className="opg-btn opg-btn-ghost" onClick={onCancelDelete}>Keep</button>
            </>
          ) : isNew ? (
            <>
              <span style={{ flex: 1 }} />
              <button type="button" className="opg-btn opg-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="opg-btn opg-btn-primary" disabled={!body.trim() || saving || busy} onClick={handleSave}>
                {saving || busy ? 'Saving…' : 'Save note'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="opg-btn opg-btn-ghost" onClick={onDelete}>Delete</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="opg-btn opg-btn-ghost" onClick={onClose}>Close</button>
              <button type="button" className="opg-btn opg-btn-primary" disabled={!body.trim() || !dirty || saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotesSection
