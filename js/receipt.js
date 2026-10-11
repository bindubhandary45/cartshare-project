/* =========================================================
   receipt.js – builds the audit-ready receipt HTML
   The same markup is used for the on-screen preview and for
   the print-only #print-area (see css/print.css).
   ========================================================= */
const Receipt = (() => {
  'use strict';

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtDate = (ts) => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  function build(room, totals, generatedBy) {
    const money = (minor) =>
      new Intl.NumberFormat(undefined, { style: 'currency', currency: room.currency }).format(minor / 100);

    const now = Date.now();
    const receiptNo = `CS-${room.code}-${new Date(now).toISOString().slice(2, 10).replace(/-/g, '')}-${String(now).slice(-4)}`;

    const itemRows = room.items.length
      ? room.items.map((i, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${esc(i.name)}</td>
            <td class="r">${i.qty}</td>
            <td class="r">${money(i.price)}</td>
            <td class="r">${money(i.price * i.qty)}</td>
            <td>${esc(i.addedBy)}</td>
          </tr>`).join('')
      : '<tr><td colspan="6">No items in cart.</td></tr>';

    const memberRows = Object.entries(totals.byMember).map(([name, v]) => `
      <tr>
        <td>${esc(name)}</td>
        <td class="r">${v.count}</td>
        <td class="r">${money(v.total)}</td>
        <td class="r">${money(totals.equalShare)}</td>
      </tr>`).join('');

    let delivery = 'No free-delivery threshold set.';
    if (room.threshold > 0) {
      delivery = totals.total >= room.threshold
        ? `Free delivery unlocked (threshold ${money(room.threshold)}).`
        : `Short of free delivery by ${money(room.threshold - totals.total)} (threshold ${money(room.threshold)}).`;
    }

    const logRows = room.log.slice().reverse().map((l) =>
      `<tr><td>${esc(fmtDate(l.ts))}</td><td>${esc(l.user)}</td><td>${esc(l.text)}</td></tr>`).join('');

    return `
    <div class="receipt">
      <h2>CartShare – Group Receipt</h2>
      <div class="sub">
        Room <strong>${esc(room.code)}</strong> · Receipt ${esc(receiptNo)}<br>
        Generated ${esc(fmtDate(now))} by ${esc(generatedBy)}
      </div>

      <div class="section-title">Items</div>
      <table>
        <thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Line</th><th>Added by</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr class="grand"><td colspan="4">TOTAL</td><td class="r">${money(totals.total)}</td><td></td></tr></tfoot>
      </table>
      <p>${esc(delivery)}</p>

      <div class="section-title">Split between ${room.members.length} member${room.members.length === 1 ? '' : 's'}</div>
      <table>
        <thead><tr><th>Member</th><th class="r">Units</th><th class="r">Items they added</th><th class="r">Equal share</th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>

      <div class="section-title">Audit trail</div>
      <table>
        <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
        <tbody>${logRows}</tbody>
      </table>

      <div class="sign"><div>Prepared by</div><div>Approved by</div></div>
    </div>`;
  }

  return { build };
})();
