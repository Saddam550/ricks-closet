import { motion } from 'framer-motion'
import { formatPrice } from './data'
import type { Product, Size } from './data'

export interface BagItem {
  product: Product
  size: Size
  qty: number
}

interface Props {
  items: BagItem[]
  onClose: () => void
  onQty: (id: number, size: Size, delta: number) => void
  onRemove: (id: number, size: Size) => void
  onClear: () => void
}

export function BagDrawer({ items, onClose, onQty, onRemove, onClear }: Props) {
  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0)

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        aria-label="Bag"
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[311px] bg-white shadow-2xl flex flex-col"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        <div className="flex items-center justify-between h-12 px-4 bg-gradient-to-b from-[#d9bd8e] to-[#c9a96e]">
          <div className="flex items-center gap-3">
            <div className="leading-none">
              <div className="text-[6px] font-bold tracking-[0.2em] text-ink/80">RICK'S</div>
              <div className="font-serif italic font-bold text-[15px] text-ink">Closet</div>
            </div>
            <span className="text-[10px] font-semibold tracking-[0.18em] text-ink/70">BAG</span>
          </div>
          <button aria-label="Close bag" onClick={onClose} className="w-7 h-7 text-ink/80 hover:text-ink">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {items.length === 0 ? (
            <p className="text-center text-sm text-ink/40 pt-24">Your bag is empty</p>
          ) : (
            items.map(({ product, size, qty }) => {
              const img = product.front ?? product.side
              return (
                <div key={`${product.id}-${size}`} className="flex gap-3">
                  <div className="w-[62px] h-[78px] rounded-lg bg-paper shrink-0 flex items-center justify-center overflow-hidden">
                    <img src={img.src} alt="" className="max-w-[54px] max-h-[70px] object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate">{product.name}</div>
                        <div className="text-[11px] text-ink/50 mt-0.5">Size {size}</div>
                      </div>
                      <div className="text-[12px] font-semibold whitespace-nowrap">
                        {formatPrice(product.price * qty)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <button
                          aria-label="Decrease quantity"
                          onClick={() => onQty(product.id, size, -1)}
                          className="w-5 h-5 rounded-full border border-black/15 text-xs leading-none"
                        >
                          −
                        </button>
                        <span className="text-xs w-3 text-center">{qty}</span>
                        <button
                          aria-label="Increase quantity"
                          onClick={() => onQty(product.id, size, 1)}
                          className="w-5 h-5 rounded-full border border-black/15 text-xs leading-none"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => onRemove(product.id, size)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-black/10 text-ink/70 hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-black/8 px-4 py-4">
            <div className="flex justify-end mb-2">
              <button onClick={onClear} className="text-[10px] text-ink/50 hover:text-ink px-2 py-0.5 rounded-full border border-black/10">
                Clear bag
              </button>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-ink/60">Subtotal</span>
              <span className="text-sm font-bold">{formatPrice(subtotal)}</span>
            </div>
            <button className="w-full h-10 rounded-full bg-ink text-white text-xs font-semibold">Checkout</button>
          </div>
        )}
      </motion.aside>
    </>
  )
}
