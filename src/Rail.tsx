import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue, useSpring, useTime, useTransform, useVelocity } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { mod } from './data'
import { useProducts } from './products'
import type { Product, Sprite } from './data'
import { ClothGrab } from './cloth'
import type { Pose } from './cloth'

/** The scene is laid out on a 1298x720 "design" canvas (the size of the reference video) and scaled to fit. */
export const STAGE_W = 1298
export const STAGE_H = 720
export const SLOT = 125 // distance between two side-on hangers
const RAIL_Y = 146
const HANG_Y = 156 // sprites start right under the rail
const FLOOR_Y = 586
/** side-only pieces (no front photo available) are enlarged a little when centred, but never so far that they cover the name below */
const sideOnlyZoom = (h: number) => Math.max(0, Math.min(0.22, (560 - HANG_Y) / h - 1))

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a))
  return x * x * (3 - 2 * x)
}
/** signed distance (in items) wrapped to [-n/2, n/2) */
const wrap = (v: number, n: number) => mod(v + n / 2, n) - n / 2
/** horizontal position of a hanger `d` items away from the centre. The centred piece is wide, so it gets two slots. */
const slotX = (d: number) => {
  const a = Math.abs(d)
  return Math.sign(d) * (a < 1 ? 2 * SLOT * a : SLOT * a + SLOT)
}

// soft shadow the garment throws on the wall behind it
const WALL_SHADOW = 'drop-shadow(10px 16px 13px rgba(58,44,30,0.2))'

export interface GrabInfo {
  img: HTMLImageElement
  sprite: Sprite
  scale: number
  flip: 1 | -1
  key: string
  getPose: () => Pose
  cuts?: number[]
  cutFrom?: number
}

interface RailItemProps {
  product: Product
  index: number
  /** number of products on the rail */
  n: number
  copy: number
  pos: MotionValue<number>
  swing: MotionValue<number>
  time: MotionValue<number>
  hide: MotionValue<number>
  /** 1 = hide the native cursor over the centred piece (the hand icon replaces it) */
  centreCursor: MotionValue<number>
  onPick: (target: number, isCentre: boolean) => void
  onHover: (centred: boolean, pointerType?: string, x?: number, y?: number) => void
  onGrab: (e: ReactPointerEvent<HTMLImageElement>, info: GrabInfo) => boolean
}

