// Praguri și limite globale — modifcă aici dacă vrei să ajustezi comportamentul aplicației

/** Dimensiunea maximă acceptată pentru un fișier imagine (în bytes). */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Numărul de tranzacții afișate per pagină în Istoricul tranzacțiilor. */
export const PAGINATION_PAGE_SIZE = 20;

/** Sub această cantitate (inclusiv), un produs apare în alerta "Stoc scăzut". */
export const LOW_STOCK_THRESHOLD = 2;

/** Toleranță acceptată (RON) la compararea totalului Z cu totalul PLU. */
export const ZREPORT_TOLERANCE_RON = 1.0;

/** Prag minim de similitudine (0-1) pentru potrivirea fuzzy a produselor din OCR. */
export const OCR_MATCH_THRESHOLD = 0.5;
