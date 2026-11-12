/**
 * Admin login (front-end only).
 * The password is never stored: only a salted PBKDF2 hash in this browser's localStorage.
 * NOTE: without a server this keeps customers out of the dashboard UI, but it is not real security.
 * Real protection needs the products + login to live on a backend (see README).
 */
const KEY = 'rc.admin.v1'
const LOCK = 'rc.admin.lock'
const SESSION = 'rc.admin.session'
const SESSION_MS = 2 * 60 * 60 * 1000
const ITER = 150_000

interface Account {
  user: string
  salt: string
  hash: string
  /** 0 = fallback hash (no WebCrypto: plain http), otherwise PBKDF2 iterations */
  iter: number
}

const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')

async function digest(password: string, salt: string, iter: number): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle && iter > 0) {
    const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter },
      key,
      256,
    )
    return hex(bits)
  }
  // fallback for non-secure contexts (http://): weak but better than plain text
  let h = 2166136261
  const s = salt + password
  for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16)
}

const read = <T>(k: string, store: Storage = localStorage): T | null => {
  try {
    const raw = store.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
const write = (k: string, v: unknown, store: Storage = localStorage) => {
  try {
    store.setItem(k, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

export const hasAccount = () => read<Account>(KEY) !== null
export const accountName = () => read<Account>(KEY)?.user ?? ''

const randomSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)))

export const validatePassword = (pw: string): string | null => {
  if (pw.length < 8) return 'Use at least 8 characters.'
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number.'
  return null
}

export async function createAccount(user: string, password: string) {
  const salt = randomSalt()
  const iter = globalThis.crypto?.subtle ? ITER : 0
  write(KEY, { user: user.trim(), salt, hash: await digest(password, salt, iter), iter } satisfies Account)
  startSession()
}

/** wrong attempts slow down: 5 fails -> 30 s, then 1 min, 5 min ... */
export const lockedFor = (): number => {
  const l = read<{ fails: number; until: number }>(LOCK)
  return l ? Math.max(0, Math.ceil((l.until - Date.now()) / 1000)) : 0
}

export async function login(user: string, password: string): Promise<'ok' | 'bad' | 'locked'> {
  if (lockedFor() > 0) return 'locked'
  const acc = read<Account>(KEY)
  const ok =
    !!acc &&
    acc.user.toLowerCase() === user.trim().toLowerCase() &&
    (await digest(password, acc.salt, acc.iter)) === acc.hash
  if (ok) {
    try {
      localStorage.removeItem(LOCK)
    } catch {
      /* ignore */
    }
    startSession()
    return 'ok'
  }
  const l = read<{ fails: number; until: number }>(LOCK) ?? { fails: 0, until: 0 }
  const fails = l.fails + 1
  const wait = fails % 5 === 0 ? [30, 60, 300, 900][Math.min(3, fails / 5 - 1)] * 1000 : 0
  write(LOCK, { fails, until: Date.now() + wait })
  return wait ? 'locked' : 'bad'
}

export async function changePassword(current: string, next: string): Promise<boolean> {
  const acc = read<Account>(KEY)
  if (!acc || (await digest(current, acc.salt, acc.iter)) !== acc.hash) return false
  const salt = randomSalt()
  const iter = globalThis.crypto?.subtle ? ITER : 0
  write(KEY, { ...acc, salt, iter, hash: await digest(next, salt, iter) } satisfies Account)
  return true
}

const startSession = () => write(SESSION, { t: Date.now() }, sessionStorage)
export const isLoggedIn = () => {
  const s = read<{ t: number }>(SESSION, sessionStorage)
  return !!s && Date.now() - s.t < SESSION_MS
}
export const logout = () => {
  try {
    sessionStorage.removeItem(SESSION)
  } catch {
    /* ignore */
  }
}
