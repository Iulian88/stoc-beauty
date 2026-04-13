# MEMORY.md

## Decizii tehnice luate

### OCR
- **Tesseract eliminat** → înlocuit cu Claude Vision (`claude-3-5-sonnet-20241022`)
- Motivul: Tesseract nu recunoștea bine textul din facturi românești scanate/fotografiate
- Modelul curent: `claude-3-5-sonnet-20241022` (upgradat de la haiku din cauza calității)
- Timeout funcție Vercel setat la **60 secunde** în `vercel.json` (Hobby plan default = 10s, prea puțin)

### Mobile UX
- Un singur `<input capture="environment">` bloca galeria pe telefon
- Soluție: două input-uri separate — `cameraRef` (cu capture) + `fileRef` (fără capture)

### Routing SPA
- Vercel returna 404 la refresh pe rute `/stock`, `/upload` etc.
- Soluție: rewrite în `vercel.json`: `{ source: "/(.*)", destination: "/index.html" }`

### PWA Icons
- `icon-192.png` și `icon-512.png` lipseau → generate din `icon.svg` cu `sharp` (dezinstalat după)

### Securitate API key
- Cheia Claude a fost expusă accidental în chat
- Cheia a fost revocată și înlocuită
- Codul a fost verificat: cheia **nu a fost niciodată commitată** în git
- Regula: cheia stă DOAR în `process.env.CLAUDE_API_KEY`

---

## Probleme cunoscute

| Problemă | Status | Notă |
|---|---|---|
| 502 Bad Gateway la `/api/ocr` | **În investigare** | Logging adăugat, cauza exactă necunoscută încă |
| Domain `app.esellroyal.ro` | **Pending** | User trebuie să configureze DNS CNAME → `cname.vercel-dns.com` |
| Auth / login | **Lipsă** | Aplicația e publică, fără autentificare |
| Backup date | **Lipsă** | Datele sunt doar în localStorage — se pierd la clear browser |

---

## Ce NU s-a schimbat intenționat

- `storage.js` — logica de stoc e deliberat simplă (fără WAC/FIFO implementat)
- Prețul de achiziție din catalog (`pretAchizitie`) se actualizează manual, nu automat la fiecare factură

---

## Istoric probleme rezolvate

- HMR broken în Vite → rezolvat cu configurare `vite.config.js`
- Bundle prea mare cu Tesseract (93 module) → acum 42 module după eliminare
- Text "Tesseract se descarcă local" rămas în UI → șters, înlocuit cu mesaj Claude
- Funcție OCR fără logging → acum are log complet + try/catch global

---

## UNKNOWN (informații lipsă)

- Cine sunt utilizatorii finali (număr, locație)
- Dacă există cerințe de GDPR/ANSPDCP
- Plan de backup pentru datele din localStorage
- Dacă se dorește autentificare în viitor
