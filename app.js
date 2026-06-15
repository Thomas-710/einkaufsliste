/* Einkaufsliste – PWA Logik */
(() => {
  'use strict';

  const ITEMS_KEY = 'einkaufsliste.items.v2';
  const ITEMS_KEY_OLD = 'einkaufsliste.items.v1';
  const FAV_KEY = 'einkaufsliste.favorites.v1';
  const SET_KEY = 'einkaufsliste.settings.v1';

  /** @type {{id:string,name:string,qty:string,shop:string,done:boolean,fav:boolean}[]} */
  let items = loadItems();
  /** @type {{name:string,qty:string,shop:string}[]} */
  let favorites = loadJSON(FAV_KEY, []);
  let settings = loadJSON(SET_KEY, { grouped: false, collapsed: [], selectedId: null, shopOrder: [], autoloadFav: false });
  let collapsed = new Set(settings.collapsed || []);
  let grouped = !!settings.grouped;
  let selectedId = settings.selectedId || null;
  let shopOrder = Array.isArray(settings.shopOrder) ? settings.shopOrder : [];
  let autoloadFav = !!settings.autoloadFav;

  // --- Elemente ---
  const listWrap = document.getElementById('list');
  const emptyHint = document.getElementById('empty-hint');
  const counterEl = document.getElementById('counter');
  const form = document.getElementById('add-form');
  const itemInput = document.getElementById('item-input');
  const qtyInput = document.getElementById('qty-input');
  const shopInput = document.getElementById('shop-input');
  const shopList = document.getElementById('shop-list');
  const fileInput = document.getElementById('file-input');
  const toastEl = document.getElementById('toast');
  const btnGroup = document.getElementById('btn-group');
  const favSheet = document.getElementById('fav-sheet');
  const favListEl = document.getElementById('fav-list');

  // --- Laden / Speichern ---
  function loadJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch { return fallback; }
  }
  function loadItems() {
    let arr = loadJSON(ITEMS_KEY, null);
    if (!Array.isArray(arr)) arr = loadJSON(ITEMS_KEY_OLD, []); // Migration v1 -> v2
    if (!Array.isArray(arr)) return [];
    return arr.map(it => ({
      id: it.id || uid(),
      name: it.name || '',
      qty: it.qty || '',
      shop: it.shop || '',
      done: !!it.done,
      fav: !!it.fav
    }));
  }
  function saveItems() { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); }
  function saveFav() { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }
  function saveSettings() {
    settings = { grouped, collapsed: [...collapsed], selectedId, shopOrder, autoloadFav };
    localStorage.setItem(SET_KEY, JSON.stringify(settings));
  }
  function loadFavoritesIntoList() {
    items = favorites.map(f => ({ id: uid(), name: f.name, qty: f.qty || '1', shop: f.shop || '', done: false, fav: true }));
    selectedId = null;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // --- Rendern ---
  function shopLabel(key) { return key ? key : 'Ohne Geschäft'; }

  function render() {
    listWrap.innerHTML = '';

    if (grouped) {
      const order = [];
      const map = new Map();
      for (const it of items) {
        const key = it.shop || '';
        if (!map.has(key)) { map.set(key, []); order.push(key); }
        map.get(key).push(it);
      }
      // feste Reihenfolge anwenden: bekannte Reihenfolge zuerst, neue Geschäfte hinten
      const ordered = [];
      shopOrder.forEach(k => { if (order.includes(k) && !ordered.includes(k)) ordered.push(k); });
      order.forEach(k => { if (!ordered.includes(k)) ordered.push(k); });

      for (const key of ordered) {
        const section = document.createElement('section');
        section.className = 'group';
        section.dataset.shopkey = key;

        const head = document.createElement('div');
        head.className = 'group-head' + (collapsed.has(key) ? ' collapsed' : '');
        const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▾';
        const name = document.createElement('span'); name.className = 'gname'; name.textContent = shopLabel(key);
        const cnt = document.createElement('span'); cnt.className = 'gcount';
        const g = map.get(key);
        cnt.textContent = `(${g.filter(i => !i.done).length}/${g.length})`;
        const line = document.createElement('span'); line.className = 'gline';
        const gdrag = document.createElement('button');
        gdrag.className = 'gdrag'; gdrag.type = 'button'; gdrag.textContent = '↕';
        gdrag.setAttribute('aria-label', 'Gruppe verschieben');
        gdrag.addEventListener('click', e => e.stopPropagation());
        attachGroupDrag(gdrag, section, key);
        head.append(chev, name, cnt, line, gdrag);
        head.addEventListener('click', () => {
          if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
          saveSettings(); render();
        });
        section.appendChild(head);

        if (!collapsed.has(key)) {
          const ul = document.createElement('ul');
          ul.className = 'list';
          for (const it of g) ul.appendChild(itemEl(it, false));
          section.appendChild(ul);
        }
        listWrap.appendChild(section);
      }
    } else {
      const ul = document.createElement('ul');
      ul.className = 'list';
      for (const it of items) ul.appendChild(itemEl(it, true));
      listWrap.appendChild(ul);
    }

    emptyHint.style.display = items.length ? 'none' : 'block';
    const open = items.filter(i => !i.done).length;
    counterEl.textContent = items.length ? `${open} offen / ${items.length} gesamt` : '';
    refreshShopList();
  }

  function itemEl(it, showChip) {
    const li = document.createElement('li');
    li.className = 'item' + (it.done ? ' done' : '') + (it.id === selectedId ? ' selected' : '');
    li.dataset.id = it.id;
    li.dataset.shopkey = it.shop || '';

    const drag = document.createElement('button');
    drag.className = 'drag'; drag.type = 'button'; drag.textContent = '≡';
    drag.setAttribute('aria-label', 'Zum Verschieben ziehen');
    attachDrag(drag, li, it);

    const check = document.createElement('button');
    check.className = 'check'; check.type = 'button';
    check.textContent = it.done ? '✓' : '';
    check.setAttribute('aria-label', it.done ? 'Wieder aktivieren' : 'Als erledigt markieren');
    check.addEventListener('click', () => toggleDone(it.id));

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = it.name;
    if (it.qty) { const q = document.createElement('span'); q.className = 'qty'; q.textContent = '× ' + it.qty; label.appendChild(q); }
    if (showChip && it.shop) { const c = document.createElement('span'); c.className = 'shop-chip'; c.textContent = it.shop; label.appendChild(c); }
    label.addEventListener('click', () => selectItem(it.id));

    const star = document.createElement('button');
    star.className = 'star' + (it.fav ? ' on' : ''); star.type = 'button';
    star.textContent = it.fav ? '★' : '☆';
    star.setAttribute('aria-label', it.fav ? 'Favorit entfernen' : 'Als Favorit merken');
    star.addEventListener('click', () => toggleFav(it.id));

    const del = document.createElement('button');
    del.className = 'del'; del.type = 'button'; del.textContent = '🗑';
    del.setAttribute('aria-label', 'Löschen');
    del.addEventListener('click', () => removeItem(it.id));

    li.append(drag, check, label, star, del);
    return li;
  }

  function refreshShopList() {
    const shops = new Set();
    items.forEach(i => i.shop && shops.add(i.shop));
    favorites.forEach(f => f.shop && shops.add(f.shop));
    shopList.innerHTML = '';
    [...shops].sort((a, b) => a.localeCompare(b, 'de')).forEach(s => {
      const o = document.createElement('option'); o.value = s; shopList.appendChild(o);
    });
  }

  // --- Aktionen ---
  function addItem(name, qty, shop) {
    name = (name || '').trim();
    if (!name) return;
    const selIdx = selectedId ? items.findIndex(i => i.id === selectedId) : -1;
    const finalShop = (shop || '').trim() || (selIdx >= 0 ? items[selIdx].shop : '');
    const it = { id: uid(), name, qty: (qty || '').trim() || '1', shop: finalShop, done: false, fav: false };
    if (selIdx >= 0) items.splice(selIdx + 1, 0, it); else items.push(it);
    selectedId = it.id;            // neu eingefügtes Element wird markiert
    saveItems(); saveSettings(); render();
  }

  function selectItem(id) {
    selectedId = (selectedId === id) ? null : id;  // erneutes Tippen hebt Auswahl auf
    saveSettings(); render();
  }

  function toggleDone(id) {
    const it = items.find(i => i.id === id);
    if (it) { it.done = !it.done; saveItems(); render(); }
  }

  function removeItem(id) {
    items = items.filter(i => i.id !== id);
    if (selectedId === id) selectedId = null;
    saveItems(); saveSettings(); render();
  }

  function clearDone() {
    const before = items.length;
    items = items.filter(i => !i.done);
    if (items.length === before) { toast('Keine erledigten Artikel'); return; }
    if (selectedId && !items.some(i => i.id === selectedId)) selectedId = null;
    saveItems(); saveSettings(); render();
    toast('Erledigte entfernt');
  }

  // --- Favoriten ---
  function favMatch(name, shop) {
    const n = name.trim().toLowerCase(), s = (shop || '').trim().toLowerCase();
    return f => f.name.trim().toLowerCase() === n && (f.shop || '').trim().toLowerCase() === s;
  }
  function toggleFav(id) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    it.fav = !it.fav;
    const idx = favorites.findIndex(favMatch(it.name, it.shop));
    if (it.fav) {
      if (idx === -1) favorites.push({ name: it.name, qty: it.qty, shop: it.shop });
      toast('Als Favorit gemerkt');
    } else if (idx !== -1) {
      favorites.splice(idx, 1);
    }
    saveItems(); saveFav(); render();
  }

  function addFavoriteToList(fav) {
    const selIdx = selectedId ? items.findIndex(i => i.id === selectedId) : -1;
    const it = { id: uid(), name: fav.name, qty: fav.qty || '1', shop: fav.shop || '', done: false, fav: true };
    if (selIdx >= 0) items.splice(selIdx + 1, 0, it); else items.push(it);
    selectedId = it.id;
    saveItems(); saveSettings(); render();
  }

  function renderFavSheet() {
    favListEl.innerHTML = '';
    if (!favorites.length) {
      const li = document.createElement('li');
      li.className = 'fav-empty';
      li.textContent = 'Noch keine Favoriten. Tippe bei einem Eintrag auf ☆.';
      favListEl.appendChild(li);
      return;
    }
    favorites.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'fav-item';
      const name = document.createElement('span');
      name.className = 'fav-name';
      name.textContent = f.name + (f.shop ? ` · ${f.shop}` : '');
      if (f.qty) { const q = document.createElement('span'); q.className = 'qty'; q.textContent = '× ' + f.qty; name.appendChild(q); }
      name.addEventListener('click', () => { addFavoriteToList(f); toast(`„${f.name}" hinzugefügt`); });
      const rm = document.createElement('button');
      rm.className = 'fav-rm'; rm.type = 'button'; rm.textContent = '🗑';
      rm.setAttribute('aria-label', 'Favorit löschen');
      rm.addEventListener('click', () => {
        favorites.splice(i, 1);
        items.forEach(it => { if (favMatch(f.name, f.shop)(it)) it.fav = false; });
        saveFav(); saveItems(); renderFavSheet(); render();
      });
      li.append(name, rm);
      favListEl.appendChild(li);
    });
  }

  function openFav() { renderFavSheet(); favSheet.hidden = false; }
  function closeFav() { favSheet.hidden = true; }

  // --- Drag & Drop (Touch + Maus via Pointer Events) ---
  let dragItem = null, dragEl = null, dragKey = null;
  function attachDrag(handle, li, it) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragItem = it; dragEl = li; dragKey = it.shop || '';
      li.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragEl) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const overLi = target && target.closest && target.closest('.item');
      if (!overLi || overLi === dragEl) return;
      if (grouped && overLi.dataset.shopkey !== dragKey) return; // nur innerhalb des Geschäfts
      const overItem = items.find(i => i.id === overLi.dataset.id);
      if (!overItem) return;
      const rect = overLi.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      // Array synchron halten
      items.splice(items.indexOf(dragItem), 1);
      let ti = items.indexOf(overItem);
      items.splice(before ? ti : ti + 1, 0, dragItem);
      // DOM synchron halten
      overLi.parentNode.insertBefore(dragEl, before ? overLi : overLi.nextSibling);
    });
    const end = () => {
      if (!dragEl) return;
      dragEl.classList.remove('dragging');
      dragItem = dragEl = dragKey = null;
      saveItems(); render();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // Gruppen-Reihenfolge per Drag der Überschrift
  let gDragSec = null;
  function attachGroupDrag(handle, section, key) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      gDragSec = section;
      section.classList.add('gdragging');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!gDragSec) return;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const overSec = t && t.closest && t.closest('.group');
      if (!overSec || overSec === gDragSec || overSec.parentNode !== gDragSec.parentNode) return;
      const r = overSec.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      gDragSec.parentNode.insertBefore(gDragSec, before ? overSec : overSec.nextSibling);
    });
    const end = () => {
      if (!gDragSec) return;
      gDragSec.classList.remove('gdragging');
      gDragSec = null;
      const seq = [...listWrap.querySelectorAll('.group')].map(s => s.dataset.shopkey);
      shopOrder = [...seq, ...shopOrder.filter(k => !seq.includes(k))]; // merken
      saveSettings(); render();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // --- CSV ---
  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV() {
    const rows = [['Artikel', 'Menge', 'Geschäft', 'Erledigt', 'Favorit']];
    for (const it of items) rows.push([it.name, it.qty, it.shop, it.done ? 'ja' : 'nein', it.fav ? 'ja' : 'nein']);
    return '﻿' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], field = '', inQuotes = false;
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function truthy(v) { return ['ja', 'yes', 'true', '1', 'x', 'erledigt'].includes((v || '').trim().toLowerCase()); }

  function importCSV(text) {
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
    if (!rows.length) { toast('Datei ist leer'); return; }

    // Spalten anhand der Kopfzeile zuordnen
    let start = 0, col = { name: 0, qty: 1, shop: 2, done: 3, fav: 4 };
    const head = rows[0].map(c => c.trim().toLowerCase());
    const find = (...names) => head.findIndex(h => names.includes(h));
    if (head.some(h => ['artikel', 'name', 'menge', 'geschäft', 'geschaeft', 'erledigt'].includes(h))) {
      start = 1;
      const map = { name: find('artikel', 'name'), qty: find('menge', 'anzahl'), shop: find('geschäft', 'geschaeft', 'laden', 'markt'), done: find('erledigt', 'done'), fav: find('favorit', 'favourite', 'favorite', 'star') };
      col = { name: map.name < 0 ? 0 : map.name, qty: map.qty, shop: map.shop, done: map.done, fav: map.fav };
    }

    const imported = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const name = (r[col.name] || '').trim();
      if (!name) continue;
      imported.push({
        id: uid(), name,
        qty: col.qty >= 0 ? (r[col.qty] || '').trim() : '',
        shop: col.shop >= 0 ? (r[col.shop] || '').trim() : '',
        done: col.done >= 0 ? truthy(r[col.done]) : false,
        fav: col.fav >= 0 ? truthy(r[col.fav]) : false
      });
    }
    if (!imported.length) { toast('Keine Artikel gefunden'); return; }

    const replace = items.length === 0 ||
      confirm(`${imported.length} Artikel importieren.\n\nOK = aktuelle Liste ersetzen\nAbbrechen = an Liste anhängen`);
    items = replace ? imported : items.concat(imported);
    // importierte Favoriten in den Favoritenspeicher übernehmen
    imported.forEach(it => { if (it.fav && favorites.findIndex(favMatch(it.name, it.shop)) === -1) favorites.push({ name: it.name, qty: it.qty, shop: it.shop }); });
    selectedId = null;
    saveItems(); saveFav(); saveSettings(); render();
    toast(`${imported.length} Artikel importiert`);
  }

  function filename() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `einkaufsliste_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`;
  }
  function downloadCSV() {
    const blob = new Blob([toCSV()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('CSV exportiert');
  }

  async function shareList() {
    if (!items.length) { toast('Liste ist leer'); return; }
    const file = new File([toCSV()], filename(), { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Einkaufsliste', text: 'Meine Einkaufsliste (CSV) – in der Einkaufslisten-App importieren.' });
        return;
      } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const textList = items.map(i => `${i.done ? '✅' : '⬜'} ${i.name}${i.qty ? ' × ' + i.qty : ''}${i.shop ? ' (' + i.shop + ')' : ''}`).join('\n');
    downloadCSV();
    window.open('https://wa.me/?text=' + encodeURIComponent('🛒 Einkaufsliste:\n' + textList), '_blank');
    toast('CSV gespeichert – Text an WhatsApp');
  }

  // --- Toast ---
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // --- Events ---
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addItem(itemInput.value, qtyInput.value, shopInput.value);
    itemInput.value = ''; qtyInput.value = '1';
    itemInput.focus();
  });

  btnGroup.addEventListener('click', () => {
    grouped = !grouped;
    btnGroup.classList.toggle('active', grouped);
    saveSettings(); render();
  });
  btnGroup.classList.toggle('active', grouped);

  document.getElementById('btn-fav').addEventListener('click', openFav);
  const favAutoload = document.getElementById('fav-autoload');
  favAutoload.checked = autoloadFav;
  favAutoload.addEventListener('change', () => {
    autoloadFav = favAutoload.checked;
    if (autoloadFav && items.length === 0 && favorites.length) {
      loadFavoritesIntoList(); saveItems();
      render(); renderFavSheet();
      toast('Autoload an – Favoriten geladen');
    } else {
      toast(autoloadFav ? 'Autoload eingeschaltet' : 'Autoload ausgeschaltet');
    }
    saveSettings();
  });
  document.getElementById('fav-add-all').addEventListener('click', () => {
    if (!favorites.length) { toast('Keine Favoriten vorhanden'); return; }
    favorites.forEach(f => addFavoriteToList(f));
    closeFav(); toast(`${favorites.length} Favoriten hinzugefügt`);
  });
  favSheet.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeFav));

  document.getElementById('btn-share').addEventListener('click', shareList);
  document.getElementById('btn-export').addEventListener('click', downloadCSV);
  document.getElementById('btn-clear-done').addEventListener('click', clearDone);
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCSV(String(reader.result || ''));
    reader.onerror = () => toast('Datei konnte nicht gelesen werden');
    reader.readAsText(file, 'utf-8');
    fileInput.value = '';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  }

  // Autoload beim Start: leere Liste mit Favoriten vorbelegen
  if (autoloadFav && items.length === 0 && favorites.length) {
    loadFavoritesIntoList();
    saveItems();
  }

  render();
})();
