/**
 * Private Notes service: account-only notes (global, per-goal, per-rote).
 * Local-first: persisted to localStorage immediately, synced in background.
 * Never exposed on public profiles or public API payloads.
 */

import { apiFetch, buildHeaders, getStoredToken } from '../../services/apiClient.js'

export const NOTES_STORAGE_KEY = 'opg.notes'

export function getStoredNotes() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function persistNotes(notes) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(Array.isArray(notes) ? notes : []))
  } catch {}
}

export function makeClientId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `nc-${crypto.randomUUID()}`;
  } catch {}
  return `nc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isTempNote(note) {
  const id = String(note?.id || '');
  return id.startsWith('temp-note-') || id.startsWith('nc-');
}

function isPersistedId(id) {
  if (id === null || id === undefined) return false;
  const s = String(id);
  return s !== '' && !s.startsWith('temp-') && !s.startsWith('nc-') && !Number.isNaN(Number(s));
}

function carryTempLinks(localNote, serverNote) {
  const localLinks = Array.isArray(localNote?.links) ? localNote.links : [];
  const tempLinks = localLinks.filter(l => !isPersistedId(l.goal_id) && !isPersistedId(l.rote_id) && (l.goal_id != null || l.rote_id != null));
  if (tempLinks.length === 0) return serverNote;
  const serverLinks = Array.isArray(serverNote.links) ? serverNote.links.slice() : [];
  return { ...serverNote, links: [...serverLinks, ...tempLinks] };
}

export function selectNotes(notes, { goalId = null, roteId = null } = {}) {
  return (Array.isArray(notes) ? notes : []).filter(n => {
    if (n.deleted) return false
    const links = Array.isArray(n.links) ? n.links : [];
    if (goalId !== null && goalId !== undefined) {
      return String(n.goal_id) === String(goalId) || links.some(l => String(l.goal_id) === String(goalId));
    }
    if (roteId !== null && roteId !== undefined) {
      return String(n.rote_id) === String(roteId) || links.some(l => String(l.rote_id) === String(roteId));
    }
    const linked = n.goal_id != null || n.rote_id != null || links.length > 0;
    return !linked;
  })
}

export function noteLinks(note) {
  if (!note) return [];
  const links = Array.isArray(note.links) ? note.links.slice() : [];
  // Backfill legacy single-link columns so old rows render links too.
  if (links.length === 0) {
    if (note.goal_id != null || note.rote_id != null) {
      links.push({ goal_id: note.goal_id ?? null, rote_id: note.rote_id ?? null });
    }
  }
  return links;
}

export function mergeNotes(serverNotes = [], localNotes = []) {
  const serverList = Array.isArray(serverNotes) ? serverNotes : [];
  const byClientId = new Map();
  for (const s of serverList) {
    if (s.client_id) byClientId.set(String(s.client_id), s);
  }
  const map = new Map();
  const skippedTemps = new Map();
  for (const n of (Array.isArray(localNotes) ? localNotes : [])) {
    // A temp note whose create already reached the server is replaced by the
    // server copy (matched via client_id) — never duplicated.
    if (isTempNote(n) && byClientId.has(String(n.id))) {
      skippedTemps.set(String(n.id), n);
      continue;
    }
    map.set(String(n.id), n);
  }
  for (const s of serverList) {
    const id = String(s.id);
    const local = map.get(id);
    if (!local) {
      const adopted = s.client_id && skippedTemps.has(String(s.client_id))
        ? carryTempLinks(skippedTemps.get(String(s.client_id)), s)
        : s;
      map.set(id, adopted);
      continue;
    }
    if (isTempNote(local)) {
      map.set(id, carryTempLinks(local, s));
      continue;
    }
    // Server wins on version conflict only when strictly newer — but local
    // temp-id links (not yet syncable) are carried over, never silently lost.
    if ((s.version || 1) > (local.version || 1)) {
      map.set(id, carryTempLinks(local, s));
    }
  }
  return [...map.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export function createLocalNote({ body, title = '', links = [], goalId = null, roteId = null, pinned = false }) {
  const now = new Date().toISOString();
  const resolvedLinks = Array.isArray(links) && links.length > 0
    ? links
    : ((goalId != null || roteId != null) ? [{ goal_id: goalId ?? null, rote_id: roteId ?? null }] : []);
  return {
    id: makeClientId(),
    goal_id: resolvedLinks.find(l => l.goal_id != null)?.goal_id ?? null,
    rote_id: resolvedLinks.find(l => l.rote_id != null)?.rote_id ?? null,
    links: resolvedLinks,
    title,
    body,
    pinned: Boolean(pinned),
    version: 1,
    deleted: false,
    created_at: now,
    updated_at: now,
    _pending: true,
  };
}

export async function fetchNotes({ goalId = null, roteId = null, includeDeleted = false, token = null, timeout = 0 } = {}) {
  const params = new URLSearchParams()
  if (goalId !== null && goalId !== undefined) params.set('goal_id', String(goalId))
  if (roteId !== null && roteId !== undefined) params.set('rote_id', String(roteId))
  if (includeDeleted) params.set('include_deleted', 'true')
  const qs = params.toString()
  const headers = buildHeaders({}, token || getStoredToken())
  const res = await apiFetch(`/api/notes${qs ? `?${qs}` : ''}`, { headers, ...(timeout > 0 ? { timeout } : {}) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Unable to load notes (${res.status})`)
  }
  return res.json()
}

