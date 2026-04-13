# WORKFLOW.md

## Cum lucrăm

### Reguli generale
- Orice schimbare de cod merge prin `git commit + git push` → Vercel auto-deploy
- Nu modificăm fișiere direct pe Vercel sau GitHub UI
- `.env.local` nu se commitează niciodată (e în `.gitignore`)
- Secretele stau DOAR în Vercel Environment Variables și `.env.local`

---

## Flow deploy

```
edit cod local
  → git add + git commit
  → git push origin main
  → Vercel detectează push
  → build (~15s)
  → deploy automat la stoc-beauty.vercel.app
```

---

## Flow OCR (factură)

```
User selectează imagine (cameră sau galerie)
  → compressImage() în src/services/ocr.js
  → base64 encode
  → POST /api/ocr { imageBase64, mediaType, type: 'invoice' }
  → api/ocr.js apelează Claude Vision API
  → Claude returnează JSON { factura, produse }
  → runClaudeOCR() mapează produse pe catalog local
  → Upload.jsx afișează rezultate pentru review
  → User confirmă → saveTransaction()
```

## Flow OCR (Z-report)

```
User selectează imagine bon Z
  → POST /api/ocr { ..., type: 'zreport' }
  → Claude returnează { total: number }
  → ZReports.jsx salvează raportul
```

---

## Comenzi utile

```bash
# Dev local (fără OCR serverless)
npm run dev

# Dev local CU OCR (necesită Vercel CLI)
vercel dev

# Build producție
npm run build

# Push și deploy
git add -A && git commit -m "mesaj" && git push
```

---

## Structura unui commit bun

```
tip: descriere scurtă în română sau engleză

Exemple:
feat: adaugă export CSV la tranzacții
fix: corectează calcul marjă în Dashboard
chore: update dependențe
```

---

## Debugging OCR în producție

1. Vercel Dashboard → **Logs** → filtrează `/api/ocr`
2. Click pe request roșu → citește `console.log`-urile din funcție
3. Mesajele cheie: `START OCR`, `Has API key:`, `Claude response status:`, `Claude raw response:`
