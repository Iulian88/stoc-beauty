const KEYS = {
  TRANSACTIONS: 'stoc_tranzactii',
  Z_REPORTS: 'stoc_z_rapoarte',
  CUSTOM_PRODUCTS: 'stoc_produse_custom',
};

export const storage = {
  getTransactions() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.TRANSACTIONS) || '[]');
    } catch { return []; }
  },

  saveTransaction(tranzactie) {
    const all = this.getTransactions();
    const nou = {
      ...tranzactie,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    all.push(nou);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all));
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
      id: Date.now(),
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
  },

  getZReports() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.Z_REPORTS) || '[]');
    } catch { return []; }
  },

  saveZReport(raport) {
    const all = this.getZReports();
    const nou = { ...raport, id: Date.now(), createdAt: new Date().toISOString() };
    all.push(nou);
    localStorage.setItem(KEYS.Z_REPORTS, JSON.stringify(all));
    return nou;
  },

  deleteZReport(id) {
    const all = this.getZReports().filter(r => r.id !== id);
    localStorage.setItem(KEYS.Z_REPORTS, JSON.stringify(all));
  },

  getCustomProducts() {
    try { return JSON.parse(localStorage.getItem(KEYS.CUSTOM_PRODUCTS) || '[]'); }
    catch { return []; }
  },

  saveCustomProduct({ name, pretAchizitie, pretVanzare }) {
    const all = this.getCustomProducts();
    const prod = {
      id: Date.now(),
      name,
      aliases: [],
      pretAchizitie: Number(Number(pretAchizitie).toFixed(2)),
      pretVanzare: Number(Number(pretVanzare).toFixed(2)),
      isCustom: true,
    };
    all.push(prod);
    localStorage.setItem(KEYS.CUSTOM_PRODUCTS, JSON.stringify(all));
    return prod;
  },

  exportJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      tranzactii: this.getTransactions(),
      rapoarteZ: this.getZReports(),
      produse_custom: this.getCustomProducts(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stoc-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(file) {
    return new Promise((resolve, reject) => {
      file.text().then(text => {
        try {
          const data = JSON.parse(text);

          // Schema validation
          if (data.tranzactii !== undefined && !Array.isArray(data.tranzactii)) {
            throw new Error('Format invalid: câmpul "tranzactii" trebuie să fie un array.');
          }
          if (data.rapoarteZ !== undefined && !Array.isArray(data.rapoarteZ)) {
            throw new Error('Format invalid: câmpul "rapoarteZ" trebuie să fie un array.');
          }

          if (Array.isArray(data.tranzactii)) {
            // Deduplicare: nu importa tranzacții cu id deja existent
            const existing = this.getTransactions();
            const existingIds = new Set(existing.map(t => t.id));
            const noi = data.tranzactii.filter(t => t.id && !existingIds.has(t.id));
            const merged = [...existing, ...noi];
            localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(merged));
            data._importedCount = noi.length;
            data._duplicatesSkipped = data.tranzactii.length - noi.length;
          }

          if (Array.isArray(data.rapoarteZ)) {
            const existing = this.getZReports();
            const existingIds = new Set(existing.map(r => r.id));
            const noi = data.rapoarteZ.filter(r => r.id && !existingIds.has(r.id));
            localStorage.setItem(KEYS.Z_REPORTS, JSON.stringify([...existing, ...noi]));
          }

          if (Array.isArray(data.produse_custom)) {
            const existing = this.getCustomProducts();
            const existingIds = new Set(existing.map(p => p.id));
            const noi = data.produse_custom.filter(p => p.id && !existingIds.has(p.id));
            localStorage.setItem(KEYS.CUSTOM_PRODUCTS, JSON.stringify([...existing, ...noi]));
          }

          resolve(data);
        } catch (err) { reject(err); }
      }).catch(reject);
    });
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
  }
};
