/* =========================================================
   BACKUP — copies of every slot kept in IndexedDB, apart from localStorage where the game saves.
   Each slot keeps three: a recent one (renewed every few minutes), one from about an hour ago and
   one from about a day ago. The older ones are never taken from the game as it is now: when one is
   due, every copy moves one step older, so the three always come from different moments and there
   is always a copy from before something went wrong.
   A fourth copy keeps the game a slot held just before an import, a restore or a new hero replaced
   it, so that can be undone.
   Without IndexedDB (private windows) every call quietly does nothing.
   ========================================================= */

const DB_NAME = 'aetheria-backups'
const STORE = 'saves'
// How old the copy of each tier may get before it is renewed
export const TIERS = [
  { id: 'recent', every: 0 },
  { id: 'hour', every: 3600e3 },
  { id: 'day', every: 86400e3 },
]
export const BACKUP_EVERY = 5 * 60e3
export const BEFORE = 'before'

let dbPromise = null
function db() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  dbPromise ||= new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
  return dbPromise
}
// One request in its own transaction, as a promise (null when anything fails)
async function run(mode, fn) {
  const d = await db()
  if (!d) return null
  return new Promise(resolve => {
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

// Every copy of a slot, newest first
export async function listBackups(slot) {
  const all = (await run('readonly', s => s.getAll())) || []
  const order = id => TIERS.findIndex(t => t.id === id)
  return all.filter(b => b.slot === slot).sort((a, b) => b.at - a.at || order(a.tier) - order(b.tier))
}

const put = (slot, tier, copy) => run('readwrite', s => s.put({ id: `${slot}:${tier}`, slot, tier, at: copy.at, info: copy.info, data: copy.data }))

// Writes the recent copy. When an older tier is missing or out of date, the copies below it move up a
// step first (the hour copy becomes the day copy, the recent one the hour copy). `info` is the slot summary
export async function writeBackup(slot, data, info, now = Date.now()) {
  const have = Object.fromEntries((await listBackups(slot)).map(b => [b.tier, b]))
  let top = 0
  TIERS.forEach((tier, k) => {
    const old = have[tier.id]
    if (k && have[TIERS[k - 1].id] && (!old || now - old.at >= tier.every)) top = k
  })
  for (let k = top; k > 0; k--) if (have[TIERS[k - 1].id]) await put(slot, TIERS[k].id, have[TIERS[k - 1].id])
  await put(slot, TIERS[0].id, { at: now, info, data })
  return true
}

// Keeps the game a slot holds right before something replaces it
export function writeBefore(slot, data, info, now = Date.now()) {
  return put(slot, BEFORE, { at: now, info, data })
}

export async function readBackup(slot, tier) {
  const b = await run('readonly', s => s.get(`${slot}:${tier}`))
  return b ? JSON.parse(b.data) : null
}

export async function deleteBackups(slot) {
  for (const tier of [...TIERS.map(t => t.id), BEFORE]) await run('readwrite', s => s.delete(`${slot}:${tier}`))
}
