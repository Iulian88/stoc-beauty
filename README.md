# StocBeauty — Gestiune Stoc PWA

Aplicație PWA mobile-first pentru gestiunea stocului de produse beauty, cu OCR local (Tesseract.js).

## Stack
- React 18 + Vite
- Tesseract.js (OCR local, gratuit, fără API)
- localStorage (date locale, nu se trimit nicăieri)
- vite-plugin-pwa (instalabil pe telefon ca app nativă)

## Cum funcționează
1. Fotografiezi factura sau raportul PLU
2. OCR extrage textul automat
3. Tu confirmi sau corectezi produsele detectate
4. Stocul se actualizează automat

## Deploy pe Vercel (recomandat)

### Varianta 1: GitHub + Vercel (cea mai simplă)
1. Creează un repository pe [github.com](https://github.com)
2. Urcă fișierele din acest folder
3. Mergi pe [vercel.com](https://vercel.com) → Import → selectează repo-ul
4. Vercel detectează automat Vite → Deploy

### Varianta 2: Vercel CLI
```bash
npm install -g vercel
cd stoc-beauty
npm install
vercel --prod
```

## Rulare locală
```bash
npm install
npm run dev
```

## Structura datelor (localStorage)
```json
{
  "stoc_tranzactii": [
    {
      "id": 1234567890,
      "tip": "intrare",  // sau "iesire"
      "sursa": "Factură #123",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "items": [
        {
          "productId": 1,
          "productName": "Color Radiance Conditioner 1000ml",
          "cantitate": 5,
          "pretAchizitie": 113.74,
          "pretVanzare": 73.93
        }
      ]
    }
  ]
}
```

## Extensibilitate
- **OCR → Claude Vision**: înlocuiește `runOCR()` din `src/services/ocr.js`
- **Storage → Supabase**: înlocuiește `src/services/storage.js` cu apeluri API
- **Produse noi**: adaugă în `src/data/products.js`

## Note importante
- Stocul NU se modifică direct — doar prin tranzacții
- Rapoartele Z nu sunt folosite pentru stoc (doar pentru venit)
- Confirmarea utilizatorului este OBLIGATORIE înainte de salvare
- Export JSON disponibil oricând pentru backup
