/* =========================================================
   app.js – UI wiring: forms, rendering, live sync, printing
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let session = null;       // { name, code } – this tab's user
  let room = null;          // latest room snapshot
  let stopSync = null;      // unsubscribe from storage events
  let seenItemIds = null;   // used to flash items added by others
  let wasUnlocked = false;  // for the free-delivery celebration

  const money = (minor) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: room.currency }).format(minor / 100);
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* ---------------- visual helpers ---------------- */
  const GRADIENTS = [
    ['#0f766e', '#14b8a6'], ['#6366f1', '#8b5cf6'], ['#f59e0b', '#ef4444'], ['#0ea5e9', '#2563eb'],
    ['#ec4899', '#f43f5e'], ['#10b981', '#84cc16'], ['#8b5cf6', '#d946ef'], ['#f97316', '#facc15']
  ];

  // same name -> same colour, everywhere
  function avatar(name, small = false) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const [a, b] = GRADIENTS[h % GRADIENTS.length];
    return `<span class="avatar ${small ? 'sm' : ''}" style="background:linear-gradient(135deg,${a},${b})" title="${esc(name)}">${esc(name.trim().charAt(0) || '?')}</span>`;
  }

  const EMOJI = [
    [/milk|cheese|butter|yogh?urt|curd|paneer|cream/, '🥛'],
    [/bread|bun|bake|cake|cookie|toast/, '🍞'],
    [/rice|atta|flour|wheat|dal|lentil|oats|cereal|pasta|noodle/, '🌾'],
    [/egg/, '🥚'],
    [/apple|banana|fruit|mango|orange|grape|berry/, '🍎'],
    [/veg|tomato|onion|potato|carrot|spinach|salad/, '🥦'],
    [/chicken|meat|fish|mutton|bacon/, '🍗'],
    [/snack|chips|biscuit|chocolate|candy|ice ?cream/, '🍫'],
    [/\b(water|juice|soda|cola|drink|tea|coffee|beer)\b/, '🥤'],
    [/soap|shampoo|tooth|detergent|clean|tissue|toilet|towel|wash/, '🧼'],
    [/pen|book|notebook|paper|stationery|pencil/, '📚'],
    [/battery|cable|charger|bulb|plug/, '🔌']
  ];
  const emojiFor = (name) => (EMOJI.find(([re]) => re.test(name.toLowerCase())) || [null, '🛍️'])[1];

  const LOG_ICON = { add: '➕', remove: '🗑️', qty: '✏️', room: '👋' };

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('#confetti');
    const colors = ['#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#fde68a'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.5 + 's';
      p.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
      box.appendChild(p);
    }
    setTimeout(() => (box.innerHTML = ''), 3200);
  }

  /* ---------------- theme ---------------- */
  function setTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    $('#btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('cartshare:theme', theme); } catch (e) { /* ignore */ }
  }
  const savedTheme = (() => { try { return localStorage.getItem('cartshare:theme'); } catch (e) { return null; } })();
  setTheme(savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  /* ---------------- views ---------------- */
  function showLogin() {
    $('#view-login').classList.remove('d-none');
    $('#view-room').classList.add('d-none');
  }

  function enterRoom() {
    room = Store.load(session.code);
    if (!room) { Store.clearSession(); session = null; return showLogin(); }

    $('#view-login').classList.add('d-none');
    $('#view-room').classList.remove('d-none');
    $('#room-code').textContent = room.code;
    $('#me-name').textContent = session.name;
    $('#threshold-input').value = room.threshold / 100;
    seenItemIds = new Set(room.items.map((i) => i.id));
    wasUnlocked = room.threshold > 0 && Store.totals(room).total >= room.threshold;

    if (stopSync) stopSync();
    stopSync = Store.onChange(room.code, (fresh) => {
      if (!fresh) { toast('This room was deleted.'); return leave(false); }
      room = fresh;
      render(true);
    });
    render(false);
  }

  function leave(logIt = true) {
    if (stopSync) stopSync();
    if (logIt && session) Store.leaveRoom(session.code, session.name);
    Store.clearSession();
    session = null; room = null;
    showLogin();
  }

  /* ---------------- rendering ---------------- */
  function render(fromRemote) {
    renderMembers();
    renderCart(fromRemote);
    renderSummary();
    renderLog();
  }

  function renderMembers() {
    const shown = room.members.slice(0, 4);
    const extra = room.members.length - shown.length;
    $('#member-stack').innerHTML =
      shown.map((m) => avatar(m.name)).join('') +
      (extra > 0 ? `<span class="avatar more">+${extra}</span>` : '');
  }

  function renderCart(fromRemote) {
    $('#item-count').textContent = room.items.reduce((n, i) => n + i.qty, 0);
    const list = $('#cart-list');

    if (!room.items.length) {
      list.innerHTML = '<li class="empty-state"><span class="big">🛒</span><strong>Your cart is empty</strong><br>Add the first item above and your room will see it instantly.</li>';
      return;
    }

    list.innerHTML = room.items.map((i) => {
      const isNew = !seenItemIds.has(i.id);
      const cls = isNew ? (fromRemote ? 'flash' : 'enter') : '';
      return `
      <li class="list-group-item cart-item ${cls}" data-id="${esc(i.id)}">
        <div class="emoji" aria-hidden="true">${emojiFor(i.name)}</div>
        <div class="info">
          <div class="name">${esc(i.name)}</div>
          <div class="meta">${money(i.price)} each · ${avatar(i.addedBy, true)} ${esc(i.addedBy)} · ${time(i.addedAt)}</div>
        </div>
        <div class="qty" role="group" aria-label="Quantity for ${esc(i.name)}">
          <button data-action="dec" aria-label="Decrease">−</button>
          <span aria-live="polite">${i.qty}</span>
          <button data-action="inc" aria-label="Increase">+</button>
        </div>
        <div class="line-total">${money(i.price * i.qty)}</div>
        <button class="remove" data-action="remove" aria-label="Remove ${esc(i.name)}">✕</button>
      </li>`;
    }).join('');

    room.items.forEach((i) => seenItemIds.add(i.id));
  }

  function renderSummary() {
    const t = Store.totals(room);
    $('#total').textContent = money(t.total);

    const box = $('#threshold-box');
    if (room.threshold > 0) {
      box.classList.remove('d-none');
      const unlocked = t.total >= room.threshold;
      const pct = Math.min(100, Math.round((t.total / room.threshold) * 100));
      const bar = $('#threshold-bar');
      bar.style.width = pct + '%';
      bar.classList.toggle('done', unlocked);
      $('#threshold-text').textContent = unlocked
        ? '🎉 Free delivery unlocked!'
        : `🚚 Add ${money(room.threshold - t.total)} more for free delivery (${pct}%)`;
      if (unlocked && !wasUnlocked) confetti();
      wasUnlocked = unlocked;
    } else {
      box.classList.add('d-none');
      wasUnlocked = false;
    }

    // don't overwrite the input while the user is typing in it
    if (document.activeElement !== $('#threshold-input')) $('#threshold-input').value = room.threshold / 100;

    $('#split-body').innerHTML = Object.entries(t.byMember).map(([name, v]) => `
      <tr>
        <td><span class="person">${avatar(name, true)} ${esc(name)}${name === session.name ? ' <span class="text-body-secondary fw-normal">(you)</span>' : ''}</span></td>
        <td class="text-end">${money(v.total)}</td>
        <td class="text-end">${money(t.equalShare)}</td>
      </tr>`).join('');
  }

  function renderLog() {
    $('#log-list').innerHTML = room.log.map((l) => `
      <li class="list-group-item">
        <span class="ico" aria-hidden="true">${LOG_ICON[l.type] || '•'}</span>
        <div>
          <strong>${esc(l.user)}</strong> ${esc(l.text)}
          <time datetime="${new Date(l.ts).toISOString()}" title="${new Date(l.ts).toLocaleString()}">${time(l.ts)}</time>
        </div>
      </li>`).join('');
  }

  /* ---------------- helpers ---------------- */
  function toast(msg) {
    $('#toast-body').textContent = msg;
    bootstrap.Toast.getOrCreateInstance($('#toast'), { delay: 2200 }).show();
  }

  function showError(sel, msg) {
    const el = $(sel);
    el.textContent = msg || '';
    el.classList.toggle('d-none', !msg);
  }

  // After my own change, refresh from the result
  function apply(res) {
    if (!res.ok) { toast(res.error); return false; }
    room = res.room;
    render(false);
    return true;
  }

  /* ---------------- events ---------------- */
  $('#form-create').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = Store.createRoom({
      name: $('#create-name').value,
      currency: $('#create-currency').value,
      threshold: $('#create-threshold').value
    });
    if (!res.ok) return showError('#create-error', res.error);
    showError('#create-error');
    session = Store.getSession();
    enterRoom();
    toast(`Room ${res.room.code} created – share the code!`);
  });

  $('#form-join').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = Store.joinRoom($('#join-code').value, $('#join-name').value);
    if (!res.ok) return showError('#join-error', res.error);
    showError('#join-error');
    session = Store.getSession();
    enterRoom();
  });

  $('#form-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = Store.addItem(session.code, session.name, {
      name: $('#item-name').value,
      price: $('#item-price').value,
      qty: $('#item-qty').value
    });
    if (!res.ok) return showError('#add-error', res.error);
    showError('#add-error');
    apply(res);
    e.target.reset();
    $('#item-qty').value = 1;
    $('#item-name').focus();
  });

  $('#cart-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const act = btn.dataset.action;
    if (act === 'inc') apply(Store.changeQty(session.code, session.name, id, +1));
    if (act === 'dec') apply(Store.changeQty(session.code, session.name, id, -1));
    if (act === 'remove') apply(Store.removeItem(session.code, session.name, id));
  });

  $('#btn-clear').addEventListener('click', () => {
    if (room && room.items.length && confirm('Remove every item from the shared cart?')) {
      apply(Store.clearCart(session.code, session.name));
    }
  });

  $('#threshold-input').addEventListener('change', (e) => {
    apply(Store.setThreshold(session.code, session.name, e.target.value));
  });

  $('#btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast('Room code copied');
    } catch (err) {
      toast('Room code: ' + room.code);
    }
  });

  $('#btn-theme').addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
  });

  $('#btn-leave').addEventListener('click', () => leave(true));

  $('#btn-receipt').addEventListener('click', () => {
    room = Store.load(session.code) || room;               // freshest data
    const html = Receipt.build(room, Store.totals(room), session.name);
    $('#receipt-preview').innerHTML = html;
    $('#print-area').innerHTML = html;
    bootstrap.Modal.getOrCreateInstance($('#receipt-modal')).show();
  });

  $('#btn-print').addEventListener('click', () => window.print());

  /* ---------------- boot ---------------- */
  session = Store.getSession();
  session ? enterRoom() : showLogin();
})();
