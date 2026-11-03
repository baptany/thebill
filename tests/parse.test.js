// Uruchom: node tests/parse.test.js
const fs = require('fs');
const path = require('path');
const { findTotal } = require('../js/parse.js');

let failed = 0;
function check(name, text, expected) {
  const r = findTotal(text);
  const got = r ? r.grosze : null;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${name}: oczekiwano ${expected}, jest ${got}`);
}
const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

// Teksty z prawdziwego OCR (tesseract, pol, psm 6) testowych paragonów.
check('Biedronka, SUMA PLN', fx('paragon1.txt'), 4304);
check('Orlen, źle odczytana cyfra w DO ZAPŁATY, poprawiona z gotówki i sprzedaży', fx('paragon2.txt'), 3606);
check('Restauracja, SUMA: ... PLN', fx('paragon3.txt'), 7150);

check('suma w następnej linii', 'SUMA PLN\n  12,30\nKarta 12,30', 1230);
check('daty nie są kwotą', '03.11.2026 12:40\nRAZEM 9,99', 999);
check('SUMA PTU pomijana', 'SUMA PTU 3,63\nSUMA PLN 43,04', 4304);
check('pomyłki OCR w cyfrach', 'SUMA PLN 4S,9O', 4590);
check('bez słów kluczowych: największa kwota', 'Bułka 1,20\nKawa 9,50', 950);
check('pusty tekst', '', null);

process.exit(failed ? 1 : 0);
