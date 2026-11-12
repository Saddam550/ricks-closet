export interface Sprite {
  src: string
  /** natural width/height in CSS px at 1x (the PNG itself is stored at 2x) */
  w: number
  h: number
  /** x of the hanger hook inside the sprite, in CSS px */
  hookX: number
}

export interface SideSprite extends Sprite {
  /** direction the garment faces in the photo: 1 = to the right, -1 = to the left */
  faces: 1 | -1
}

export interface Product {
  id: number
  name: string
  price: number
  /** sizes offered (defaults to all of SIZES) */
  sizes?: string[]
  /** front photo, shown when the piece is centred and in the product modal */
  front?: Sprite
  /** where the fabric can swing free when grabbed (sleeves / legs): columns 0..1 across the photo, starting at `from` 0..1 down it */
  tear?: { cuts: number[]; from: number }
  /** side-on photo, shown while the piece hangs on the rail */
  side: SideSprite
}

const sprite = (slug: string, w: number, h: number, hookX: number): Sprite => ({
  src: `/products/${slug}-front.webp`,
  w,
  h,
  hookX,
})

const sideSprite = (slug: string, w: number, h: number, hookX: number, faces: 1 | -1): SideSprite => ({
  src: `/products/${slug}-side.webp`,
  w,
  h,
  hookX,
  faces,
})

// Order = order on the rail (it loops). Names/prices were read from the reference video.
// Pieces marked GUESSED never appear centred in the video, so their names/prices are placeholders - edit freely.
// Pieces without a `front` photo are shown side-on; add public/products/<slug>-front.webp and a `front: sprite(...)`
// line (see README) and they get the full 3D turn automatically.
export const PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Faces Shirt',
    price: 111000,
    tear: { cuts: [0.2, 0.8], from: 0.22 },
    front: sprite('faces', 284, 340, 148.0),
    side: sideSprite('faces', 84, 334, 34.5, 1),
  },
  {
    id: 2,
    name: 'Pinstripe Trousers',
    price: 96000,
    tear: { cuts: [0.5], from: 0.5 },
    front: sprite('pinstripe', 172, 390, 81.0),
    side: sideSprite('pinstripe', 84, 406, 31.5, -1),
  },
  {
    id: 3,
    name: 'Giraffe Shirt',
    price: 108000,
    tear: { cuts: [0.2, 0.8], from: 0.25 },
    front: sprite('giraffe', 248, 371, 106.0),
    side: sideSprite('giraffe', 107, 369, 53.0, -1),
  },
  {
    id: 4,
    name: 'Utility Camp Shirt',
    price: 126000,
    front: sprite('camp', 282, 323, 141.0),
    side: sideSprite('camp', 105, 323, 31.5, -1),
  },
  {
    id: 5,
    name: 'Game F. Jersey',
    price: 82500,
    front: sprite('jersey', 271, 311, 128.0),
    side: sideSprite('jersey', 67, 307, 34.0, -1),
  },
  {
    id: 6,
    name: 'Stone Sweatpants',
    price: 78000,
    tear: { cuts: [0.5], from: 0.45 },
    front: sprite('stone', 198, 388, 77.0),
    side: sideSprite('stone', 111, 405, 52.5, -1),
  },
  {
    id: 7,
    name: 'Focus Polo',
    price: 87000,
    front: sprite('focus', 265, 308, 125.5),
    side: sideSprite('focus', 101, 304, 52.0, -1),
  },
  {
    id: 8,
    name: 'Race Knit Polo',
    price: 142500,
    tear: { cuts: [0.2, 0.8], from: 0.25 },
    front: sprite('race', 287, 367, 143.0),
    side: sideSprite('race', 69, 360, 29.0, -1),
  },
  {
    id: 9,
    name: 'BSA Pocket Shirt',
    price: 102000,
    side: sideSprite('bsa', 102, 297, 51.0, -1),
  },
  { // GUESSED name/price
    id: 10,
    name: 'Ember Print Tee',
    price: 89000,
    side: sideSprite('tee', 84, 302, 46.5, 1),
  },
  { // GUESSED name/price
    id: 11,
    name: 'Pleated Trousers',
    price: 98000,
    side: sideSprite('brown', 94, 401, 48.0, 1),
  },
  { // GUESSED name/price
    id: 12,
    name: 'Tribal Mask Shirt',
    price: 115000,
    side: sideSprite('mask', 106, 324, 56.5, 1),
  },
]

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const
export type Size = string

export const formatPrice = (n: number) => `₦${n.toLocaleString('en-US')}`

/** positive modulo */
export const mod = (n: number, m: number) => ((n % m) + m) % m
