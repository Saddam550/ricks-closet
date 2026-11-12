import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Admin } from './Admin'
import { createAccount, hasAccount, isLoggedIn, lockedFor, login, validatePassword } from './auth'

const input =
  'w-full h-11 rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-ink bg-white'

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#f4f2ef] text-ink flex items-center justify-center p-4">
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-xl border border-black/10 p-7">
        <div className="text-center mb-5">
          <div className="font-serif italic font-bold text-[24px] leading-none">Rick's Closet</div>
          <div className="text-[10px] tracking-[0.25em] text-ink/45 mt-1.5">ADMIN</div>
        </div>
        <h1 className="text-[17px] font-semibold">{title}</h1>
        <p className="text-[13px] text-ink/55 mt-1 mb-5 leading-snug">{sub}</p>
        {children}
        <a href="#/" className="block text-center text-[12px] text-ink/50 underline underline-offset-4 mt-5">
          ← Back to shop
        </a>
      </div>
    </div>
  )
}

function Setup({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('admin')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim()) return setErr('Choose a username.')
    const bad = validatePassword(pw)
    if (bad) return setErr(bad)
    if (pw !== pw2) return setErr('The two passwords do not match.')
    setBusy(true)
    await createAccount(user, pw)
    onDone()
  }

  return (
    <Shell title="Create your admin login" sub="First time here. Choose the username and password you will use to open this dashboard.">
      <form onSubmit={submit} className="space-y-3">
        <input className={input} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username" autoComplete="username" />
        <input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (8+ characters, with a number)" autoComplete="new-password" />
        <input className={input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat password" autoComplete="new-password" />
        {err && <p className="text-[13px] text-red-700">{err}</p>}
        <button disabled={busy} className="w-full h-11 rounded-full bg-ink text-white text-[14px] font-medium hover:opacity-90 disabled:opacity-50">
          Create login
        </button>
      </form>
    </Shell>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(lockedFor)

  useEffect(() => {
    if (wait <= 0) return
    const t = setInterval(() => setWait(lockedFor()), 1000)
    return () => clearInterval(t)
  }, [wait])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (wait > 0) return
    setBusy(true)
    const r = await login(user, pw)
    setBusy(false)
    if (r === 'ok') return onDone()
    setPw('')
    setWait(lockedFor())
    setErr(r === 'locked' ? '' : 'Wrong username or password.')
  }

  return (
    <Shell title="Admin login" sub="Sign in to add, edit or delete products.">
      <form onSubmit={submit} className="space-y-3">
        <input className={input} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username" autoComplete="username" autoFocus />
        <input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoComplete="current-password" />
        {err && <p className="text-[13px] text-red-700">{err}</p>}
        {wait > 0 && <p className="text-[13px] text-red-700">Too many attempts. Try again in {wait}s.</p>}
        <button disabled={busy || wait > 0} className="w-full h-11 rounded-full bg-ink text-white text-[14px] font-medium hover:opacity-90 disabled:opacity-50">
          Sign in
        </button>
      </form>
    </Shell>
  )
}

export function AdminGate() {
  const [, tick] = useState(0)
  const refresh = () => tick((n) => n + 1)
  if (!hasAccount()) return <Setup onDone={refresh} />
  if (!isLoggedIn()) return <Login onDone={refresh} />
  return <Admin onLogout={refresh} />
}
