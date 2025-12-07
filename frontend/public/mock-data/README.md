# Mock Data

Ten folder zawiera statyczne dane JSON używane w trybie demo/mock.

## Jak wygenerować dane?

1. Uruchom backend i frontend normalnie
2. Przeprowadź pełną analizę (stwórz sesję, wybierz tematy, wygeneruj raport)
3. Wywołaj endpoint eksportu:

```bash
curl -X POST http://localhost:8000/api/sessions/{SESSION_ID}/export
```

To stworzy wszystkie potrzebne pliki JSON w tym folderze.

## Jak uruchomić w trybie mock?

1. Stwórz plik `.env` w folderze `frontend/`:

```
VITE_MOCK_MODE=true
```

2. Uruchom frontend:

```bash
cd frontend
npm run dev
```

Frontend będzie teraz czytał dane z plików JSON zamiast łączyć się z backendem.

## Struktura plików

- `sessions.json` - lista sesji na stronie głównej
- `session-{id}.json` - szczegóły sesji
- `session-{id}-report.json` - raport końcowy
- `session-{id}-sources.json` - źródła użyte w raporcie
- `session-{id}-progress.json` - status przetwarzania (zawsze "done")
- `topic-{id}.json` - szczegóły tematu z URL-ami
- `topic-{id}-synthesis.json` - synteza tematu
- `topic-{id}-cached-summaries.json` - streszczenia artykułów

## Deployment jako statyczna strona

Aby wdrożyć aplikację jako statyczną stronę (bez backendu):

1. Wygeneruj dane mock używając backendu (jak wyżej)
2. Zbuduj frontend z trybem mock:

```bash
cd frontend
VITE_MOCK_MODE=true npm run build
```

3. Folder `dist/` zawiera gotową statyczną stronę
4. Wgraj na dowolny hosting statyczny (Netlify, Vercel, GitHub Pages, S3, etc.)