function RailItem({ product, index, n, copy, pos, swing, time, hide, centreCursor, onPick, onHover, onGrab }: RailItemProps) {
  const { front, side } = product
  const native = side.faces // 1: the side photo faces right, -1: faces left

  const d = useTransform(pos, (p) => wrap(index - p, n) + copy * n)
  const a = useTransform(d, (v) => Math.abs(v))
  const t = useTransform(a, (v) => clamp01(v * 2.2)) // 0 = centred / front on, 1 = hanging side on
  const display = useTransform(a, (v): string => (v > 7.5 ? 'none' : 'block'))
  const x = useTransform(d, slotX)
  // hangers swing from the hook: inertia while the rail moves + a very slight idle sway
  const sway = useTransform([swing, time], ([s, tm]: number[]) => s + Math.sin(tm / 1100 + index * 1.9) * 0.6)
  const cursor = useTransform([a, centreCursor], ([av, cc]: number[]): string => (av < 0.5 ? (cc ? 'none' : 'grab') : 'pointer'))

  // front photo turns away from the centre (a real 3D rotation about the hook) ...
  // (opacity = what is drawn; *Vis = what the rail wants to show. While the cloth canvas stands in for the centred photo, hide = 0)
  const frontVis = useTransform(t, (v) => 1 - smooth(0.35, 0.7, v))
  const frontOpacity = useTransform([frontVis, a, hide], ([f, av, h]: number[]) => f * (av < 0.5 ? h : 1))
  const frontRot = useTransform([t, d], ([tv, dv]: number[]) => -Math.sign(dv) * tv * 90)
  // ... and the side photo turns in to take its place. Side photos always face the centre.
  const sideVis = useTransform(t, (v) => (front ? smooth(0.3, 0.65, v) : 1))
  const sideOpacity = useTransform([sideVis, a, hide], ([f, av, h]: number[]) => f * (av < 0.5 ? h : 1))
  // side-only pieces have no front photo to turn to, so when centred they slowly swing like a showcase turntable
  const sideRot = useTransform([t, d, time], ([tv, dv, tm]: number[]) =>
    front ? Math.sign(dv) * (1 - tv) * 90 : (1 - tv) * 16 * Math.sin(tm / 900 + index),
  )
  const sideFlip = useTransform(d, (dv): number => {
    if (front) {
      const want = dv === 0 ? native : -Math.sign(dv)
      return want === native ? 1 : -1
    }
    // no front photo: keep the native direction when centred, and swing round to face the centre as it moves away
    const w = clamp01((Math.abs(dv) - 0.15) / 0.35)
    return 1 - w + -Math.sign(dv) * native * w
  })
  const zoom = sideOnlyZoom(side.h)
  const sideScale = useTransform(t, (v) => (front ? 1 : 1 + zoom * (1 - v)))
  const frontEvents = useTransform(frontVis, (v): string => (v > 0.5 ? 'auto' : 'none'))
  const sideEvents = useTransform(sideVis, (v): string => (v > 0.5 ? 'auto' : 'none'))

  const pick = () => {
    const dd = d.get()
    onPick(Math.round(pos.get() + dd), Math.abs(dd) < 0.5)
  }
  const enter = (e: ReactPointerEvent<HTMLImageElement>) =>
    onHover(Math.abs(d.get()) < 0.5, e.pointerType, e.clientX, e.clientY)
  const leave = () => onHover(false)

  // press on the centred piece = grab it (cloth effect) instead of dragging the rail
  const down = (e: ReactPointerEvent<HTMLImageElement>, which: 'front' | 'side') => {
    if (e.button !== 0 || Math.abs(d.get()) >= 0.5) return
    const sprite = which === 'front' && front ? front : side
    const rot = which === 'front' ? frontRot : sideRot
    const info: GrabInfo = {
      img: e.currentTarget,
      sprite,
      key: `${product.id}-${which}`,
      scale: which === 'front' ? 1 : sideScale.get(),
      flip: which === 'front' ? 1 : sideFlip.get() < 0 ? -1 : 1,
      getPose: () => ({ x: slotX(d.get()), rotY: rot.get(), rotZ: sway.get() }),
      cuts: which === 'front' ? product.tear?.cuts : undefined,
      cutFrom: which === 'front' ? product.tear?.from : undefined,
    }
    if (onGrab(e, info)) e.stopPropagation()
  }

  return (
    <motion.div
      className="absolute"
      style={{ left: STAGE_W / 2, top: HANG_Y, width: 0, height: 0, x, rotateZ: sway, display, transformOrigin: '0 0' }}
    >
      {front && (
        <motion.img
          src={front.src}
          alt={product.name}
          draggable={false}
          width={front.w}
          height={front.h}
          onClick={pick}
          onPointerDown={(e) => down(e, 'front')}
          onPointerEnter={enter}
          onPointerLeave={leave}
          className="absolute select-none max-w-none"
          style={{
            left: -front.hookX,
            top: 0,
            transformOrigin: `${front.hookX}px 0px`,
            transformPerspective: 1000,
            rotateY: frontRot,
            opacity: frontOpacity,
            pointerEvents: frontEvents,
            cursor,
            filter: WALL_SHADOW,
          }}
        />
      )}
      <motion.img
        src={side.src}
        alt={product.name}
        draggable={false}
        width={side.w}
        height={side.h}
        onClick={pick}
        onPointerDown={(e) => down(e, 'side')}
        onPointerEnter={enter}
        onPointerLeave={leave}
        className="absolute select-none max-w-none"
        style={{
          left: -side.hookX,
          top: 0,
          transformOrigin: `${side.hookX}px 0px`,
          transformPerspective: 1000,
          rotateY: sideRot,
          scaleX: sideFlip,
          scale: sideScale,
          opacity: sideOpacity,
          pointerEvents: sideEvents,
          cursor,
          filter: WALL_SHADOW,
        }}
      />
    </motion.div>
  )
}

/** soft diagonal light streaks on the floor, as in the reference */
const STREAKS = [
  { x: 120, w: 300, rot: -24, o: 0.26 },
  { x: 260, w: 280, rot: -24, o: 0.3 },
  { x: 400, w: 260, rot: -24, o: 0.24 },
  { x: 1178, w: 300, rot: 24, o: 0.26 },
  { x: 1038, w: 280, rot: 24, o: 0.3 },
  { x: 898, w: 260, rot: 24, o: 0.24 },
]

const HandIcon = ({ closed }: { closed: boolean }) => (
  <svg viewBox="0 0 26 26" width="26" height="26" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
    <g fill="#fff" stroke="#1c1917" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
      {closed ? (
        <>
          <rect x="6" y="9" width="3.6" height="7" rx="1.8" />
          <rect x="9.3" y="7.6" width="3.6" height="8.4" rx="1.8" />
          <rect x="12.6" y="7.8" width="3.6" height="8.2" rx="1.8" />
          <rect x="15.9" y="9.4" width="3.4" height="6.6" rx="1.7" />
          <path d="M6 14.5 C5 18 8 21.5 12 21.5 C16.5 21.5 19.3 19 19.3 15 L19.3 14 L6 14 Z" />
        </>
      ) : (
        <>
          <rect x="7.2" y="4.5" width="3.2" height="11" rx="1.6" />
          <rect x="10.4" y="3" width="3.2" height="12.5" rx="1.6" />
          <rect x="13.6" y="3.6" width="3.2" height="11.9" rx="1.6" />
          <rect x="16.8" y="6.2" width="3" height="9.3" rx="1.5" />
          <path d="M7.2 13 L5.4 10.8 C4.6 9.8 3 10.6 3.5 11.9 L7 19 C8.3 21.3 10.2 22.4 12.8 22.4 L14.2 22.4 C17.6 22.4 19.8 20.2 19.8 17 L19.8 13 Z" />
        </>
      )}
    </g>
  </svg>
)

