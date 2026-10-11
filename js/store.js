/* =========================================================
   store.js – data layer
   - Room data lives in localStorage (shared by every tab)
   - Who "I" am lives in sessionStorage (different per tab,
     so two tabs = two different users)
   - The `storage` event tells other tabs something changed
   ========================================================= */
const Store = (() => {
  'use strict';

  const ROOM_PREFIX = 'cartshare:room:';
  const SESSION_KEY = 'cartshare:session';
  const MAX_LOG = 200;
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanName = (n) => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 30);

  function genCode() {
    let code;
    do {
      code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (load(code));
    return code;
  }

  /* ---------- low-level ---------- */
  function load(code) {
    try {
      return JSON.parse(localStorage.getItem(ROOM_PREFIX + normCode(code)));
    } catch (e) {
      return null;
    }
  }

  function save(room) {
    localStorage.setItem(ROOM_PREFIX + room.code, JSON.stringify(room));
  }

  function addLog(room, user, type, text) {
    room.log.unshift({ id: uid(), ts: Date.now(), user, type, text });
    if (room.log.length > MAX_LOG) room.log.length = MAX_LOG;
  }

  // read -> change -> write, always on the freshest copy
  function mutate(code, fn) {
    const room = load(code);
    if (!room) return { ok: false, error: 'This room no longer exists.' };
    const err = fn(room);
    if (err) return { ok: false, error: err };
    save(room);
    return { ok: true, room };
  }

  /* ---------- session (per tab) ---------- */
  const getSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  };
  const setSession = (s) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

  /* ---------- rooms ---------- */
  function createRoom({ name, currency, threshold }) {
    name = cleanName(name);
    if (!name) return { ok: false, error: 'Please enter your name.' };
    const t = Math.round(Number(threshold) * 100);
    if (!Number.isFinite(t) || t < 0) return { ok: false, error: 'Free-delivery amount must be 0 or more.' };

    const room = {
      code: genCode(),
      currency: currency || 'INR',
      threshold: t,           // stored in minor units (paise/cents)
      createdAt: Date.now(),
      createdBy: name,
      members: [{ name, joinedAt: Date.now() }],
      items: [],
      log: []
    };
    addLog(room, name, 'room', 'created the room');
    save(room);
    setSession({ name, code: room.code });
    return { ok: true, room };
  }

  function joinRoom(code, name) {
    code = normCode(code);
    name = cleanName(name);
    if (!name) return { ok: false, error: 'Please enter your name.' };
    if (code.length !== 6) return { ok: false, error: 'Room codes have 6 characters.' };

    const res = mutate(code, (room) => {
      const exists = room.members.some((m) => m.name.toLowerCase() === name.toLowerCase());
      if (!exists) {
        room.members.push({ name, joinedAt: Date.now() });
        addLog(room, name, 'room', 'joined the room');
      }
    });
    if (!res.ok) return { ok: false, error: 'No room found with that code.' };
    // keep the stored spelling if the member already existed
    const member = res.room.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
    setSession({ name: member.name, code });
    return res;
  }

  function leaveRoom(code, name) {
    mutate(code, (room) => addLog(room, name, 'room', 'left the room'));
    clearSession();
  }

  /* ---------- cart ---------- */
  function addItem(code, user, { name, price, qty }) {
    name = String(name || '').trim().slice(0, 60);
    const p = Math.round(Number(price) * 100);
    const q = parseInt(qty, 10);
    if (!name) return { ok: false, error: 'Item name is required.' };
    if (!Number.isFinite(p) || p <= 0) return { ok: false, error: 'Enter a price above 0.' };
    if (!Number.isInteger(q) || q < 1 || q > 99) return { ok: false, error: 'Quantity must be between 1 and 99.' };

    return mutate(code, (room) => {
      room.items.push({ id: uid(), name, price: p, qty: q, addedBy: user, addedAt: Date.now() });
      addLog(room, user, 'add', `added ${q} × ${name}`);
    });
  }

  function changeQty(code, user, id, delta) {
    return mutate(code, (room) => {
      const item = room.items.find((i) => i.id === id);
      if (!item) return 'That item was already removed.';
      const next = item.qty + delta;
      if (next < 1 || next > 99) return 'Quantity must be between 1 and 99.';
      item.qty = next;
      addLog(room, user, 'qty', `changed ${item.name} to ${next}`);
    });
  }

  function removeItem(code, user, id) {
    return mutate(code, (room) => {
      const idx = room.items.findIndex((i) => i.id === id);
      if (idx === -1) return 'That item was already removed.';
      const [item] = room.items.splice(idx, 1);
      addLog(room, user, 'remove', `removed ${item.name} (added by ${item.addedBy})`);
    });
  }

  function clearCart(code, user) {
    return mutate(code, (room) => {
      if (!room.items.length) return 'The cart is already empty.';
      addLog(room, user, 'remove', `cleared the cart (${room.items.length} items)`);
      room.items = [];
    });
  }

  function setThreshold(code, user, value) {
    const t = Math.round(Number(value) * 100);
    if (!Number.isFinite(t) || t < 0) return { ok: false, error: 'Invalid amount.' };
    return mutate(code, (room) => {
      if (room.threshold === t) return 'No change.';
      room.threshold = t;
      addLog(room, user, 'room', 'changed the free-delivery amount');
    });
  }

  /* ---------- derived numbers ---------- */
  function totals(room) {
    const byMember = {};
    room.members.forEach((m) => (byMember[m.name] = { total: 0, count: 0 }));
    let total = 0;
    room.items.forEach((i) => {
      const line = i.price * i.qty;
      total += line;
      byMember[i.addedBy] = byMember[i.addedBy] || { total: 0, count: 0 };
      byMember[i.addedBy].total += line;
      byMember[i.addedBy].count += i.qty;
    });
    const n = Math.max(room.members.length, 1);
    return { total, byMember, equalShare: Math.round(total / n) };
  }

  /* ---------- live sync ---------- */
  // `storage` fires in OTHER tabs when localStorage changes
  function onChange(code, cb) {
    const handler = (e) => {
      if (e.key === ROOM_PREFIX + code) cb(e.newValue ? JSON.parse(e.newValue) : null);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  return {
    load, normCode, getSession, setSession, clearSession,
    createRoom, joinRoom, leaveRoom,
    addItem, changeQty, removeItem, clearCart, setThreshold,
    totals, onChange
  };
})();

if (typeof module !== 'undefined') module.exports = Store; // lets us unit-test in Node
