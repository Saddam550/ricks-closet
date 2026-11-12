import { useEffect, useMemo, useRef, useState } from 'react'
import { SIZES, formatPrice } from './data'
import type { Product, SideSprite, Sprite } from './data'
import { buildSprite } from './imageTools'
import type { SpriteOptions } from './imageTools'
import { accountName, changePassword, logout, validatePassword } from './auth'
import { addProduct, deleteProduct, getProducts, importProducts, resetProducts, updateProduct, useProducts } from './products'

const CHECKER =
  'repeating-conic-gradient(#ececec 0% 25%, #fafafa 0% 50%) 50% / 16px 16px'

const thumbOf = (p: Product) => (p.front ?? p.side).src

interface FormState {
  id: number | null
  name: string
  price: string
  sizes: string[]
  front: Sprite | undefined
  side: SideSprite | undefined
}

const emptyForm = (): FormState => ({
  id: null,
  name: '',
  price: '',
  sizes: ['S', 'M', 'L', 'XL'],
  front: undefined,
  side: undefined,
})

const fromProduct = (p: Product): FormState => ({
  id: p.id,
  name: p.name,
  price: String(p.price),
  sizes: p.sizes?.length ? p.sizes : [...SIZES],
  front: p.front,
  side: p.side,
})

/** photo picker with background removal + hanger, previews the processed sprite */
function PhotoField({
  label,
  hint,
  value,
  onChange,
  required,
}: {
  label: string
  hint: string
  value: Sprite | undefined
  onChange: (s: Sprite | undefined) => void
  required?: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [opts, setOpts] = useState<SpriteOptions>({ removeBg: true, tolerance: 18, hanger: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!file) return
    let live = true
    setBusy(true)
    setErr('')
    const t = setTimeout(() => {
      buildSprite(file, opts)
        .then((s) => live && onChangeRef.current(s))
        .catch(() => live && setErr('Could not read this image. Try a JPG, PNG or WebP photo.'))
        .finally(() => live && setBusy(false))
    }, 150)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [file, opts])

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold tracking-wide text-ink/60">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
        {value && !required && (
          <button
            type="button"
            className="text-[11px] text-red-700 underline"
            onClick={() => {
              setFile(null)
              onChange(undefined)
            }}
          >
            Remove photo
          </button>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="relative w-[150px] h-[190px] shrink-0 rounded-lg border border-dashed border-black/25 hover:border-ink/60 overflow-hidden flex items-center justify-center"
          style={{ background: CHECKER }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) setFile(f)
          }}
        >
          {value ? (
            <img src={value.src} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[11px] text-ink/50 px-3 text-center leading-snug">Click or drop a photo here</span>
          )}
          {busy && (
            <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-[11px] font-medium">
              Processing…
            </span>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setFile(f)
            e.target.value = ''
          }}
        />
        <div className="text-[12px] text-ink/70 space-y-2 min-w-0">
          <p className="leading-snug text-ink/55">{hint}</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts.removeBg}
              onChange={(e) => setOpts({ ...opts, removeBg: e.target.checked })}
            />
            Remove plain background
          </label>
          {opts.removeBg && (
            <label className="flex items-center gap-2">
              <span className="w-[64px] shrink-0">Strength</span>
              <input
                type="range"
                min={4}
                max={60}
                value={opts.tolerance}
                onChange={(e) => setOpts({ ...opts, tolerance: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts.hanger}
              onChange={(e) => setOpts({ ...opts, hanger: e.target.checked })}
            />
            Add a hanger
          </label>
          {!file && value && <p className="text-[11px] text-ink/45">Current photo kept. Pick a new file to replace it.</p>}
          {err && <p className="text-red-700">{err}</p>}
        </div>
      </div>
    </div>
  )
}

function ProductForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: FormState
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [f, setF] = useState(initial)
  const [err, setErr] = useState('')
  const [custom, setCustom] = useState('')
  const editing = f.id !== null
  // Built-in side-only pieces have no front photo: the "main photo" is then their side photo.
  const mainSprite = f.front ?? f.side

  const toggleSize = (s: string) =>
    setF((x) => ({ ...x, sizes: x.sizes.includes(s) ? x.sizes.filter((v) => v !== s) : [...x.sizes, s] }))

  const addCustomSize = () => {
    const s = custom.trim().toUpperCase()
    if (s && !f.sizes.includes(s)) setF((x) => ({ ...x, sizes: [...x.sizes, s] }))
    setCustom('')
  }

  const save = () => {
    const price = Math.round(Number(f.price))
    if (!f.name.trim()) return setErr('Product name is required.')
    if (!Number.isFinite(price) || price <= 0) return setErr('Enter a price greater than 0.')
    if (!f.sizes.length) return setErr('Pick at least one size.')
    if (!mainSprite) return setErr('Please add a product image.')
    const ordered = [...SIZES.filter((s) => f.sizes.includes(s)), ...f.sizes.filter((s) => !(SIZES as readonly string[]).includes(s))]
    const side: SideSprite = f.side ?? { ...mainSprite, faces: 1 }
    const base = { name: f.name.trim(), price, sizes: ordered, front: f.front, side }
    let ok: boolean
    if (editing) {
      const old = getProducts().find((p) => p.id === f.id)
      ok = updateProduct({ ...old, ...base, id: f.id! })
    } else {
      ok = addProduct(base)
    }
    if (!ok) return setErr('The browser storage is full. Delete a product or use smaller photos, then try again.')
    onSaved(editing ? 'Product updated' : 'Product added')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-label={editing ? 'Edit product' : 'Add product'}
        className="w-full max-w-[640px] bg-white rounded-2xl shadow-2xl p-5 sm:p-6 my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[18px] font-semibold">{editing ? `Edit product #${f.id}` : 'Add product'}</h2>
          <button aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-black/5 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-5">
          <PhotoField
            label="Product image"
            required
            hint="Front view of the garment on a plain background works best. HD photos give the sharpest result."
            value={mainSprite}
            onChange={(s) => setF((x) => ({ ...x, front: s }))}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold tracking-wide text-ink/60 block mb-1.5">
                Product name <span className="text-red-600">*</span>
              </label>
              <input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder="e.g. Boys Denim Jacket"
                className="w-full h-10 rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold tracking-wide text-ink/60 block mb-1.5">
                Price (₦) <span className="text-red-600">*</span>
              </label>
              <input
                value={f.price}
                inputMode="numeric"
                onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d]/g, '') })}
                placeholder="e.g. 45000"
                className="w-full h-10 rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-ink"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold tracking-wide text-ink/60 block mb-1.5">
              Sizes <span className="text-red-600">*</span>
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {[...SIZES, ...f.sizes.filter((s) => !(SIZES as readonly string[]).includes(s))].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSize(s)}
                  className={`min-w-[40px] h-[36px] px-2 rounded-full text-[12px] font-medium border transition ${
                    f.sizes.includes(s) ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-black/15 hover:border-ink/60'
                  }`}
                >
                  {s}
                </button>
              ))}
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomSize()
                  }
                }}
                onBlur={addCustomSize}
                placeholder="+ custom (e.g. 8Y)"
                className="h-[36px] w-[130px] rounded-full border border-black/15 px-3 text-[12px] outline-none focus:border-ink"
              />
            </div>
          </div>

          <details className="rounded-lg border border-black/10 px-3 py-2">
            <summary className="text-[12px] font-medium cursor-pointer">Optional: side-view photo (for the 3D turn)</summary>
            <div className="pt-3 space-y-3">
              <PhotoField
                label="Side photo"
                hint="If you do not add one, the front photo is used while the piece hangs on the rail."
                value={f.side}
                onChange={(s) => setF((x) => ({ ...x, side: s ? { ...s, faces: x.side?.faces ?? 1 } : undefined }))}
              />
              <label className="text-[12px] flex items-center gap-2">
                Garment faces
                <select
                  value={f.side?.faces ?? 1}
                  onChange={(e) =>
                    setF((x) => (x.side ? { ...x, side: { ...x.side, faces: Number(e.target.value) as 1 | -1 } } : x))
                  }
                  className="h-8 rounded border border-black/15 px-2"
                >
                  <option value={1}>right</option>
                  <option value={-1}>left</option>
                </select>
              </label>
            </div>
          </details>

          {err && <p className="text-[13px] text-red-700">{err}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-10 px-4 rounded-full border border-black/15 text-[13px] hover:bg-black/5">
              Cancel
            </button>
            <button onClick={save} className="h-10 px-5 rounded-full bg-ink text-white text-[13px] font-medium hover:opacity-90">
              {editing ? 'Save changes' : 'Add product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const field = 'w-full h-11 rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-ink'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const bad = validatePassword(pw)
    if (bad) return setErr(bad)
    if (pw !== pw2) return setErr('The new passwords do not match.')
    if (pw === cur) return setErr('The new password must be different.')
    setBusy(true)
    const ok = await changePassword(cur, pw)
    setBusy(false)
    if (!ok) return setErr('Current password is wrong.')
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 max-w-[380px] w-full shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-semibold">Change password</h3>
        <input className={field} type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" autoComplete="current-password" autoFocus />
        <input className={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters, with a number)" autoComplete="new-password" />
        <input className={field} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" />
        {err && <p className="text-[13px] text-red-700">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-full border border-black/15 text-[13px] hover:bg-black/5">
            Cancel
          </button>
          <button disabled={busy} className="h-10 px-5 rounded-full bg-ink text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50">
            Update password
          </button>
        </div>
      </form>
    </div>
  )
}

export function Admin({ onLogout }: { onLogout: () => void }) {
  const [pwOpen, setPwOpen] = useState(false)
  const products = useProducts()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [del, setDel] = useState<Product | null>(null)
  const [toast, setToast] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? products.filter((p) => p.name.toLowerCase().includes(s) || String(p.id) === s) : products
  }, [products, q])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ricks-closet-products.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (file: File) => {
    try {
      const list: unknown = JSON.parse(await file.text())
      const ok =
        Array.isArray(list) &&
        list.every((p) => p && typeof p.id === 'number' && typeof p.name === 'string' && typeof p.price === 'number' && p.side?.src)
      if (!ok) return say('That file is not a products export.')
      // merge: same id -> replaced, new id -> added, everything else stays
      const incoming = list as Product[]
      const merged = [...products.map((p) => incoming.find((n) => n.id === p.id) ?? p), ...incoming.filter((p) => !products.some((o) => o.id === p.id))]
      say(importProducts(merged) ? `Imported ${incoming.length} product(s)` : 'Storage is full, import failed.')
    } catch {
      say('Could not read that file.')
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#f4f2ef] text-ink">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/10">
        <div className="max-w-[1040px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-serif italic font-bold text-[20px]">Rick's Closet</span>
            <span className="text-[11px] tracking-[0.2em] text-ink/50">ADMIN</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[13px]">
            <span className="hidden sm:inline text-ink/45">Signed in as {accountName()}</span>
            <a href="#/" className="font-medium underline underline-offset-4">
              View shop
            </a>
            <button onClick={() => setPwOpen(true)} className="h-8 px-3 rounded-full border border-black/15 hover:bg-black/5">
              Change password
            </button>
            <button
              onClick={() => {
                logout()
                onLogout()
              }}
              className="h-8 px-3 rounded-full bg-ink text-white hover:opacity-90"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1040px] mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="mr-auto">
            <h1 className="text-[22px] font-semibold">Products</h1>
            <p className="text-[13px] text-ink/55">{products.length} on the rail</p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or ID"
            className="h-10 w-[200px] rounded-full border border-black/15 bg-white px-4 text-[13px] outline-none focus:border-ink"
          />
          <button
            onClick={() => setForm(emptyForm())}
            className="h-10 px-5 rounded-full bg-ink text-white text-[13px] font-medium hover:opacity-90"
          >
            + Add product
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[56px_88px_1fr_120px_170px_150px] gap-3 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink/45 border-b border-black/10">
            <span>ID</span>
            <span>IMAGE</span>
            <span>NAME</span>
            <span>PRICE</span>
            <span>SIZES</span>
            <span className="text-right">ACTIONS</span>
          </div>
          {shown.length === 0 && (
            <div className="p-10 text-center text-[14px] text-ink/50">
              {products.length === 0 ? 'No products yet. Click “+ Add product” to create the first one.' : 'No product matches your search.'}
            </div>
          )}
          {shown.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[72px_1fr] sm:grid-cols-[56px_88px_1fr_120px_170px_150px] gap-3 px-4 py-3 items-center border-b border-black/5 last:border-b-0"
            >
              <span className="hidden sm:block text-[13px] text-ink/50">#{p.id}</span>
              <div className="w-[64px] h-[80px] sm:w-[72px] sm:h-[88px] rounded-lg overflow-hidden flex items-center justify-center" style={{ background: CHECKER }}>
                <img src={thumbOf(p)} alt={p.name} className="max-w-full max-h-full object-contain" />
              </div>
              <div className="min-w-0 sm:contents">
                <div className="text-[14px] font-medium truncate">
                  <span className="sm:hidden text-ink/40 mr-1">#{p.id}</span>
                  {p.name}
                </div>
                <div className="text-[13px] font-semibold">{formatPrice(p.price)}</div>
                <div className="flex flex-wrap gap-1 mt-1 sm:mt-0">
                  {(p.sizes?.length ? p.sizes : [...SIZES]).map((s) => (
                    <span key={s} className="px-1.5 h-5 leading-5 rounded bg-black/5 text-[10px] font-medium">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-2 sm:mt-0 sm:justify-end">
                  <button onClick={() => setForm(fromProduct(p))} className="h-8 px-3 rounded-full border border-black/15 text-[12px] hover:bg-black/5">
                    Edit
                  </button>
                  <button onClick={() => setDel(p)} className="h-8 px-3 rounded-full border border-red-200 text-red-700 text-[12px] hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-[12px]">
          <button onClick={exportJson} className="h-9 px-4 rounded-full border border-black/15 bg-white hover:bg-black/5">
            Export JSON
          </button>
          <button onClick={() => fileInput.current?.click()} className="h-9 px-4 rounded-full border border-black/15 bg-white hover:bg-black/5">
            Import JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJson(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => {
              if (confirm('Reset to the original 12 products? Everything you added or changed will be lost.')) {
                resetProducts()
                say('Reset to the original products')
              }
            }}
            className="h-9 px-4 rounded-full border border-black/15 bg-white hover:bg-black/5 text-ink/70"
          >
            Reset to original products
          </button>
          <p className="basis-full text-ink/45 mt-2 leading-snug">
            Products are saved in this browser only (no server yet), so they will not show on other devices. Use Export JSON to keep a backup.
          </p>
        </div>
      </main>

      {form && (
        <ProductForm
          initial={form}
          onClose={() => setForm(null)}
          onSaved={(m) => {
            setForm(null)
            say(m)
          }}
        />
      )}

      {del && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" onClick={() => setDel(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-[380px] w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[17px] font-semibold">Delete “{del.name}”?</h3>
            <p className="text-[13px] text-ink/60 mt-1.5">It will disappear from the shop. This cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDel(null)} className="h-9 px-4 rounded-full border border-black/15 text-[13px] hover:bg-black/5">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteProduct(del.id)
                  setDel(null)
                  say('Product deleted')
                }}
                className="h-9 px-4 rounded-full bg-red-700 text-white text-[13px] font-medium hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pwOpen && (
        <PasswordDialog
          onClose={() => setPwOpen(false)}
          onDone={() => {
            setPwOpen(false)
            say('Password updated')
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white text-[13px] px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
