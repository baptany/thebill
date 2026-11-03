(function () {
  'use strict';

  var APP_VERSION = '1.0.0'; // zmieniaj razem z VERSION w sw.js
  var KEY = 'wydatki.v1';
  var DEFAULT_CATEGORIES = ['Jedzenie', 'Transport', 'Dom', 'Rozrywka', 'Inne'];

  var $ = function (id) { return document.getElementById(id); };
  var money = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
  var monthFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
  var dayFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  var timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

  // ---------- Dane ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function defaultData() {
    return {
      version: 1,
      categories: DEFAULT_CATEGORIES.map(function (name) { return { id: uid(), name: name }; }),
      entries: []
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.categories) && Array.isArray(d.entries)) return d;
      }
    } catch (e) { /* uszkodzone dane: zaczynamy od nowa */ }
    return defaultData();
  }

  var data = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      toast('Nie udało się zapisać — brak miejsca w pamięci.');
    }
  }

  function categoryById(id) {
    for (var i = 0; i < data.categories.length; i++) if (data.categories[i].id === id) return data.categories[i];
    return null;
  }
  function categoryName(id) { var c = categoryById(id); return c ? c.name : 'Bez kategorii'; }

  // ---------- Kwoty i daty ----------
  function parseAmount(str) {
    var s = String(str || '').replace(/\s|zł/gi, '').replace(',', '.');
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
    var g = Math.round(parseFloat(s) * 100);
    return g > 0 && g < 100000000 ? g : null;
  }
  function amountToInput(g) { return (g / 100).toFixed(2).replace('.', ','); }
  function fmt(g) { return money.format(g / 100); }

  function entriesWord(n) {
    var d = n % 10, dd = n % 100;
    if (n === 1) return '1 wpis';
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return n + ' wpisy';
    return n + ' wpisów';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toLocalInput(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fromLocalInput(s) { var d = new Date(s); return isNaN(d) ? null : d; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function dayLabel(d) {
    var today = new Date();
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (dayKey(d) === dayKey(today)) return 'Dziś';
    if (dayKey(d) === dayKey(y)) return 'Wczoraj';
    return dayFmt.format(d);
  }

  // ---------- Widok główny ----------
  var now = new Date();
  var view = { y: now.getFullYear(), m: now.getMonth() };
  var filterCat = null;

  function monthEntries() {
    return data.entries
      .filter(function (e) { var d = new Date(e.date); return d.getFullYear() === view.y && d.getMonth() === view.m; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }

  function render() {
    var today = new Date();
    $('monthLabel').textContent = monthFmt.format(new Date(view.y, view.m, 1));
    $('nextMonth').disabled = view.y > today.getFullYear() ||
      (view.y === today.getFullYear() && view.m >= today.getMonth());

    var list = monthEntries();
    var total = list.reduce(function (s, e) { return s + e.amount; }, 0);
    $('total').textContent = fmt(total);
    $('totalLabel').textContent = 'Wydatki w miesiącu';

    // Sumy w kategoriach
    var sums = {};
    list.forEach(function (e) { sums[e.categoryId] = (sums[e.categoryId] || 0) + e.amount; });
    var ids = Object.keys(sums).sort(function (a, b) { return sums[b] - sums[a]; });
    if (filterCat && !sums[filterCat]) filterCat = null;
    var max = ids.length ? sums[ids[0]] : 1;
    var bd = $('breakdown');
    bd.innerHTML = '';
    ids.forEach(function (id) {
      var li = document.createElement('li');
      if (filterCat === id) li.className = 'active';
      else if (filterCat) li.className = 'dim';
      var b = document.createElement('button');
      b.innerHTML = '<span class="name"></span><span class="sum"></span><span class="bar"><i></i></span>';
      b.querySelector('.name').textContent = categoryName(id);
      b.querySelector('.sum').textContent = fmt(sums[id]);
      b.querySelector('.bar i').style.transform = 'scaleX(' + (sums[id] / max) + ')';
      b.setAttribute('aria-pressed', filterCat === id ? 'true' : 'false');
      b.addEventListener('click', function () { filterCat = filterCat === id ? null : id; render(); });
      li.appendChild(b);
      bd.appendChild(li);
    });

    // Lista, pogrupowana po dniach
    var shown = filterCat ? list.filter(function (e) { return e.categoryId === filterCat; }) : list;
    var box = $('entries');
    box.innerHTML = '';
    if (!shown.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Brak wydatków w tym miesiącu.';
      box.appendChild(p);
      return;
    }
    var groups = [];
    shown.forEach(function (e) {
      var d = new Date(e.date), k = dayKey(d);
      var g = groups[groups.length - 1];
      if (!g || g.key !== k) { g = { key: k, date: d, items: [], sum: 0 }; groups.push(g); }
      g.items.push(e); g.sum += e.amount;
    });
    groups.forEach(function (g) {
      var sec = document.createElement('div');
      sec.className = 'day';
      var head = document.createElement('div');
      head.className = 'day-head';
      head.innerHTML = '<span></span><span></span>';
      head.children[0].textContent = dayLabel(g.date);
      head.children[1].textContent = fmt(g.sum);
      sec.appendChild(head);
      g.items.forEach(function (e) {
        var b = document.createElement('button');
        b.className = 'entry';
        b.innerHTML = '<span><span class="cat"></span><span class="time"></span></span><span class="amt"></span>';
        b.querySelector('.cat').textContent = categoryName(e.categoryId);
        var t = b.querySelector('.time');
        t.textContent = timeFmt.format(new Date(e.date));
        if (e.source === 'photo') {
          t.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-label="z paragonu"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>');
        }
        b.querySelector('.amt').textContent = fmt(e.amount);
        b.addEventListener('click', function () { openEdit(e.id); });
        sec.appendChild(b);
      });
      box.appendChild(sec);
    });
  }

  function shiftMonth(delta) {
    var d = new Date(view.y, view.m + delta, 1);
    view = { y: d.getFullYear(), m: d.getMonth() };
    filterCat = null;
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Arkusze ----------
  var reloadPending = false;

  function openSheet(el) {
    $('toast').hidden = true;
    el.hidden = false;
    el.classList.remove('closing');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet(el) {
    if (el.hidden || el.classList.contains('closing')) return;
    el.classList.add('closing');
    if (document.activeElement) document.activeElement.blur();
    setTimeout(function () {
      el.hidden = true;
      el.classList.remove('closing');
      if (!document.querySelector('.sheet:not([hidden])')) {
        document.body.style.overflow = '';
        if (reloadPending) location.reload();
      }
    }, 220);
    if (el.id === 'addSheet') resetAdd();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () { closeSheet(b.closest('.sheet')); });
  });

  // ---------- Dodawanie ----------
  var add = null;      // { source, date, amount, token }
  var thumbUrl = null;

  function showStep(name) {
    Array.prototype.forEach.call($('addSheet').querySelectorAll('.step'), function (s) {
      s.classList.toggle('active', s.getAttribute('data-step') === name);
    });
  }

  function resetAdd() {
    if (add) add.token = null;
    add = null;
    if (thumbUrl) { URL.revokeObjectURL(thumbUrl); thumbUrl = null; }
  }

  function setAmountMode(mode, hint) {
    // mode: 'confirm' (OCR odczytał kwotę) | 'edit' (wpisywanie / poprawianie)
    var field = $('amountInput').parentNode;
    field.classList.remove('invalid');
    field.classList.toggle('locked', mode === 'confirm');
    $('amountInput').readOnly = mode === 'confirm';
    $('amountNo').hidden = mode !== 'confirm';
    $('amountYes').textContent = mode === 'confirm' ? 'Tak' : 'Dalej';
    $('confirmBtns').style.gridTemplateColumns = mode === 'confirm' ? '' : '1fr';
    $('amountHint').textContent = hint || '';
  }

  function startAdd(source) {
    resetAdd();
    add = { source: source, date: new Date(), amount: null, token: {} };
    $('amountInput').value = '';
    $('addDate').value = add.dateInput = toLocalInput(add.date);
    openSheet($('addSheet'));
  }

  function startManual() {
    startAdd('manual');
    $('addTitle').textContent = 'Ile wydałeś?';
    setAmountMode('edit');
    showStep('amount');
    $('amountInput').focus();
  }

  function startPhoto(file) {
    startAdd('photo');
    var token = add.token;
    thumbUrl = URL.createObjectURL(file);
    $('receiptThumb').src = thumbUrl;
    var prog = $('ocrProgress');
    prog.parentNode.classList.add('indeterminate');
    prog.style.transform = '';
    showStep('reading');

    window.ReceiptOCR.readTotal(file, function (p) {
      prog.parentNode.classList.remove('indeterminate');
      prog.style.transform = 'scaleX(' + p + ')';
    }).then(function (res) {
      if (!add || add.token !== token) return;
      if (res) {
        $('addTitle').textContent = 'Czy suma jest poprawna?';
        $('amountInput').value = amountToInput(res.grosze);
        setAmountMode('confirm', res.confident ? '' : 'Nie mam pewności co do odczytu — sprawdź kwotę.');
      } else {
        $('addTitle').textContent = 'Wpisz sumę';
        setAmountMode('edit', 'Nie udało się odczytać sumy z paragonu.');
      }
      showStep('amount');
      if (!res) $('amountInput').focus();
    }).catch(function (err) {
      if (!add || add.token !== token) return;
      $('addTitle').textContent = 'Wpisz sumę';
      setAmountMode('edit', (err && err.message) || 'Odczyt paragonu nie powiódł się.');
      showStep('amount');
    });
  }

  function unlockAmount() {
    setAmountMode('edit');
    $('addTitle').textContent = 'Popraw sumę';
    var inp = $('amountInput');
    inp.focus();
    inp.setSelectionRange(0, inp.value.length);
  }

  function confirmAmount() {
    var g = parseAmount($('amountInput').value);
    if (!g) {
      $('amountInput').parentNode.classList.add('invalid');
      $('amountHint').textContent = 'Wpisz kwotę, np. 24,99';
      return;
    }
    add.amount = g;
    // Datę z pola bierzemy tylko, gdy ktoś ją zmienił (pole ma dokładność do minuty).
    if ($('addDate').value !== add.dateInput) add.date = fromLocalInput($('addDate').value) || add.date;
    $('amountInput').blur();
    $('categoryAmount').textContent = fmt(g) + ' · ' + dayLabel(add.date).toLowerCase() + ', ' + timeFmt.format(add.date);
    renderCategoryGrid();
    showStep('category');
  }

  function renderCategoryGrid() {
    var grid = $('categoryGrid');
    grid.innerHTML = '';
    data.categories.forEach(function (c, i) {
      var b = document.createElement('button');
      b.textContent = c.name;
      b.style.animationDelay = (i * 30) + 'ms';
      b.addEventListener('click', function () { saveNew(c.id); });
      grid.appendChild(b);
    });
  }

  function saveNew(categoryId) {
    var entry = {
      id: uid(),
      amount: add.amount,
      categoryId: categoryId,
      date: add.date.toISOString(),
      source: add.source
    };
    data.entries.push(entry);
    save();
    closeSheet($('addSheet'));
    var d = new Date(entry.date);
    view = { y: d.getFullYear(), m: d.getMonth() };
    filterCat = null;
    render();
    toast('Zapisano ' + fmt(entry.amount) + ' · ' + categoryName(categoryId), 'Cofnij', function () {
      data.entries = data.entries.filter(function (e) { return e.id !== entry.id; });
      save(); render();
    });
  }

  $('photoBtn').addEventListener('click', function () {
    window.ReceiptOCR.warmUp().catch(function () { /* błąd pokażemy po zdjęciu */ });
    $('photoInput').value = '';
    $('photoInput').click();
  });
  $('photoInput').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) startPhoto(f);
  });
  $('manualBtn').addEventListener('click', startManual);
  $('amountNo').addEventListener('click', unlockAmount);
  $('amountInput').addEventListener('click', function () { if (this.readOnly) unlockAmount(); });
  $('amountInput').addEventListener('input', function () {
    this.parentNode.classList.remove('invalid');
  });
  $('amountInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmAmount(); });
  $('amountYes').addEventListener('click', confirmAmount);

  // ---------- Edycja ----------
  var editing = null;
  var editCat = null;
  var editDateInitial = null;

  function openEdit(id) {
    editing = data.entries.filter(function (e) { return e.id === id; })[0];
    if (!editing) return;
    editCat = editing.categoryId;
    $('editAmount').value = amountToInput(editing.amount);
    $('editAmount').parentNode.classList.remove('invalid');
    $('editDate').value = editDateInitial = toLocalInput(new Date(editing.date));
    renderEditChips();
    resetDeleteBtn();
    openSheet($('editSheet'));
  }

  function renderEditChips() {
    var box = $('editCategories');
    box.innerHTML = '';
    data.categories.forEach(function (c) {
      var b = document.createElement('button');
      b.textContent = c.name;
      if (c.id === editCat) b.className = 'selected';
      b.addEventListener('click', function () { editCat = c.id; renderEditChips(); });
      box.appendChild(b);
    });
  }

  $('editSave').addEventListener('click', function () {
    var g = parseAmount($('editAmount').value);
    if (!g) { $('editAmount').parentNode.classList.add('invalid'); return; }
    if ($('editDate').value !== editDateInitial) {
      var d = fromLocalInput($('editDate').value);
      if (d) editing.date = d.toISOString();
    }
    editing.amount = g;
    editing.categoryId = editCat || editing.categoryId;
    save();
    closeSheet($('editSheet'));
    render();
    toast('Zapisano zmiany');
  });

  var deleteTimer = null;
  function resetDeleteBtn() {
    clearTimeout(deleteTimer);
    $('editDelete').textContent = 'Usuń wpis';
    $('editDelete').dataset.armed = '';
  }
  $('editDelete').addEventListener('click', function () {
    var btn = this;
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Dotknij ponownie, aby usunąć';
      deleteTimer = setTimeout(resetDeleteBtn, 3000);
      return;
    }
    var removed = editing;
    data.entries = data.entries.filter(function (e) { return e.id !== removed.id; });
    save();
    closeSheet($('editSheet'));
    render();
    toast('Usunięto ' + fmt(removed.amount), 'Cofnij', function () {
      data.entries.push(removed); save(); render();
    });
  });

  // ---------- Ustawienia: kategorie ----------
  function renderCategoryList() {
    var ul = $('categoryList');
    ul.innerHTML = '';
    data.categories.forEach(function (c) {
      var li = document.createElement('li');
      var inp = document.createElement('input');
      inp.value = c.name;
      inp.maxLength = 24;
      inp.setAttribute('aria-label', 'Nazwa kategorii');
      inp.addEventListener('change', function () {
        var name = inp.value.trim();
        if (!name || nameTaken(name, c.id)) { inp.value = c.name; if (name) toast('Taka kategoria już istnieje'); return; }
        c.name = name; save(); render();
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });

      var del = document.createElement('button');
      del.className = 'del';
      del.textContent = 'Usuń';
      var timer = null;
      del.addEventListener('click', function () {
        if (data.categories.length === 1) { toast('Musi zostać co najmniej jedna kategoria'); return; }
        var count = data.entries.filter(function (e) { return e.categoryId === c.id; }).length;
        var fallback = fallbackFor(c.id);
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm');
          del.textContent = count ? 'Usunąć? ' + entriesWord(count) + ' → ' + fallback.name : 'Usunąć?';
          timer = setTimeout(function () { del.classList.remove('confirm'); del.textContent = 'Usuń'; }, 3000);
          return;
        }
        clearTimeout(timer);
        data.entries.forEach(function (e) { if (e.categoryId === c.id) e.categoryId = fallback.id; });
        data.categories = data.categories.filter(function (x) { return x.id !== c.id; });
        save(); renderCategoryList(); render();
      });

      li.appendChild(inp);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function nameTaken(name, exceptId) {
    return data.categories.some(function (c) { return c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase(); });
  }

  // Gdzie trafiają wpisy z usuwanej kategorii: do „Inne”, a jeśli jej nie ma — do pierwszej pozostałej.
  function fallbackFor(id) {
    var others = data.categories.filter(function (c) { return c.id !== id; });
    return others.filter(function (c) { return c.name.toLowerCase() === 'inne'; })[0] || others[0];
  }

  $('addCategoryForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('newCategory').value.trim();
    if (!name) return;
    if (nameTaken(name)) { toast('Taka kategoria już istnieje'); return; }
    data.categories.push({ id: uid(), name: name });
    save();
    $('newCategory').value = '';
    renderCategoryList();
  });

  $('openSettings').addEventListener('click', function () {
    renderCategoryList();
    openSheet($('settingsSheet'));
  });

  // ---------- Kopia zapasowa ----------
  function stamp() { return dayKey(new Date()); }

  function shareOrDownload(blob, filename) {
    var file;
    try { file = new File([blob], filename, { type: blob.type }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function () { /* anulowano */ });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  $('exportJson').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    shareOrDownload(blob, 'wydatki-kopia-' + stamp() + '.json');
  });

  $('exportCsv').addEventListener('click', function () {
    var rows = [['Data', 'Godzina', 'Kategoria', 'Kwota']];
    data.entries.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).forEach(function (e) {
      var d = new Date(e.date);
      rows.push([dayKey(d), timeFmt.format(d), categoryName(e.categoryId), amountToInput(e.amount)]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    // BOM, żeby Excel i Numbers poprawnie pokazały polskie znaki.
    shareOrDownload(new Blob(['﻿' + csv], { type: 'text/csv' }), 'wydatki-' + stamp() + '.csv');
  });

  $('importBtn').addEventListener('click', function () { $('importInput').value = ''; $('importInput').click(); });
  $('importInput').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || !Array.isArray(d.categories) || !Array.isArray(d.entries)) throw new Error('format');
      // Łączenie zamiast nadpisywania: nic, co już jest w telefonie, nie zginie.
      var catIds = {}, entIds = {}, added = 0;
      data.categories.forEach(function (c) { catIds[c.id] = true; });
      data.entries.forEach(function (x) { entIds[x.id] = true; });
      d.categories.forEach(function (c) {
        if (c && c.id && typeof c.name === 'string' && !catIds[c.id]) { data.categories.push({ id: c.id, name: c.name }); catIds[c.id] = true; }
      });
      d.entries.forEach(function (x) {
        if (!x || !x.id || entIds[x.id] || !Number.isInteger(x.amount) || isNaN(new Date(x.date))) return;
        data.entries.push({
          id: x.id, amount: x.amount,
          categoryId: catIds[x.categoryId] ? x.categoryId : fallbackFor(null).id,
          date: x.date, source: x.source === 'photo' ? 'photo' : 'manual'
        });
        entIds[x.id] = true; added++;
      });
      save(); renderCategoryList(); render();
      toast('Wczytano ' + entriesWord(added));
    }).catch(function () { toast('To nie jest plik kopii z tej aplikacji'); });
  });

  // ---------- Komunikat ----------
  var toastTimer = null;
  function toast(text, actionLabel, action) {
    var el = $('toast'), btn = $('toastAction');
    $('toastText').textContent = text;
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || '';
    btn.onclick = function () { el.hidden = true; if (action) action(); };
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, actionLabel ? 5000 : 2500);
  }

  // ---------- Start ----------
  $('prevMonth').addEventListener('click', function () { shiftMonth(-1); });
  $('nextMonth').addEventListener('click', function () { shiftMonth(1); });
  $('appVersion').textContent = APP_VERSION;
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  if (!localStorage.getItem(KEY)) save();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return; // pierwsza instalacja — nic nie przeładowujemy
      if (document.querySelector('.sheet:not([hidden])')) reloadPending = true;
      else location.reload();
    });
  }
})();
