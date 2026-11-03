# thebill: minimalistyczna aplikacja do śledzenia wydatków

PWA dla iPhone'a (instalowana przez Safari → „Do ekranu początkowego”), hostowana na GitHub Pages.

## Ikona
- Źródło: `icons/icon-1024.png` (PNG, 1024×1024, kwadrat bez przezroczystości i bez zaokrągleń, bo iOS zaokrągla sam).
- Z niego powstają: `apple-touch-icon.png` 180×180 (iPhone), `icon-192.png`, `icon-512.png` i `icon-maskable-512.png` (znak w środkowych 80%).
- Obecna ikona: „$” w foncie Michroma, biały na `#191919`.

## Zasady
- Czysty HTML/CSS/JS, bez frameworków i bez kroku budowania. Pliki działają tak, jak leżą w repozytorium.
- Dane tylko w telefonie: `localStorage`, klucz `wydatki.v1`. Nie zmieniaj go: nowy klucz ukryje zapisane dane. Bez serwera, logowania i bazy danych.
- Kwoty zapisywane w groszach (liczby całkowite), waluta PLN, interfejs po polsku.
- Ciemne tło `#191919`, białe napisy. Cały wygląd sterują zmienne CSS na początku `css/styles.css`; zmiany wyglądu (np. z Figmy) zaczynamy od nich.
- Pola tekstowe mają co najmniej 16px, bo inaczej iOS przybliża stronę.

## Struktura
- `index.html`: widok główny i trzy arkusze (dodawanie, edycja, ustawienia).
- `js/app.js`: dane, renderowanie, przepływy dodawania i edycji, kategorie, kopia zapasowa.
- `js/ocr.js`: Tesseract.js 7.0.0 z jsDelivr (język `pol`, PSM 6) i obróbka zdjęcia (skala, szarość, kontrast).
- `js/parse.js`: wyszukiwanie sumy w tekście z OCR. Słowa kluczowe (SUMA, DO ZAPŁATY…), pomija PTU i reszty, sprawdza wynik sumą „Sprzedaż opodatkowana”, gotówką minus resztą i sumą pozycji.
- `sw.js`: pamięć podręczna offline.
- `tests/parse.test.js`: testy parsera (`node tests/parse.test.js`); w `tests/fixtures` są teksty z prawdziwego OCR.

## Przepływ dodawania
Zdjęcie → OCR → „Czy suma jest poprawna?” (Tak / Nie, poprawię) → wybór kategorii → zapis z datą „teraz”.
Ręcznie: przycisk „+” → kwota → kategoria.

## Wydawanie zmian
1. Podbij `VERSION` w `sw.js` i `APP_VERSION` w `js/app.js` (te same wartości). Bez tego telefon nie pobierze zmian.
2. Jeśli dodajesz nowy plik, dopisz go do `APP_FILES` w `sw.js`.
3. Uruchom `node tests/parse.test.js`, zrób commit i push do `main`. GitHub Pages opublikuje zmiany w 1–2 minuty.
