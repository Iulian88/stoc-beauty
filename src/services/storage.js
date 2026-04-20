import { syncUpsert, syncDelete } from './supabase';

const KEYS = {
  TRANSACTIONS: 'stoc_tranzactii',
  Z_REPORTS: 'stoc_z_rapoarte',
  CUSTOM_PRODUCTS: 'stoc_produse_custom',
  LEARNED_ALIASES: 'stoc_learned_aliases',
};

// Module-level dirty flag — true when localStorage has changes not yet exported as backup.
let _hasUnsavedChanges = false;

export const storage = {
  getHasUnsavedChanges() { return _hasUnsavedChanges; },

  getTransactions() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.TRANSACTIONS) || '[]');
    } catch { return []; }
  },

  saveTransaction(tranzactie) {
    // Validate negative stock for outgoing transactions (skip for stornare / inventory corrections)
    if (tranzactie.tip === 'iesire' && !tranzactie._stornare && !tranzactie._skipStockValidation && Array.isArray(tranzactie.items)) {
      const currentTx = this.getTransactions();
      const stockById = {};
      currentTx.forEach(t => {
        t.items?.forEach(item => {
          stockById[item.productId] = (stockById[item.productId] || 0)
            + (t.tip === 'intrare' ? item.cantitate : -item.cantitate);
        });
      });
      for (const item of tranzactie.items) {
        const current = stockById[item.productId] ?? 0;
        if (current - item.cantitate < 0) {
          throw new Error(`Stoc insuficient pentru "${item.productName}": disponibil ${Math.max(0, current)} buc, cerut ${item.cantitate} buc.`);
        }
      }
    }

    const all = this.getTransactions();
    // Strip internal runtime flags before persisting
    const { _skipStockValidation: _s, ...rest } = tranzactie;
    const nou = {
      ...rest,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    all.push(nou);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all));
    syncUpsert('tranzactii', nou);
    _hasUnsavedChanges = true;
    return nou;
  },

  deleteTransaction(id) {
    const all = this.getTransactions();
    const target = all.find(t => t.id === id);

    // Prevent deletion if it would cause negative stock
    if (target?.tip === 'intrare' && target.items?.length) {
      const withoutTarget = all.filter(t => t.id !== id);
      const wouldGoNegative = target.items.some(item => {
        let net = 0;
        withoutTarget.forEach(t => {
          t.items?.forEach(i => {
            if (i.productId !== item.productId) return;
            net += t.tip === 'intrare' ? i.cantitate : -i.cantitate;
          });
        });
        return net < 0;
      });
      if (wouldGoNegative) {
        alert('Nu se poate șterge această intrare: stocul ar deveni negativ.\nȘterge mai întâi ieșirile corespunzătoare.');
        return;
      }
    }

    // When deleting a stornare, restore the original to active
    let updated = all.filter(t => t.id !== id);
    if (target?._stornare && target._storneazaId) {
      updated = updated.map(t =>
        t.id === target._storneazaId ? { ...t, _stornat: false } : t
      );
    }

    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(updated));
    syncDelete('tranzactii', id);
    // If a stornare was reversed (_stornat restored), re-sync that original too
    if (target?._stornare && target._storneazaId) {
      const restored = updated.find(t => t.id === target._storneazaId);
      if (restored) syncUpsert('tranzactii', restored);
    }
    _hasUnsavedChanges = true;
  },

  // Creates a reversal (stornare) for a transaction.
  // The reversal has the opposite tip so computeStock automatically cancels it out.
  // Mark original as _stornat: true to visually grey it out in the UI.
  createStornare(originalId) {
    const all = this.getTransactions();
    const original = all.find(t => t.id === originalId);
    if (!original) throw new Error('Tranzacție inexistentă.');
    if (original._stornat) throw new Error('Tranzacția este deja stornată.');
    if (original._stornare) throw new Error('Nu se poate storna o corecție — șterge-o direct.');

    const stornare = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      // Opposite tip so stock calculation cancels the original naturally
      tip: original.tip === 'intrare' ? 'iesire' : 'intrare',
      sursa: `Corecție: ${original.sursa}`,
      items: original.items,
      _stornare: true,
      _storneazaId: originalId,
    };

    const updated = all.map(t =>
      t.id === originalId ? { ...t, _stornat: true } : t
    );
    updated.push(stornare);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(updated));
    syncUpsert('tranzactii', stornare);
    const updatedOriginal = updated.find(t => t.id === originalId);
    if (updatedOriginal) syncUpsert('tranzactii', updatedOriginal);
    _hasUnsavedChanges = true;
    return stornare;
  },

  // Edit only metadata fields that do not affect stock calculations.
  editTransactionMeta(id, fields) {
    const ALLOWED = ['sursa'];
    const all = this.getTransactions();
    const patch = {};
    ALLOWED.forEach(k => { if (k in fields) patch[k] = String(fields[k]).trim(); });
    const updated = all.map(t => t.id === id ? { ...t, ...patch } : t);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(updated));
    const patched = updated.find(t => t.id === id);
    if (patched) syncUpsert('tranzactii', patched);
    _hasUnsavedChanges = true;
  },

  getZReports() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.Z_REPORTS) || '[]');
    } catch { return []; }
  },

  saveZReport(raport) {
    const all = this.getZReports();
    const nou = { ...raport, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    all.push(nou);
    localStorage.setItem(KEYS.Z_REPORTS, JSON.stringify(all));
    syncUpsert('z_rapoarte', nou);
    return nou;
  },

  deleteZReport(id) {
    const all = this.getZReports().filter(r => r.id !== id);
    localStorage.setItem(KEYS.Z_REPORTS, JSON.stringify(all));
    syncDelete('z_rapoarte', id);
  },

  getCustomProducts() {
    try { return JSON.parse(localStorage.getItem(KEYS.CUSTOM_PRODUCTS) || '[]'); }
    catch { return []; }
  },

  saveCustomProduct({ name, pretVanzare }) {
    const all = this.getCustomProducts();
    const prod = {
      id: crypto.randomUUID(),
      name,
      aliases: [],
      isCustom: true,
      ...(pretVanzare > 0 ? { pretVanzare } : {}),
    };
    all.push(prod);
    localStorage.setItem(KEYS.CUSTOM_PRODUCTS, JSON.stringify(all));
    syncUpsert('produse_custom', prod);
    return prod;
  },

  getLearnedAliases() {
    try { return JSON.parse(localStorage.getItem(KEYS.LEARNED_ALIASES) || '{}'); }
    catch { return {}; }
  },

  addAliasToProduct(productId, alias) {
    const cleanAlias = (alias || '').trim().toLowerCase();
    if (!cleanAlias) return;

    // 1. Update learned aliases map (works for both static and custom products)
    const learned = this.getLearnedAliases();
    const key = String(productId);
    const existing = (learned[key] || []).map(a => a.toLowerCase());
    if (!existing.includes(cleanAlias)) {
      learned[key] = [...(learned[key] || []), cleanAlias];
      localStorage.setItem(KEYS.LEARNED_ALIASES, JSON.stringify(learned));
    }

    // 2. Also update custom product's aliases array (if it's a custom product)
    const all = this.getCustomProducts();
    const idx = all.findIndex(p => p.id === productId);
    if (idx >= 0) {
      const prod = all[idx];
      const aliases = (prod.aliases || []).map(a => a.toLowerCase());
      if (!aliases.includes(cleanAlias)) {
        all[idx] = { ...prod, aliases: [...(prod.aliases || []), cleanAlias] };
        localStorage.setItem(KEYS.CUSTOM_PRODUCTS, JSON.stringify(all));
        syncUpsert('produse_custom', all[idx]);
      }
    }
  },

  exportJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: this.getTransactions(),
      productsCustom: this.getCustomProducts(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stoc-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    _hasUnsavedChanges = false;
  },

  // Validates and REPLACES all local data from a parsed backup JSON.
  // Supports both new format (transactions/productsCustom) and old format (tranzactii/produse_custom).
  importJSON(data) {
    const rawTransactions = data.transactions ?? data.tranzactii;
    const rawProducts = data.productsCustom ?? data.produse_custom;

    if (!Array.isArray(rawTransactions)) {
      throw new Error('Format invalid: lipsește câmpul "transactions" (array obligatoriu).');
    }

    // Validate each transaction and its items
    for (let i = 0; i < rawTransactions.length; i++) {
      const t = rawTransactions[i];
      if (!t.id) throw new Error(`Tranzacție ${i + 1}: lipsește câmpul "id".`);
      if (!t.tip) throw new Error(`Tranzacție ${i + 1}: lipsește câmpul "tip".`);
      if (!Array.isArray(t.items)) throw new Error(`Tranzacție ${i + 1}: câmpul "items" trebuie să fie array.`);
      for (let j = 0; j < t.items.length; j++) {
        const item = t.items[j];
        if (item.productId === undefined) throw new Error(`Tranzacție ${i + 1}, item ${j + 1}: lipsește "productId".`);
        if (item.cantitate === undefined) throw new Error(`Tranzacție ${i + 1}, item ${j + 1}: lipsește "cantitate".`);
      }
    }

    // Fix duplicate IDs by generating new UUIDs
    const seenIds = new Set();
    const transactions = rawTransactions.map(t => {
      if (seenIds.has(t.id)) return { ...t, id: crypto.randomUUID() };
      seenIds.add(t.id);
      return t;
    });

    // REPLACE — not merge
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(transactions));
    if (Array.isArray(rawProducts)) {
      localStorage.setItem(KEYS.CUSTOM_PRODUCTS, JSON.stringify(rawProducts));
    }

    _hasUnsavedChanges = false; // restored from backup = clean state
    return { count: transactions.length };
  },

  // Compute stock for all products
  computeStock(products) {
    const transactions = this.getTransactions();
    const stock = {};
    
    products.forEach(p => {
      stock[p.id] = { product: p, intrari: 0, iesiri: 0, stoc: 0 };
    });

    transactions.forEach(t => {
      t.items?.forEach(item => {
        if (!stock[item.productId]) return;
        if (t.tip === 'intrare') {
          stock[item.productId].intrari += item.cantitate;
        } else if (t.tip === 'iesire') {
          stock[item.productId].iesiri += item.cantitate;
        }
      });
    });

    Object.keys(stock).forEach(id => {
      stock[id].stoc = stock[id].intrari - stock[id].iesiri;
      stock[id].isNegative = stock[id].stoc < 0;
    });

    return stock;
  },

  // Profit brut calculat din prețurile snapshot din tranzacții
  // venit = suma pretVanzare × cantitate din ieșiri
  // cost  = suma pretAchizitie × cantitate din ieșiri
  computeProfitBrut() {
    const f = this.computeFinancials();
    return {
      venit: f.venituri,
      cost: f.costuriVandute,
      profitBrut: f.profitBrut,
    };
  },

  // Financial summary used by Dashboard.
  // All stornate/stornare transactions are excluded — they cancel each other.
  //
  // MONEY IN:  venituri  = PLU sales at pretVanzare  (cash received from customers)
  // MONEY OUT: cheltuieli = Invoice totals at pretAchizitie (cash paid to suppliers)
  //
  // COGS (costuriVandute): cost of items actually sold, at pretAchizitie.
  //   Different from cheltuieli — you may have bought stock not yet sold.
  //
  // profitBrut = venituri - costuriVandute  (correct gross profit)
  // fluxNet    = venituri - cheltuieli       (overall cash in/out position)
  computeFinancials() {
    const transactions = this.getTransactions()
      .filter(t => !t._stornat && !t._stornare);

    let venituri = 0;       // money IN: sales at sell price
    let costuriVandute = 0; // COGS: cost of sold items at purchase price
    let cheltuieli = 0;     // money OUT: invoices at purchase price

    transactions.forEach(t => {
      t.items?.forEach(item => {
        const cant = item.cantitate || 0;
        if (t.tip === 'iesire') {
          venituri      += (item.pretVanzare   || 0) * cant;
          costuriVandute += (item.pretAchizitie || 0) * cant;
        } else if (t.tip === 'intrare') {
          cheltuieli += (item.pretAchizitie || 0) * cant;
        }
      });
    });

    const profitBrut = venituri - costuriVandute;
    const marja = venituri > 0 ? (profitBrut / venituri) * 100 : 0;
    const fluxNet = venituri - cheltuieli;

    return {
      venituri:        parseFloat(venituri.toFixed(2)),
      cheltuieli:      parseFloat(cheltuieli.toFixed(2)),
      costuriVandute:  parseFloat(costuriVandute.toFixed(2)),
      profitBrut:      parseFloat(profitBrut.toFixed(2)),
      marja:           parseFloat(marja.toFixed(1)),
      fluxNet:         parseFloat(fluxNet.toFixed(2)),
    };
  },

  // Stock value using weighted average purchase cost from TRANSACTION history.
  // This replaces the old approach of using product.pretAchizitie (catalog).
  // stockMap = result of computeStock(): { [productId]: { product, stoc, ... } }
  computeWeightedStockValue(stockMap) {
    const transactions = this.getTransactions()
      .filter(t => !t._stornat && !t._stornare && t.tip === 'intrare');

    // Build weighted average purchase cost per product from all purchase transactions
    const costBasis = {}; // productId → { totalCost, totalQty }
    transactions.forEach(t => {
      t.items?.forEach(item => {
        if (!item.productId || !item.pretAchizitie) return;
        if (!costBasis[item.productId]) costBasis[item.productId] = { totalCost: 0, totalQty: 0 };
        costBasis[item.productId].totalCost += (item.pretAchizitie || 0) * (item.cantitate || 0);
        costBasis[item.productId].totalQty += item.cantitate || 0;
      });
    });

    let total = 0;
    Object.entries(stockMap).forEach(([id, s]) => {
      if (s.stoc <= 0) return;
      const cb = costBasis[id] || costBasis[Number(id)];
      if (cb && cb.totalQty > 0) {
        const avgCost = cb.totalCost / cb.totalQty;
        total += s.stoc * avgCost;
      } else {
        // No purchase history with a real invoice price → cost unknown, excluded from total
        // Catalog pretAchizitie intentionally NOT used here (values are inflated/unreliable)
      }
    });

    return parseFloat(total.toFixed(2));
  },

  // Migration: run ONCE at app start to back-fill missing pretVanzare snapshots
  // on old transactions saved before the architecture refactor.
  // allProducts = [...PRODUCTS, ...getCustomProducts()]
  migrateOldTransactions(allProducts) {
    const all = this.getTransactions();
    const productMap = {};
    (allProducts || []).forEach(p => { productMap[p.id] = p; });

    const toSync = [];
    let anyChanged = false;

    const migrated = all.map(t => {
      if (!Array.isArray(t.items)) return t;
      let tChanged = false;
      const newItems = t.items.map(item => {
        // Only patch pretVanzare — pretAchizitie is left as-is (null is intentional per Step 1)
        if (item.pretVanzare != null) return item;
        const product = productMap[item.productId];
        if (!product) return item;
        tChanged = true;
        return { ...item, pretVanzare: product.pretVanzare ?? 0 };
      });
      if (!tChanged) return t;
      anyChanged = true;
      const migratedT = { ...t, items: newItems };
      toSync.push(migratedT);
      return migratedT;
    });

    if (anyChanged) {
      localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(migrated));
      // Sync patched transactions to Supabase (fire-and-forget)
      toSync.forEach(t => syncUpsert('tranzactii', t));
    }
  },
};
