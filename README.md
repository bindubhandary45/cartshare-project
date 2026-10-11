# CartShare 🛒

A collaborative shopping-cart web app. Create or join a room with a code, add items to a shared cart,
watch everyone's activity live, and print an audit-ready receipt.

**Live demo:** _paste your Vercel / Netlify / GitHub Pages URL here_

## Features
- **Rooms** – create a room (random 6-character code) or join one with a code + your name
- **Shared cart** – add, increase/decrease and remove items; every item records who added it
- **Live sync** – changes appear instantly in other tabs via the `storage` event
- **Free-delivery tracker** – progress bar toward a configurable threshold
- **Fair split** – per-person totals (items they added) and an equal-share column
- **Activity log** – timestamped record of every join, add, change and removal
- **Printable receipt** – numbered receipt with items, split, audit trail and signature lines (`@media print`)
- **Responsive & modern UI** – Bootstrap grid + Flexbox, glass cards, avatars, item icons, animations
- **Dark mode** – toggle in the top bar (remembers your choice)
- **Free-delivery celebration** – confetti when your group unlocks free delivery

## Run locally
No build step needed.
1. Clone the repo: `git clone <your-repo-url>` and `cd cartshare`
2. Open `index.html` in a browser, **or** serve it: `python3 -m http.server 8000` → http://localhost:8000

## How to test multiple users
Each **tab** is a separate user (the name is kept in `sessionStorage`), while the room data is shared in `localStorage`.
1. Tab A: *Create a room* as "Asha" → copy the code
2. Tab B (same browser): *Join a room* as "Ravi" with that code
3. Add items in either tab and watch the other update; check the Activity panel
4. Click **Generate receipt → Print / Save as PDF**

> Note: browser storage is per-browser, so live sync works across tabs/windows of the **same browser**. Syncing
> across different devices would need a backend (e.g. Firebase / Supabase) – see "Stretch goals".

## Folder structure
```
cartshare/
├── index.html
├── css/
│   ├── style.css      # layout, theme, receipt styles
│   └── print.css      # @media print rules
├── js/
│   ├── store.js       # data layer (localStorage + sync)
│   ├── receipt.js     # receipt HTML builder
│   └── app.js         # UI, events, rendering
├── assets/
│   └── favicon.svg
└── README.md
```

## Deploy
- **Netlify:** drag-and-drop the folder at app.netlify.com/drop
- **Vercel:** `npx vercel` in the folder (framework: "Other")
- **GitHub Pages:** Settings → Pages → deploy from `main` / root

## Stretch goals
- Firebase/Supabase realtime database for true cross-device rooms
- Export receipt as CSV, per-item "split between these people" assignment
- Dark mode, undo for removals, room expiry
