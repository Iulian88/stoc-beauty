# PROJECT_CONTEXT.md

## Identitate

- **Nume aplicație**: StocBeauty
- **Scop**: Gestiune stoc și facturi pentru un salon / magazin beauty (RO)
- **URL producție**: https://stoc-beauty.vercel.app
- **GitHub**: https://github.com/Iulian88/stoc-beauty (branch: main)
- **Owner**: Iulian88 (denysucdeny-8859 pe Vercel)

---

## Stack tehnic

| Strat | Tehnologie |
|---|---|
| UI | React 18 + Vite 5 |
| PWA | vite-plugin-pwa |
| Hosting | Vercel (Hobby plan) |
| Serverless | Vercel Functions (`api/`) |
| OCR | Claude Vision (`claude-3-5-sonnet-20241022`) |
| Storage | localStorage (fără backend DB) |
| Auth | UNKNOWN — nu există autentificare implementată |
| CSS | CSS custom (fără framework) |

---

## Structura proiectului

```
stock-app/
  api/
    ocr.js              ← Vercel serverless function (POST /api/ocr)
  src/
    pages/
      Dashboard.jsx     ← Rezumat financiar + alerte stoc
      Stock.jsx         ← Catalog produse + stoc curent
      Transactions.jsx  ← Istoric tranzacții (PLU + facturi)
      Upload.jsx        ← Adaugă factură (OCR + manual)
      ZReports.jsx      ← Rapoarte Z zilnice
    services/
      ocr.js            ← Client OCR: compresie imagine → /api/ocr
      storage.js        ← CRUD localStorage + calcule financiare
    context/
      StockContext.jsx  ← Context global React
    components/
      ErrorBoundary.jsx
    constants.js        ← Praguri globale (LOW_STOCK, OCR_MATCH etc.)
    data/
      products.js       ← Catalog produse default
  public/
    manifest.json
    icon-192.png
    icon-512.png
  vercel.json           ← Build config + SPA rewrite + function timeout
  .env.local            ← CLAUDE_API_KEY (local only, în .gitignore)
```

---

## Date persistate (localStorage)

| Cheie | Conținut |
|---|---|
| `stoc_tranzactii` | Toate tranzacțiile (PLU + facturi) |
| `stoc_z_rapoarte` | Rapoarte Z zilnice |
| `stoc_produse_custom` | Produse adăugate manual |

---

## Variabile de mediu

| Variabilă | Unde | Valoare |
|---|---|---|
| `CLAUDE_API_KEY` | Vercel Environment Variables | cheie reală (sk-ant-...) |
| `CLAUDE_API_KEY` | `.env.local` | cheie reală locală |

---

## Constante cheie (`constants.js`)

- `MAX_FILE_SIZE_BYTES` = 5 MB
- `PAGINATION_PAGE_SIZE` = 20
- `LOW_STOCK_THRESHOLD` = 2
- `ZREPORT_TOLERANCE_RON` = 1.0 RON
- `OCR_MATCH_THRESHOLD` = 0.5
