import { useSyncExternalStore } from 'react'
import { PRODUCTS } from './data'
import type { Product } from './data'

/**
 * Product store. The shop and the admin dashboard both read from here.
 * It is saved in this browser's localStorage (no server), seeded from the built-in PRODUCTS list.
 */
const KEY = 'rc.products.v1'
const subs = new Set<() => void>()
let cache: Product[] | null = null

const load = (): Product[] => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const list: unknown = JSON.parse(raw)
      if (Array.isArray(list)) return list as Product[]
    }
  } catch {
    /* private mode / corrupted -> fall back to the built-in list */
  }
  return PRODUCTS
}

export const getProducts = (): Product[] => (cache ??= load())

const notify = () => subs.forEach((f) => f())

/** returns false when the browser refused to store it (usually: storage full) */
const commit = (next: Product[]): boolean => {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    return false
  }
  cache = next
  notify()
  return true
}

const subscribe = (cb: () => void) => {
  subs.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    subs.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export const useProducts = () => useSyncExternalStore(subscribe, getProducts)

export const nextId = (list: Product[] = getProducts()) => list.reduce((m, p) => Math.max(m, p.id), 0) + 1

export const addProduct = (p: Omit<Product, 'id'>): boolean => commit([...getProducts(), { ...p, id: nextId() }])

export const updateProduct = (p: Product): boolean => commit(getProducts().map((x) => (x.id === p.id ? p : x)))

export const deleteProduct = (id: number): boolean => commit(getProducts().filter((x) => x.id !== id))

export const resetProducts = () => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  cache = PRODUCTS
  notify()
}

export const importProducts = (list: Product[]): boolean => commit(list)
