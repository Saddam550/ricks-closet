import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion'
import type { AnimationPlaybackControls } from 'framer-motion'
import { formatPrice, mod } from './data'
import { useProducts } from './products'
import type { Product, Size } from './data'
import { Rail, SLOT, STAGE_H, STAGE_W } from './Rail'
import { ProductModal } from './ProductModal'
import { BagDrawer } from './BagDrawer'
import type { BagItem } from './BagDrawer'

const SPRING = { type: 'spring', stiffness: 170, damping: 24 } as const

const fitScale = () =>
  Math.min(1.35, Math.max(0.55, Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)))

function App() {
  const products = useProducts()
  const N = products.length
  const [index, setIndex] = useState(0) // unbounded: the rail loops
  const [selected, setSelected] = useState<Product | null>(null)
  const [bag, setBag] = useState<BagItem[]>([])
  const [showBag, setShowBag] = useState(false)
  const [fly, setFly] = useState<{ tx: number; ty: number } | null>(null)
  const [scale, setScale] = useState(fitScale)
  const [dragging, setDragging] = useState(false)

  const pos = useMotionValue(0)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const drag = useRef({ down: false, moved: false, startX: 0, startPos: 0, lastX: 0, lastT: 0, v: 0 })
  const wheel = useRef({ acc: 0, t: 0 })

  const current = products[mod(index, N)]
  const overlayOpen = selected !== null || showBag

  useEffect(() => {
    const onResize = () => setScale(fitScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const snapTo = (i: number) => {
    setIndex(i)
    anim.current?.stop()
    anim.current = animate(pos, i, SPRING)
  }

  const open = (p: Product) => setSelected(p)

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setShowBag(false)
        return
      }
      if (overlayOpen) return
      if (e.key === 'ArrowRight') snapTo(index + 1)
      else if (e.key === 'ArrowLeft') snapTo(index - 1)
      else if (e.key === 'Enter') open(current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // drag / swipe the rail
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (overlayOpen) return
    anim.current?.stop()
    drag.current = { down: true, moved: false, startX: e.clientX, startPos: pos.get(), lastX: e.clientX, lastT: e.timeStamp, v: 0 }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.down) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (!d.moved) return
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.v = (e.clientX - d.lastX) / dt
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    pos.set(d.startPos - dx / (SLOT * scale))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.down) return
    d.down = false
    setDragging(false)
    if (d.moved) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      snapTo(Math.round(pos.get() - (d.v * 160) / (SLOT * scale)))
      // swallow the click that follows a drag
      setTimeout(() => {
        drag.current.moved = false
      }, 0)
    } else {
      snapTo(index) // re-settle if a press interrupted the animation
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (overlayOpen) return
    const w = wheel.current
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (e.timeStamp - w.t > 200) w.acc = 0
    w.t = e.timeStamp
    w.acc += delta
    if (Math.abs(w.acc) > 60) {
      snapTo(index + Math.sign(w.acc))
      w.acc = 0
    }
  }

  const onPick = (target: number, isCentre: boolean) => {
    if (drag.current.moved) return
    if (isCentre) open(products[mod(target, N)])
    else snapTo(target)
  }

  // bag
  const addToBag = (size: Size) => {
    if (!selected) return
    const product = selected
    setBag((prev) => {
      if (prev.some((i) => i.product.id === product.id && i.size === size)) {
        return prev.map((i) => (i.product.id === product.id && i.size === size ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { product, size, qty: 1 }]
    })
    setFly({ tx: window.innerWidth / 2 - 28, ty: -window.innerHeight / 2 + 28 })
    setTimeout(() => setSelected(null), 650)
  }
  const changeQty = (id: number, size: Size, delta: number) =>
    setBag((prev) =>
      prev
        .map((i) => (i.product.id === id && i.size === size ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    )
  const removeItem = (id: number, size: Size) =>
    setBag((prev) => prev.filter((i) => !(i.product.id === id && i.size === size)))
  const bagCount = bag.reduce((s, i) => s + i.qty, 0)

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none text-ink font-sans"
      style={{
        touchAction: 'none',
        cursor: dragging ? 'grabbing' : undefined,
        background: 'radial-gradient(120% 95% at 50% 28%, #f3efea 0%, #e8e3de 52%, #d8d2ca 100%)',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* the rail, laid out on a fixed 1298x720 canvas and scaled to fit */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <Rail pos={pos} onPick={onPick} current={current} showGrab={!overlayOpen && !dragging} stageScale={scale} />
      </div>

      {/* camera vignette + film grain: lifts the flat photos into one lit room */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 58%, rgba(60,44,28,0.2) 100%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* hanging sign */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center">
        <div className="relative w-[148px] sm:w-[172px] h-8">
          <span className="absolute left-[8px] bottom-0 h-9 w-px bg-[#5b5147] origin-bottom rotate-[-4deg]" />
          <span className="absolute right-[8px] bottom-0 h-9 w-px bg-[#5b5147] origin-bottom rotate-[4deg]" />
        </div>
        <div className="w-[148px] sm:w-[172px] py-[7px] text-center rounded-md shadow-[0_3px_8px_rgba(0,0,0,0.18)] bg-gradient-to-b from-[#dcc194] to-[#c6a56a]">
          <div className="text-[8px] font-bold tracking-[0.3em] text-ink/80 leading-none">RICK'S</div>
          <div className="font-serif italic font-bold text-[22px] leading-[1.05] text-ink">Closet</div>
          <div className="text-[4px] tracking-[0.3em] text-ink/60 leading-none">EST. 2024</div>
        </div>
      </div>

      {/* top buttons */}
      <button
        aria-label="Back to start"
        onClick={() => snapTo(Math.round(index / N) * N)}
        className="absolute z-20 top-2 left-3 w-8 h-8 rounded-full border border-black/15 flex items-center justify-center hover:bg-black/5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
        </svg>
      </button>
      <button
        aria-label="Open bag"
        onClick={() => setShowBag(true)}
        className="absolute z-20 top-2 right-3 w-8 h-8 rounded-full border border-black/15 flex items-center justify-center hover:bg-black/5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14l1 13H4L5 8zM9 8V6a3 3 0 016 0v2" />
        </svg>
        {bagCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-ink text-white text-[8px] font-semibold flex items-center justify-center">
            {bagCount}
          </span>
        )}
      </button>

      {/* bottom: name / price / controls */}
      {!selected && (
        <div className="absolute z-20 bottom-6 left-0 right-0 flex flex-col items-center pointer-events-none">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="text-sm font-semibold leading-tight">{current.name}</div>
            <div className="text-[13px] font-semibold text-ink/70 mt-1 tracking-wide">{formatPrice(current.price)}</div>
          </motion.div>
          <div className="relative mt-2 pointer-events-auto">
            <button
              aria-label="Previous piece"
              onClick={() => snapTo(index - 1)}
              className="absolute -left-[112px] -top-[23px] w-8 h-8 rounded-full border border-black/15 flex items-center justify-center text-ink/70 hover:bg-black/5"
            >
              ←
            </button>
            <button
              onClick={() => open(current)}
              className="h-[30px] px-6 rounded-full bg-ink text-white text-[11px] font-semibold hover:bg-ink/90"
            >
              View
            </button>
            <button
              aria-label="Next piece"
              onClick={() => snapTo(index + 1)}
              className="absolute -right-[112px] -top-[23px] w-8 h-8 rounded-full border border-black/15 flex items-center justify-center text-ink/70 hover:bg-black/5"
            >
              →
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <ProductModal
            key={selected.id}
            product={selected}
            disabled={fly !== null}
            onClose={() => setSelected(null)}
            onAdd={addToBag}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBag && (
          <BagDrawer
            items={bag}
            onClose={() => setShowBag(false)}
            onQty={changeQty}
            onRemove={removeItem}
            onClear={() => setBag([])}
          />
        )}
      </AnimatePresence>

      {/* paper bag: pops up, then flies to the bag button */}
      {fly && (
        <motion.div
          className="fixed z-[60] left-1/2 top-1/2 -ml-14 -mt-[70px] pointer-events-none"
          initial={{ opacity: 0, scale: 0.6, x: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1, 1, 0.2],
            x: [0, 0, 0, fly.tx],
            y: [0, 0, 0, fly.ty],
          }}
          transition={{ duration: 1.3, times: [0, 0.25, 0.6, 1], ease: 'easeInOut' }}
          onAnimationComplete={() => setFly(null)}
        >
          <div className="relative w-28 h-[140px] rounded-sm bg-gradient-to-b from-[#d3ae82] to-[#bd9262] shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-12 h-8 rounded-t-full border-[3px] border-b-0 border-[#a37b4f]" />
            <div className="absolute inset-x-0 bottom-9 text-center leading-none">
              <div className="text-[6px] font-bold tracking-[0.25em] text-[#4a3520]">RICK'S</div>
              <div className="font-serif italic font-bold text-[16px] text-[#3b2a18]">Closet</div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default App