/** hand cursor + a "GRAB" pill that trails behind the mouse (rendered in <body>, above the scaled stage) */
function GrabPill({
  visible,
  grabbing,
  pointer,
}: {
  visible: boolean
  grabbing: boolean
  pointer: RefObject<{ x: number; y: number }>
}) {
  const hand = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    let raf = 0
    let px = pointer.current.x + 34
    let py = pointer.current.y + 20
    const tick = () => {
      const { x, y } = pointer.current
      if (hand.current) hand.current.style.transform = `translate3d(${x - 13}px, ${y - 13}px, 0)`
      px += (x + 34 - px) * 0.16
      py += (y + 20 - py) * 0.16
      if (pill.current) pill.current.style.transform = `translate3d(${px}px, ${py}px, 0)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible, pointer])

  return createPortal(
    <>
      <div
        ref={hand}
        className="fixed left-0 top-0 z-[70] pointer-events-none transition-opacity duration-150"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <HandIcon closed={grabbing} />
      </div>
      <div
        ref={pill}
        className="fixed left-0 top-0 z-[70] pointer-events-none transition-opacity duration-150"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="rounded-full bg-[#1c1917]/90 text-white text-[8px] font-semibold tracking-[0.2em] px-2.5 py-[3px] shadow-md">
          GRAB
        </div>
      </div>
    </>,
    document.body,
  )
}

interface RailProps {
  pos: MotionValue<number>
  onPick: (target: number, isCentre: boolean) => void
  /** the piece currently in the centre */
  current: Product
  /** false while another interaction (rail drag, modal) owns the pointer */
  showGrab: boolean
  /** stage scale, used to pick the cloth canvas resolution */
  stageScale: number
}

export function Rail({ pos, onPick, showGrab, stageScale }: RailProps) {
  const products = useProducts()
  const [hoverCentre, setHoverCentre] = useState(false)
  const [mouseHover, setMouseHover] = useState(true)
  const [grabbing, setGrabbing] = useState(false)
  const hide = useMotionValue(1)
  const centreCursor = useMotionValue(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cloth = useRef<ClothGrab | null>(null)
  const raf = useRef(0)
  const grabState = useRef({ moved: false, sx: 0, sy: 0 })
  const pointer = useRef({ x: 0, y: 0 })
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      cleanup.current?.()
      document.documentElement.style.cursor = ''
    },
    [],
  )

  const finish = () => {
    cloth.current?.stop()
    hide.set(1)
    if (canvasRef.current) canvasRef.current.style.display = 'none'
    raf.current = 0
  }

  const loop = () => {
    let last = performance.now()
    const tick = (now: number) => {
      const c = cloth.current
      if (!c || !c.active) {
        raf.current = 0
        return
      }
      c.step((now - last) / 1000)
      last = now
      c.render()
      if (c.settled) {
        finish()
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const startGrab = (e: ReactPointerEvent<HTMLImageElement>, info: GrabInfo): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false
    if (!cloth.current) cloth.current = new ClothGrab(canvas)
    const c = cloth.current
    if (!c.ok) return false // no WebGL2: fall back to plain rail dragging

    if (!(c.active && c.itemKey === info.key)) {
      c.setup(
        {
          image: info.img,
          w: info.sprite.w,
          h: info.sprite.h,
          hookX: info.sprite.hookX,
          scale: info.scale,
          flip: info.flip,
          pixelRatio: Math.min(3, stageScale * (window.devicePixelRatio || 1)),
          getPose: info.getPose,
          cuts: info.cuts,
          cutFrom: info.cutFrom,
        },
        info.key,
      )
    }
    const pl = c.placement(STAGE_W, HANG_Y)
    canvas.style.left = `${pl.left}px`
    canvas.style.top = `${pl.top}px`
    canvas.style.display = 'block'
    c.render()
    c.begin(e.clientX, e.clientY)
    hide.set(0)

    grabState.current = { moved: false, sx: e.clientX, sy: e.clientY }
    pointer.current = { x: e.clientX, y: e.clientY }
    setMouseHover(e.pointerType === 'mouse')
    setGrabbing(true)
    document.documentElement.style.cursor = 'none'

    cleanup.current?.()
    const onMove = (ev: PointerEvent) => {
      c.move(ev.clientX, ev.clientY)
      if (Math.hypot(ev.clientX - grabState.current.sx, ev.clientY - grabState.current.sy) > 6) {
        grabState.current.moved = true
      }
    }
    const onUp = () => {
      cleanup.current?.()
      c.release()
      setGrabbing(false)
      document.documentElement.style.cursor = ''
      // the click that follows a drag must not open the product
      setTimeout(() => {
        grabState.current.moved = false
      }, 0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    cleanup.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      cleanup.current = null
    }
    if (!raf.current) loop()
    return true
  }

  const guardedPick = (target: number, isCentre: boolean) => {
    if (grabState.current.moved) return
    onPick(target, isCentre)
  }

  const onHover = (centred: boolean, pointerType?: string, x?: number, y?: number) => {
    setHoverCentre(centred)
    if (centred) {
      setMouseHover(pointerType === undefined || pointerType === 'mouse')
      if (x !== undefined && y !== undefined) pointer.current = { x, y }
    }
  }

  const pillVisible = (hoverCentre || grabbing) && showGrab && mouseHover
  useEffect(() => {
    centreCursor.set(pillVisible && !grabbing ? 1 : 0)
  }, [pillVisible, grabbing, centreCursor])

  const swing = useSpring(
    useTransform(useVelocity(pos), (v) => Math.max(-9, Math.min(9, -v * 2.2))),
    { stiffness: 70, damping: 6 },
  )
  const time = useTime()

  return (
    <>
      {/* spotlight on the wall behind the centred piece */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: STAGE_W / 2 - 420,
          top: 20,
          width: 840,
          height: 640,
          background: 'radial-gradient(closest-side, rgba(255,251,244,0.75), rgba(255,251,244,0))',
        }}
      />

      {/* floor + skirting */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: -4000,
          width: STAGE_W + 8000,
          top: FLOOR_Y,
          height: 2400,
          background: 'linear-gradient(#d8d1c8 0, #d0c8be 35%, #c5bdb2 100%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          left: -4000,
          width: STAGE_W + 8000,
          top: FLOOR_Y - 12,
          height: 12,
          background: 'linear-gradient(#ebe7e1, #d9d3ca)',
          borderBottom: '1px solid rgba(60,45,30,0.12)',
        }}
      />
      {/* polished floor catching the spotlight */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: STAGE_W / 2 - 520,
          top: FLOOR_Y + 6,
          width: 1040,
          height: 150,
          background: 'radial-gradient(closest-side, rgba(255,252,246,0.55), rgba(255,252,246,0))',
        }}
      />
      {STREAKS.map((s) => (
        <div
          key={s.x}
          className="absolute pointer-events-none"
          style={{
            left: s.x - s.w / 2,
            top: 622 - 15,
            width: s.w,
            height: 30,
            transform: `rotate(${s.rot}deg)`,
            background: `radial-gradient(closest-side, rgba(40,36,32,${s.o}), rgba(40,36,32,0))`,
            filter: 'blur(5px)',
          }}
        />
      ))}
      <div
        className="absolute pointer-events-none"
        style={{
          left: STAGE_W / 2 - 170,
          top: 612,
          width: 340,
          height: 26,
          background: 'radial-gradient(closest-side, rgba(40,36,32,0.34), rgba(40,36,32,0))',
          filter: 'blur(4px)',
        }}
      />

      {/* metal rail + the soft shadow it throws on the wall */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: -4000,
          width: STAGE_W + 8000,
          top: RAIL_Y + 8,
          height: 14,
          background: 'linear-gradient(rgba(58,44,30,0.16), rgba(58,44,30,0))',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          left: -4000,
          width: STAGE_W + 8000,
          top: RAIL_Y,
          height: 8,
          background: 'linear-gradient(#dcdcdc 0 25%, #8c8c8c 25% 50%, #f6f6f6 50% 70%, #7d7d7d 70% 100%)',
        }}
      />

      {[-1, 0, 1].flatMap((copy) =>
        products.map((p, i) => (
          <RailItem
            key={`${copy}-${p.id}`}
            product={p}
            index={i}
            n={products.length}
            copy={copy}
            pos={pos}
            swing={swing}
            time={time}
            hide={hide}
            centreCursor={centreCursor}
            onPick={guardedPick}
            onHover={onHover}
            onGrab={startGrab}
          />
        )),
      )}

      {/* the garment while it is being grabbed: same photo on a simulated cloth mesh */}
      <canvas
        ref={canvasRef}
        className="absolute pointer-events-none"
        style={{ display: 'none', filter: WALL_SHADOW }}
      />
      <GrabPill visible={pillVisible} grabbing={grabbing} pointer={pointer} />

    </>
  )
}
