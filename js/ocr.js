// Odczyt paragonu na telefonie: Tesseract.js (silnik OCR w WebAssembly).
// Biblioteka i polskie dane językowe pobierają się z CDN przy pierwszym użyciu,
// potem są w pamięci podręcznej (service worker + IndexedDB).
(function () {
  'use strict';

  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  var workerPromise = null;
  var progressCb = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Tesseract) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Nie udało się pobrać modułu OCR. Sprawdź internet.')); };
      document.head.appendChild(s);
    });
  }

  // Wywoływane już przy stuknięciu w aparat, żeby OCR ładował się w trakcie robienia zdjęcia.
  function warmUp() {
    if (!workerPromise) {
      workerPromise = loadScript(TESSERACT_URL)
        .then(function () {
          return window.Tesseract.createWorker('pol', 1, {
            logger: function (m) {
              if (progressCb && m.status === 'recognizing text') progressCb(m.progress);
            }
          });
        })
        .then(function (worker) {
          // PSM 6: jeden blok tekstu — w testach najlepszy dla paragonów.
          return worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
            .then(function () { return worker; });
        })
        .catch(function (err) { workerPromise = null; throw err; });
    }
    return workerPromise;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { reject(new Error('Nie udało się wczytać zdjęcia.')); };
      img.src = url;
    });
  }

  // Skalowanie do ~2000 px, skala szarości i rozciągnięcie kontrastu.
  function preprocess(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(2, 2000 / Math.max(w, h));
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);
    var data = ctx.getImageData(0, 0, cw, ch);
    var px = data.data, n = cw * ch;
    var gray = new Uint8ClampedArray(n), hist = new Uint32Array(256);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var g = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
      gray[i] = g; hist[gray[i]]++;
    }
    var lo = 0, hi = 255, acc = 0;
    for (var k = 0; k < 256; k++) { acc += hist[k]; if (acc >= n * 0.02) { lo = k; break; } }
    acc = 0;
    for (k = 255; k >= 0; k--) { acc += hist[k]; if (acc >= n * 0.02) { hi = k; break; } }
    var range = Math.max(1, hi - lo);
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var v = (gray[i] - lo) * 255 / range;
      px[j] = px[j + 1] = px[j + 2] = v; // Uint8ClampedArray sam przycina do 0–255
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  // Zwraca { grosze, confident } albo null, gdy nie znaleziono kwoty.
  function readTotal(file, onProgress) {
    progressCb = onProgress || null;
    var imgP = loadImage(file);
    return Promise.all([warmUp(), imgP]).then(function (res) {
      var worker = res[0], loaded = res[1];
      var canvas = preprocess(loaded.img);
      URL.revokeObjectURL(loaded.url);
      return worker.recognize(canvas);
    }).then(function (result) {
      progressCb = null;
      return window.ReceiptParser.findTotal(result.data.text);
    });
  }

  window.ReceiptOCR = { warmUp: warmUp, readTotal: readTotal };
})();
