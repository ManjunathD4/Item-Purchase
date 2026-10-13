const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let types = [],
  items = [],
  lines = [],
  editType = null,
  editItem = null,
  editPurchase = null;

async function api(url, method = "GET", body) {
  const r = await fetch("/api" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
let tt;
function toast(msg, ok = true) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = ok ? "ok" : "err";
  t.style.display = "block";
  clearTimeout(tt);
  tt = setTimeout(() => (t.style.display = "none"), 4000);
}
const run =
  (fn) =>
  async (...a) => {
    try {
      await fn(...a);
    } catch (e) {
      toast(e.message, false);
    }
  };
const availBadge = (a) =>
  `<span class="badge ${a === "In Stock" ? "green" : a === "Low Stock" ? "orange" : "red"}">${a}</span>`;
const statusBadge = (a) =>
  `<span class="badge ${a ? "green" : "grey"}">${a ? "Active" : "Inactive"}</span>`;

/* tabs */
function show(tab) {
  document
    .querySelectorAll("main > section")
    .forEach((s) => s.classList.toggle("hidden", s.id !== tab));
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "purchases")
    loadPurchases().catch((e) => toast(e.message, false));
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => show(b.dataset.tab)));

/* data loading */
async function refresh() {
  [types, items] = await Promise.all([api("/item-types"), api("/items")]);
  renderTypes();
  renderItems();
  renderPurchaseItems();
}

/* ---- item types ---- */
function renderTypes() {
  $("#typeRows").innerHTML = types
    .map(
      (t) => `<tr><td>${t.id}</td><td>${esc(t.type_name)}</td><td>
    <button class="small" data-act="tedit" data-id="${t.id}">Edit</button>
    <button class="small danger" data-act="tdel" data-id="${t.id}">Delete</button></td></tr>`,
    )
    .join("");
  $("#iType").innerHTML =
    '<option value="">-- select --</option>' +
    types
      .map((t) => `<option value="${t.id}">${esc(t.type_name)}</option>`)
      .join("");
}
$("#typeSave").onclick = run(async () => {
  const body = { type_name: $("#typeName").value };
  if (editType) await api("/item-types/" + editType, "PUT", body);
  else await api("/item-types", "POST", body);
  toast(editType ? "Item type updated" : "Item type added");
  resetType();
  await refresh();
});
function resetType() {
  editType = null;
  $("#typeName").value = "";
  $("#typeSave").textContent = "Add Type";
  $("#typeCancel").classList.add("hidden");
}
$("#typeCancel").onclick = resetType;
$("#typeRows").onclick = run(async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === "tedit") {
    editType = id;
    $("#typeName").value = types.find((t) => t.id == id).type_name;
    $("#typeSave").textContent = "Update Type";
    $("#typeCancel").classList.remove("hidden");
  } else if (await askConfirm("Delete this item type?")) {
    await api("/item-types/" + id, "DELETE");
    toast("Item type deleted");
    await refresh();
  }
});