export async function createNote({ body, title = '', links = [], goalId = null, roteId = null, pinned = false, clientId = null }, token = null) {
  const headers = buildHeaders({ 'Content-Type': 'application/json' }, token || getStoredToken())
  const resolvedLinks = Array.isArray(links) && links.length > 0
    ? links
    : ((goalId != null || roteId != null) ? [{ goal_id: goalId ?? null, rote_id: roteId ?? null }] : []);
  let res;
  try {
    res = await apiFetch('/api/notes', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        body, title, links: resolvedLinks,
        goal_id: goalId, rote_id: roteId,
        pinned: Boolean(pinned), client_id: clientId,
      }),
    });
  } catch (networkErr) {
    networkErr.code = networkErr.code || 'NETWORK';
    throw networkErr;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error((err && err.detail) || `Unable to save note (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function updateNote(noteId, { body, title, pinned, links, goalId, roteId } = {}, baseVersion, token = null) {
  const headers = buildHeaders({ 'Content-Type': 'application/json' }, token || getStoredToken())
  const payload = {}
  if (body !== undefined) payload.body = body
  if (title !== undefined) payload.title = title
  if (pinned !== undefined) payload.pinned = pinned
  if (links !== undefined) payload.links = links
  if (goalId !== undefined) payload.goal_id = goalId
  if (roteId !== undefined) payload.rote_id = roteId
  if (baseVersion !== null && baseVersion !== undefined) payload.base_version = baseVersion
  let res;
  try {
    res = await apiFetch(`/api/notes/${noteId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
  } catch (networkErr) {
    networkErr.code = networkErr.code || 'NETWORK';
    throw networkErr;
  }
  if (!res.ok) {
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      const detail = data?.detail || {}
      const err = new Error((detail && detail.message) || 'Note changed elsewhere')
      err.code = 'CONFLICT'
      err.server = detail && detail.server ? detail.server : null
      throw err
    }
    const err = await res.json().catch(() => ({}))
    const error = new Error((err && err.detail) || `Unable to update note (${res.status})`)
    error.status = res.status
    throw error
  }
  return res.json()
}

export async function deleteNote(noteId, token = null) {
  const headers = buildHeaders({}, token || getStoredToken())
  const res = await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE', headers })
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Unable to delete note (${res.status})`)
  }
  return res.json().catch(() => null)
}
