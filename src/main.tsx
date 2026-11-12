import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminGate } from './AdminGate.tsx'
import { useProducts } from './products.ts'

const isAdmin = () => window.location.hash.startsWith('#/admin')

function Root() {
  const [admin, setAdmin] = useState(isAdmin)
  const products = useProducts()
  useEffect(() => {
    const on = () => setAdmin(isAdmin())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  if (admin) return <AdminGate />
  if (products.length === 0)
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-paper text-ink">
        <div className="font-serif italic font-bold text-[28px]">Rick's Closet</div>
        <p className="text-sm text-ink/60">The rail is empty.</p>
        <a href="#/admin" className="h-10 px-5 leading-10 rounded-full bg-ink text-white text-[13px] font-medium">
          Add products
        </a>
      </div>
    )
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