/* ---- items ---- */
function renderItems() {
  $("#itemRows").innerHTML =
    items
      .map(
        (
          i,
        ) => `<tr><td>${i.id}</td><td>${esc(i.name)}</td><td>${esc(i.type_name)}</td>
    <td>${i.purchase_date}</td><td>${i.stock_available}</td><td>${availBadge(i.availability)}</td><td>${statusBadge(i.active)}</td><td>
    <button class="small secondary" data-act="view" data-id="${i.id}">View</button>
    <button class="small" data-act="edit" data-id="${i.id}">Update</button>
    <button class="small secondary" data-act="toggle" data-id="${i.id}">${i.active ? "Deactivate" : "Activate"}</button>
    <button class="small danger" data-act="del" data-id="${i.id}">Delete</button></td></tr>`,
      )
      .join("") || '<tr><td colspan="8">No items</td></tr>';
  $("#stockRows").innerHTML = items
    .map(
      (i) =>
        `<tr><td>${esc(i.name)}</td><td>${esc(i.type_name)}</td><td>${i.stock_available}</td><td>${availBadge(i.availability)}</td><td>${statusBadge(i.active)}</td></tr>`,
    )
    .join("");
}
const itemBody = () => ({
  name: $("#iName").value,
  item_type_id: $("#iType").value,
  purchase_date: $("#iDate").value,
  stock_available: $("#iStock").value,
  active: $("#iActive").value,
});
function resetItem() {
  editItem = null;
  ["#iName", "#iDate", "#iStock"].forEach((s) => ($(s).value = ""));
  $("#iType").value = "";
  $("#iActive").value = "1";
  $("#itemFormTitle").textContent = "Add Item";
  $("#itemSave").textContent = "Create Item";
  $("#itemCancel").classList.add("hidden");
}
$("#itemSave").onclick = run(async () => {
  if (editItem) await api("/items/" + editItem, "PUT", itemBody());
  else await api("/items", "POST", itemBody());
  toast(editItem ? "Item updated" : "Item created");
  resetItem();
  await refresh();
});
$("#itemCancel").onclick = resetItem;
$("#itemRows").onclick = run(async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const id = b.dataset.id,
    it = items.find((x) => x.id == id);
  if (b.dataset.act === "edit") {
    editItem = id;
    $("#iName").value = it.name;
    $("#iType").value = it.item_type_id;
    $("#iDate").value = it.purchase_date;
    $("#iStock").value = it.stock_available;
    $("#iActive").value = it.active ? "1" : "0";
    $("#itemFormTitle").textContent = "Update Item #" + id;
    $("#itemSave").textContent = "Save Changes";
    $("#itemCancel").classList.remove("hidden");
    scrollTo(0, 0);
  } else if (b.dataset.act === "toggle") {
    await api("/items/" + id, "PUT", { ...it, active: it.active ? 0 : 1 });
    await refresh();
  } else if (b.dataset.act === "del") {
    if (await askConfirm("Delete this item ?")) {
      await api("/items/" + id, "DELETE");
      toast("Item deleted");
      await refresh();
    }
  } else if (b.dataset.act === "view") {
    const d = await api("/items/" + id);
    $("#itemDetail").classList.remove("hidden");
    $("#itemDetail").innerHTML = `<h3>${esc(d.name)} (ID ${d.id})</h3>
      <p>Type: ${esc(d.type_name)} | Purchase date: ${d.purchase_date} | Stock: ${d.stock_available} ${availBadge(d.availability)} ${statusBadge(d.active)}</p>
      <h4>Purchase history</h4>${d.purchases.length ? `<table><tr><th>Order</th><th>Date</th><th>Qty</th></tr>${d.purchases.map((p) => `<tr><td>${esc(p.order_id)}</td><td>${p.purchase_date}</td><td>${p.quantity}</td></tr>`).join("")}</table>` : '<p class="muted">Never purchased.</p>'}`;
  }
});

