# Rick's Closet

Interactive photo-rail wardrobe (React + Vite + TypeScript + Tailwind v4 + Framer Motion).

```bash
npm install
npm run dev
```

## Products

Everything lives in `src/data.ts`; the photos are transparent WebP cut-outs in `public/products/`:

- `<slug>-side.webp` – the piece hanging side-on on the rail (every product has one)
- `<slug>-front.webp` – the front-facing photo shown when the piece is in the centre and in the product modal

Pieces **without** a front photo (BSA Pocket Shirt, Ember Print Tee, Pleated Trousers, Tribal Mask Shirt) are shown
side-on and slowly swing in the centre. To give one the full 3D turn:

1. Export a transparent PNG/WebP of the front, cropped so its **top edge is the top of the hook**, and save it as
   `public/products/<slug>-front.webp`. Higher resolution is fine - it is displayed at the width/height you list below.
2. In `src/data.ts` add a `front: sprite('<slug>', <width>, <height>, <hookX>)` line to that product
   (`width`/`height` = display size in px, `hookX` = x position of the hook inside the image).

Names and prices marked `GUESSED` in `src/data.ts` are placeholders.

## Controls

Drag / swipe, mouse wheel, `←` `→`, or the arrow buttons move the rail. `Enter` or **View** opens the product, `Esc` closes.

## Admin dashboard

Open `/#/admin` (there is no public link to it). The first visit asks you to create a username + password; after that you sign in, can change the password and log out. 5 wrong tries lock the form for 30 s, then longer.
Forgot the password? In the browser console run `localStorage.removeItem('rc.admin.v1')` and reload to set a new one (this works because everything is front-end only - see the note below).
Add / edit / delete products: image, name, price (₦), sizes. Photos get their plain background removed and a hanger added in the browser.
Products are stored in this browser's localStorage (no server): use **Export JSON** for a backup. To make them live for every visitor you need a backend (the store in `src/products.ts` is the only place to swap).
