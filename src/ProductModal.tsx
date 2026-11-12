import { useState } from 'react'
import { motion } from 'framer-motion'
import { SIZES, formatPrice } from './data'
import type { Product, Size, Sprite } from './data'

interface View {
  sprite: Sprite
  flip: boolean
}

const viewsFor = (p: Product): View[] => [
  ...(p.front ? [{ sprite: p.front, flip: false }] : []),
  { sprite: p.side, flip: false },
  { sprite: p.side, flip: true },
]

interface Props {
  product: Product
  disabled: boolean
  onClose: () => void
  onAdd: (size: Size) => void
}

export function ProductModal({ product, disabled, onClose, onAdd }: Props) {
  const [size, setSize] = useState<Size | null>(null)
  const [view, setView] = useState(0)
  const views = viewsFor(product)
  const main = views[view]
  const mainH = Math.min(main.sprite.h * 1.15, 330)

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={product.name}
        initial={{ y: 40, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[624px] max-h-[96vh] overflow-y-auto bg-white rounded-2xl shadow-2xl flex flex-col sm:flex-row sm:h-[471px]"
      >
        {/* photo */}
        <div className="sm:w-[334px] shrink-0 bg-paper flex flex-col items-center justify-between pt-3 pb-4 min-h-[380px]">
          <img
            src={main.sprite.src}
            alt={product.name}
            draggable={false}
            style={{ height: mainH, transform: main.flip ? 'scaleX(-1)' : undefined }}
            className="select-none"
          />
          <div className="flex gap-3">
            {views.map((v, i) => (
              <button
                key={i}
                aria-label={`View ${i + 1}`}
                onClick={() => setView(i)}
                className={`w-12 h-[58px] rounded-lg bg-paper flex items-center justify-center overflow-hidden border ${
                  i === view ? 'border-ink border-[1.5px]' : 'border-black/10'
                }`}
              >
                <img
                  src={v.sprite.src}
                  alt=""
                  draggable={false}
                  className="max-h-[50px] max-w-[40px] object-contain"
                  style={{ transform: v.flip ? 'scaleX(-1)' : undefined }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* details */}
        <div className="flex-1 p-6 pt-7 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[19px] font-semibold text-ink leading-tight">{product.name}</h2>
              <p className="text-sm font-semibold mt-1 text-ink/90">{formatPrice(product.price)}</p>
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="w-6 h-6 -mt-2 -mr-2 flex items-center justify-center text-ink/70 hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-ink/45">SIZE</span>
              <button className="text-[10px] font-semibold underline text-ink/80">Size guide</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(product.sizes?.length ? product.sizes : SIZES).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`w-[38px] h-[38px] rounded-full text-[11px] font-medium border transition ${
                    size === s
                      ? 'bg-ink text-white border-ink'
                      : 'bg-white text-ink border-black/15 hover:border-ink/60'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-8">
            <button
              disabled={!size || disabled}
              onClick={() => size && onAdd(size)}
              className={`w-full h-[34px] rounded-full text-[11px] font-semibold text-white transition ${
                size ? 'bg-ink hover:bg-ink/90' : 'bg-[#b9b9b9] cursor-not-allowed'
              }`}
            >
              Add to bag
            </button>
            <p className="text-[10px] text-ink/50 text-center mt-2 h-3">{size ? '' : 'Choose a size'}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