/* ---- purchase form ---- */
function renderPurchaseItems() {
  const usable = items.filter((i) => i.active);
  $("#pItem").innerHTML = usable
    .map(
      (i) =>
        `<option value="${i.id}">${esc(i.name)} (stock ${i.stock_available})</option>`,
    )
    .join("");
}
function renderLines() {
  $("#pLines").innerHTML =
    lines
      .map(
        (l, n) =>
          `<tr><td>${esc(l.name)}</td><td>${l.quantity}</td><td><button class="small danger" data-n="${n}">Remove</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="3" class="muted">No items added yet</td></tr>';
}
$("#pAdd").onclick = run(async () => {
  const id = Number($("#pItem").value),
    q = Number($("#pQty").value);
  if (!id) throw new Error("Select an item");
  if (!Number.isInteger(q) || q <= 0)
    throw new Error("Quantity must be greater than zero");
  const ex = lines.find((l) => l.item_id === id);
  if (ex) ex.quantity += q;
  else
    lines.push({
      item_id: id,
      name: items.find((i) => i.id === id).name,
      quantity: q,
    });
  $("#pQty").value = 1;
  renderLines();
});
$("#pLines").onclick = (e) => {
  const b = e.target.closest("button");
  if (b) {
    lines.splice(b.dataset.n, 1);
    renderLines();
  }
};
function resetPurchase() {
  editPurchase = null;
  lines = [];
  $("#pDate").value = new Date().toISOString().slice(0, 10);
  $("#pTitle").textContent = "Create Purchase";
  $("#pOrderId").textContent =
    "Order ID is generated automatically (e.g. PO-00001).";
  $("#pSubmit").textContent = "Submit Purchase";
  $("#pCancel").classList.add("hidden");
  renderLines();
}
$("#pCancel").onclick = resetPurchase;
$("#pSubmit").onclick = run(async () => {
  const body = {
    purchase_date: $("#pDate").value,
    items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
  };
  const res = editPurchase
    ? await api("/purchases/" + editPurchase, "PUT", body)
    : await api("/purchases", "POST", body);
  toast(`${res.order_id} ${editPurchase ? "updated" : "created"}`);
  resetPurchase();
  await refresh();
  show("purchases");
  showPurchase(res.id);
});

/* ---- purchase list / details ---- */
async function loadPurchases() {
  const rows = await api("/purchases");
  $("#purRows").innerHTML =
    rows
      .map(
        (
          p,
        ) => `<tr><td>${esc(p.order_id)}</td><td>${p.purchase_date}</td><td>${p.line_count}</td><td>${p.total_quantity}</td><td>
    <button class="small secondary" data-act="view" data-id="${p.id}">View Details</button>
    <button class="small" data-act="edit" data-id="${p.id}">Update</button></td></tr>`,
      )
      .join("") || '<tr><td colspan="5">No purchases yet</td></tr>';
} // no Delete button for purchases by design
async function showPurchase(id) {
  const p = await api("/purchases/" + id);
  $("#purDetail").classList.remove("hidden");
  $("#purDetail").innerHTML =
    `<h3>Order ${esc(p.order_id)}</h3><p>Purchase date: ${p.purchase_date}</p>
    <table><tr><th>Item</th><th>Item Type</th><th>Quantity</th><th>Current Stock</th><th>Status</th></tr>
    ${p.items.map((l) => `<tr><td>${esc(l.item_name)}</td><td>${esc(l.type_name)}</td><td>${l.quantity}</td><td>${l.stock_available}</td><td>${statusBadge(l.active)}</td></tr>`).join("")}</table>`;
  await loadPurchases();
}
$("#purRows").onclick = run(async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.act === "view") return showPurchase(b.dataset.id);
  const p = await api("/purchases/" + b.dataset.id);
  editPurchase = p.id;
  lines = p.items.map((l) => ({
    item_id: l.item_id,
    name: l.item_name,
    quantity: l.quantity,
  }));
  $("#pDate").value = p.purchase_date;
  $("#pTitle").textContent = "Update Purchase";
  $("#pOrderId").textContent = "Order ID: " + p.order_id;
  $("#pSubmit").textContent = "Save Changes";
  $("#pCancel").classList.remove("hidden");
  renderLines();
  show("purchase");
});

function askConfirm(message) {
  return new Promise((resolve) => {
    document.querySelector(".confirm-toast")?.remove(); // only one at a time
    const box = document.createElement("div");
    box.className = "confirm-toast";
    box.innerHTML = `<p>${esc(message)}</p>
      <button class="danger small" id="cYes">Yes, delete</button>
      <button class="secondary small" id="cNo">Cancel</button>`;
    document.body.appendChild(box);
    const done = (answer) => {
      box.remove();
      resolve(answer);
    };
    box.querySelector("#cYes").onclick = () => done(true);
    box.querySelector("#cNo").onclick = () => done(false);
  });
}

resetPurchase();
refresh().catch((e) => toast(e.message, false));

// const $ = (s) => document.querySelector(s);
// const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// let types = [], items = [], lines = [], editType = null, editItem = null, editPurchase = null;

// async function api(url, method = 'GET', body) {
//   const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
//   const d = await r.json().catch(() => ({}));
//   if (!r.ok) throw new Error(d.error || 'Request failed');
//   return d;
// }
// let tt;
// function toast(msg, ok = true) {
//   const t = $('#toast'); t.textContent = msg; t.className = ok ? 'ok' : 'err'; t.style.display = 'block';
//   clearTimeout(tt); tt = setTimeout(() => (t.style.display = 'none'), 4000);
// }
// const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, false); } };
// const availBadge = (a) => `<span class="badge ${a === 'In Stock' ? 'green' : a === 'Low Stock' ? 'orange' : 'red'}">${a}</span>`;
// const statusBadge = (a) => `<span class="badge ${a ? 'green' : 'grey'}">${a ? 'Active' : 'Inactive'}</span>`;

// /* tabs */
// function show(tab) {
//   document.querySelectorAll('main > section').forEach((s) => s.classList.toggle('hidden', s.id !== tab));
//   document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
//   if (tab === 'purchases') loadPurchases().catch((e) => toast(e.message, false));
// }
// document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => show(b.dataset.tab)));

// /* data loading */
// async function refresh() {
//   [types, items] = await Promise.all([api('/item-types'), api('/items')]);
//   renderTypes(); renderItems(); renderPurchaseItems();
// }

// /* ---- item types ---- */
// function renderTypes() {
//   $('#typeRows').innerHTML = types.map((t) => `<tr><td>${t.id}</td><td>${esc(t.type_name)}</td><td>
//     <button class="small" data-act="tedit" data-id="${t.id}">Edit</button>
//     <button class="small danger" data-act="tdel" data-id="${t.id}">Delete</button></td></tr>`).join('');
//   $('#iType').innerHTML = '<option value="">-- select --</option>' + types.map((t) => `<option value="${t.id}">${esc(t.type_name)}</option>`).join('');
// }
// $('#typeSave').onclick = run(async () => {
//   const body = { type_name: $('#typeName').value };
//   if (editType) await api('/item-types/' + editType, 'PUT', body); else await api('/item-types', 'POST', body);
//   toast(editType ? 'Item type updated' : 'Item type added'); resetType(); await refresh();
// });
// function resetType() { editType = null; $('#typeName').value = ''; $('#typeSave').textContent = 'Add Type'; $('#typeCancel').classList.add('hidden'); }
// $('#typeCancel').onclick = resetType;
// $('#typeRows').onclick = run(async (e) => {
//   const b = e.target.closest('button'); if (!b) return;
//   const id = b.dataset.id;
//   if (b.dataset.act === 'tedit') {
//     editType = id; $('#typeName').value = types.find((t) => t.id == id).type_name;
//     $('#typeSave').textContent = 'Update Type'; $('#typeCancel').classList.remove('hidden');
//   } else if (confirm('Delete this item type?')) { await api('/item-types/' + id, 'DELETE'); toast('Item type deleted'); await refresh(); }
// });

// /* ---- items ---- */
// function updateStats() {
//   const c = (a) => items.filter((i) => i.availability === a).length;
//   $('#sTotal').textContent = items.length; $('#sIn').textContent = c('In Stock');
//   $('#sLow').textContent = c('Low Stock'); $('#sOut').textContent = c('Out of Stock');
// }
// function renderItems() {
//   updateStats();
//   $('#itemRows').innerHTML = items.map((i) => `<tr><td>${i.id}</td><td>${esc(i.name)}</td><td>${esc(i.type_name)}</td>
//     <td>${i.purchase_date}</td><td>${i.stock_available}</td><td>${availBadge(i.availability)}</td><td>${statusBadge(i.active)}</td><td>
//     <button class="small secondary" data-act="view" data-id="${i.id}">View</button>
//     <button class="small" data-act="edit" data-id="${i.id}">Update</button>
//     <button class="small secondary" data-act="toggle" data-id="${i.id}">${i.active ? 'Deactivate' : 'Activate'}</button>
//     <button class="small danger" data-act="del" data-id="${i.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="8">No items</td></tr>';
//   $('#stockRows').innerHTML = items.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.type_name)}</td><td>${i.stock_available}</td><td>${availBadge(i.availability)}</td><td>${statusBadge(i.active)}</td></tr>`).join('');
// }
// const itemBody = () => ({ name: $('#iName').value, item_type_id: $('#iType').value, purchase_date: $('#iDate').value, stock_available: $('#iStock').value, active: $('#iActive').value });
// function resetItem() {
//   editItem = null; ['#iName', '#iDate', '#iStock'].forEach((s) => ($(s).value = '')); $('#iType').value = ''; $('#iActive').value = '1';
//   $('#itemFormTitle').textContent = 'Add Item'; $('#itemSave').textContent = 'Create Item'; $('#itemCancel').classList.add('hidden');
// }
// $('#itemSave').onclick = run(async () => {
//   if (editItem) await api('/items/' + editItem, 'PUT', itemBody()); else await api('/items', 'POST', itemBody());
//   toast(editItem ? 'Item updated' : 'Item created'); resetItem(); await refresh();
// });
// $('#itemCancel').onclick = resetItem;
// $('#itemRows').onclick = run(async (e) => {
//   const b = e.target.closest('button'); if (!b) return;
//   const id = b.dataset.id, it = items.find((x) => x.id == id);
//   if (b.dataset.act === 'edit') {
//     editItem = id; $('#iName').value = it.name; $('#iType').value = it.item_type_id; $('#iDate').value = it.purchase_date;
//     $('#iStock').value = it.stock_available; $('#iActive').value = it.active ? '1' : '0';
//     $('#itemFormTitle').textContent = 'Update Item #' + id; $('#itemSave').textContent = 'Save Changes'; $('#itemCancel').classList.remove('hidden');
//     scrollTo(0, 0);
//   } else if (b.dataset.act === 'toggle') {
//     await api('/items/' + id, 'PUT', { ...it, active: it.active ? 0 : 1 }); await refresh();
//   } else if (b.dataset.act === 'del') {
//     if (confirm('Delete this item?')) { await api('/items/' + id, 'DELETE'); toast('Item deleted'); await refresh(); }
//   } else if (b.dataset.act === 'view') {
//     const d = await api('/items/' + id);
//     $('#itemDetail').classList.remove('hidden');
//     $('#itemDetail').innerHTML = `<h3>${esc(d.name)} (ID ${d.id})</h3>
//       <p>Type: ${esc(d.type_name)} | Purchase date: ${d.purchase_date} | Stock: ${d.stock_available} ${availBadge(d.availability)} ${statusBadge(d.active)}</p>
//       <h4>Purchase history</h4>${d.purchases.length ? `<table><tr><th>Order</th><th>Date</th><th>Qty</th></tr>${d.purchases.map((p) => `<tr><td>${esc(p.order_id)}</td><td>${p.purchase_date}</td><td>${p.quantity}</td></tr>`).join('')}</table>` : '<p class="muted">Never purchased.</p>'}`;
//   }
// });

// /* ---- purchase form ---- */
// function renderPurchaseItems() {
//   const usable = items.filter((i) => i.active);
//   $('#pItem').innerHTML = usable.map((i) => `<option value="${i.id}">${esc(i.name)} (stock ${i.stock_available})</option>`).join('');
// }
// function renderLines() {
//   $('#pLines').innerHTML = lines.map((l, n) => `<tr><td>${esc(l.name)}</td><td>${l.quantity}</td><td><button class="small danger" data-n="${n}">Remove</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No items added yet</td></tr>';
// }
// $('#pAdd').onclick = run(async () => {
//   const id = Number($('#pItem').value), q = Number($('#pQty').value);
//   if (!id) throw new Error('Select an item');
//   if (!Number.isInteger(q) || q <= 0) throw new Error('Quantity must be greater than zero');
//   const ex = lines.find((l) => l.item_id === id);
//   if (ex) ex.quantity += q; else lines.push({ item_id: id, name: items.find((i) => i.id === id).name, quantity: q });
//   $('#pQty').value = 1; renderLines();
// });
// $('#pLines').onclick = (e) => { const b = e.target.closest('button'); if (b) { lines.splice(b.dataset.n, 1); renderLines(); } };
// function resetPurchase() {
//   editPurchase = null; lines = []; $('#pDate').value = new Date().toISOString().slice(0, 10);
//   $('#pTitle').textContent = 'Create Purchase'; $('#pOrderId').textContent = 'Order ID is generated automatically (e.g. PO-00001).';
//   $('#pSubmit').textContent = 'Submit Purchase'; $('#pCancel').classList.add('hidden'); renderLines();
// }
// $('#pCancel').onclick = resetPurchase;
// $('#pSubmit').onclick = run(async () => {
//   const body = { purchase_date: $('#pDate').value, items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })) };
//   const res = editPurchase ? await api('/purchases/' + editPurchase, 'PUT', body) : await api('/purchases', 'POST', body);
//   toast(`${res.order_id} ${editPurchase ? 'updated' : 'created'}`); resetPurchase(); await refresh(); show('purchases'); showPurchase(res.id);
// });

// /* ---- purchase list / details ---- */
// async function loadPurchases() {
//   const rows = await api('/purchases');
//   $('#purRows').innerHTML = rows.map((p) => `<tr><td>${esc(p.order_id)}</td><td>${p.purchase_date}</td><td>${p.line_count}</td><td>${p.total_quantity}</td><td>
//     <button class="small secondary" data-act="view" data-id="${p.id}">View Details</button>
//     <button class="small" data-act="edit" data-id="${p.id}">Update</button></td></tr>`).join('') || '<tr><td colspan="5">No purchases yet</td></tr>';
// } // no Delete button for purchases by design
// async function showPurchase(id) {
//   const p = await api('/purchases/' + id);
//   $('#purDetail').classList.remove('hidden');
//   $('#purDetail').innerHTML = `<h3>Order ${esc(p.order_id)}</h3><p>Purchase date: ${p.purchase_date}</p>
//     <table><tr><th>Item</th><th>Item Type</th><th>Quantity</th><th>Current Stock</th><th>Status</th></tr>
//     ${p.items.map((l) => `<tr><td>${esc(l.item_name)}</td><td>${esc(l.type_name)}</td><td>${l.quantity}</td><td>${l.stock_available}</td><td>${statusBadge(l.active)}</td></tr>`).join('')}</table>`;
//   await loadPurchases();
// }
// $('#purRows').onclick = run(async (e) => {
//   const b = e.target.closest('button'); if (!b) return;
//   if (b.dataset.act === 'view') return showPurchase(b.dataset.id);
//   const p = await api('/purchases/' + b.dataset.id);
//   editPurchase = p.id; lines = p.items.map((l) => ({ item_id: l.item_id, name: l.item_name, quantity: l.quantity }));
//   $('#pDate').value = p.purchase_date; $('#pTitle').textContent = 'Update Purchase'; $('#pOrderId').textContent = 'Order ID: ' + p.order_id;
//   $('#pSubmit').textContent = 'Save Changes'; $('#pCancel').classList.remove('hidden');
//   renderLines(); show('purchase');
// });

// resetPurchase();
// refresh().catch((e) => toast(e.message, false));
