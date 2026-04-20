import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { storage } from '../services/storage';
import { PRODUCTS } from '../data/products';
// hydrateFromSupabase is intentionally disabled:
// Supabase id column is bigint but transactions now use UUID strings,
// so all syncs fail silently and hydration would overwrite localStorage
// with stale pre-UUID data, causing data loss.
// Supabase remains a passive write-side backup only (syncUpsert / syncDelete).

const StockContext = createContext(null);

export function StockProvider({ children }) {
  // A simple counter: incrementing it forces all derived data to recompute
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    // Migration: back-fill missing pretVanzare snapshots on old transactions (runs once)
    storage.migrateOldTransactions([...PRODUCTS, ...storage.getCustomProducts()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const transactions = useMemo(() => storage.getTransactions(), [tick]);
  const zReports = useMemo(() => storage.getZReports(), [tick]);
  const stock = useMemo(() => storage.computeStock([...PRODUCTS, ...storage.getCustomProducts()]), [tick]);

  const value = useMemo(
    () => ({ stock, transactions, zReports, refresh }),
    [stock, transactions, zReports, refresh]
  );

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export function useStock() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error('useStock trebuie folosit în interiorul StockProvider');
  return ctx;
}
