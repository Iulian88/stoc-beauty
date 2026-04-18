import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { storage } from '../services/storage';
import { PRODUCTS } from '../data/products';
import { hydrateFromSupabase } from '../services/supabase';

const StockContext = createContext(null);

export function StockProvider({ children }) {
  // A simple counter: incrementing it forces all derived data to recompute
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  // On first mount: pull cloud data → hydrate localStorage → refresh UI
  useEffect(() => {
    hydrateFromSupabase().then(ok => { if (ok) refresh(); });
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
