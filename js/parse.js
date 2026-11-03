// Wyszukiwanie sumy w tekście z OCR polskiego paragonu.
// Czysta funkcja, bez DOM — testowana w Node (tests/parse.test.js).
(function (root) {
  'use strict';

  // Słowa kluczowe w kolejności ważności. Linie z PTU/VAT to podatek, nie suma.
  var RULES = [
    { re: /\b[S5][UV][MN][AĄ4]\b/i, score: 100 },                 // SUMA, SUMA PLN
    { re: /DO\s*ZAP[ŁL]A[TI]Y/i, score: 95 },                    // DO ZAPŁATY
    { re: /\bRAZEM\b/i, score: 90 },
    { re: /\bTOTAL\b/i, score: 85 },
    { re: /\bKART[AYĄ]\b|P[ŁL]ATNO[ŚS][ĆC]|\bBLIK\b/i, score: 70 },
    { re: /NALE[ŻZ]NO[ŚS][ĆC]|\bKWOTA\b/i, score: 65 },
    { re: /GOT[ÓO]WK[AĄ]/i, score: 40 }                          // gotówka bywa > sumy (reszta)
  ];
  var SKIP = /\bPTU\b|\bVAT\b|\bRESZTA\b|\bNIP\b|SPRZED|OPOD|\bRABAT\b|\bOPUST\b/i;

  // Poprawia typowe pomyłki OCR w tokenach wyglądających na kwotę (4S,9O -> 45,90).
  function fixToken(tok) {
    if (!/[,.]/.test(tok) || !/\d/.test(tok)) return tok;
    if (!/^[\dOoDlI|SsBZ,.\s]+$/.test(tok)) return tok;
    return tok
      .replace(/[OoD]/g, '0')
      .replace(/[lI|]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/B/g, '8')
      .replace(/Z/g, '2');
  }

  function normalizeLine(line) {
    return line
      .split(/(\s+)/)
      .map(fixToken)
      .join('')
      .replace(/(\d)\s*([,.])\s*(\d\d)(?!\d)/g, '$1$2$3'); // "45 , 99" -> "45,99"
  }

  // Zwraca kwoty w groszach znalezione w linii, pomijając daty (03.11.2026) i godziny.
  function amountsIn(line) {
    var out = [];
    var re = /(\d{1,6})[,.](\d{2})/g;
    var m;
    while ((m = re.exec(line))) {
      var before = line.slice(Math.max(0, m.index - 2), m.index);
      var after = line.slice(re.lastIndex, re.lastIndex + 2);
      if (/\d[.,\-/:]$/.test(before)) continue;   // środek daty
      if (/^[.,\-/:]?\d/.test(after)) continue;   // dalszy ciąg daty / liczby
      if (/^\d/.test(after)) continue;
      var grosze = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
      if (grosze > 0 && grosze < 10000000) out.push(grosze);
    }
    return out;
  }

  function last(arr) { return arr.length ? arr[arr.length - 1] : null; }

  // Niezależne sposoby policzenia sumy, używane do sprawdzenia odczytu słowa SUMA:
  //  - suma linii "Sprzedaż opodatkowana A/B/C" (brutto w każdej stawce),
  //  - gotówka minus reszta,
  //  - suma pozycji (kwota zakończona literą stawki: 12,99B).
  function crossChecks(lines) {
    var sprzed = 0, sprzedN = 0, cash = null, change = null, items = 0, itemsN = 0;
    lines.forEach(function (line) {
      var v = last(amountsIn(line));
      if (/SPRZED/i.test(line) && /OPOD/i.test(line) && !/\bPTU\b|\bVAT\b/i.test(line)) {
        if (v !== null) { sprzed += v; sprzedN++; }
        return;
      }
      if (/GOT[ÓO]WK/i.test(line) && v !== null) { cash = v; return; }
      if (/\bRESZTA\b/i.test(line) && v !== null) { change = v; return; }
      if (SKIP.test(line)) return;
      var m = /(\d{1,5})[,.](\d{2})\s?[A-G]\s*$/.exec(line);
      if (m && !RULES.some(function (r) { return r.re.test(line); })) {
        items += parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
        itemsN++;
      }
    });
    var out = [];
    if (sprzedN) out.push(sprzed);
    if (cash !== null && change !== null && cash > change) out.push(cash - change);
    if (itemsN) out.push(items);
    return out;
  }

  function findTotal(text) {
    var lines = String(text || '')
      .split(/\r?\n/)
      .map(function (l) { return normalizeLine(l.trim()); })
      .filter(Boolean);

    var candidates = [];
    lines.forEach(function (line, i) {
      if (SKIP.test(line)) return;
      for (var r = 0; r < RULES.length; r++) {
        if (!RULES[r].re.test(line)) continue;
        var amounts = amountsIn(line);
        var score = RULES[r].score;
        // Kwota czasem trafia do następnej linii.
        if (!amounts.length && lines[i + 1] && !SKIP.test(lines[i + 1])) {
          amounts = amountsIn(lines[i + 1]);
          score -= 5;
        }
        if (amounts.length) candidates.push({ value: last(amounts), score: score, line: line });
        break;
      }
    });
    candidates.sort(function (a, b) { return b.score - a.score || b.value - a.value; });

    var checks = crossChecks(lines);
    var verified = candidates.filter(function (c) { return checks.indexOf(c.value) !== -1; })[0];
    if (verified) return { grosze: verified.value, confident: true, line: verified.line };

    // Dwa niezależne wyliczenia dają tę samą kwotę -> cyfra w linii SUMA została źle odczytana.
    for (var a = 0; a < checks.length; a++) {
      for (var b = a + 1; b < checks.length; b++) {
        if (checks[a] === checks[b]) return { grosze: checks[a], confident: true, line: null };
      }
    }

    // Dwie linie ze słowem kluczowym (np. SUMA i KARTA) zgadzają się ze sobą.
    var best = candidates[0];
    if (best) {
      var agree = candidates.filter(function (c) { return c.value === best.value; }).length > 1;
      return { grosze: best.value, confident: agree || best.score >= 65, line: best.line };
    }

    // Brak słów kluczowych: największa kwota z linii, które nie są podatkiem ani resztą.
    var max = 0;
    lines.forEach(function (line) {
      if (SKIP.test(line)) return;
      amountsIn(line).forEach(function (v) { if (v > max) max = v; });
    });
    return max ? { grosze: max, confident: false, line: null } : null;
  }

  var api = { findTotal: findTotal, amountsIn: amountsIn, normalizeLine: normalizeLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReceiptParser = api;
})(this);
