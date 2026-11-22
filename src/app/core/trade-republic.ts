/**
 * Lectura de la "Exportación de transacciones" (CSV) de Trade Republic.
 * Columnas (en cualquier orden): datetime, date, account_type, category, type, asset_class, name, symbol (ISIN),
 * shares, price, amount, fee, tax, currency, original_amount, original_currency, fx_rate, description, transaction_id, ...
 */

import { Dividend } from './models';

export interface ImportedTrade {
  id: string; // transaction_id de Trade Republic (para no importar dos veces)
  date: string;
  isin: string;
  name: string;
  assetClass: string;
  kind: 'aportacion' | 'retirada';
  /** Dinero que salió (compra, comisión incluida) o entró (venta, neto de comisión e impuestos), en `currency`. */
  amount: number;
  shares: number;
  currency: string;
  /** Recibido sin pagar (Saveback, regalos, acciones gratis). */
  free: boolean;
  type: string;
}

export interface ImportSummary {
  trades: ImportedTrade[];
  dividends: number;
  dividendList: Dividend[];
  interest: number;
  ignored: { label: string; count: number }[];
  currency: string;
}

export class ImportError extends Error {}

/** CSV con comillas y comas (RFC 4180). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const first = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.trim());
  return isFinite(n) ? n : 0;
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const IGNORED_LABELS: Record<string, string> = {
  CARD: 'Pagos con tarjeta',
  TRANSFER: 'Transferencias e ingresos',
  DEPOSIT: 'Ingresos de dinero',
  WITHDRAWAL: 'Retiradas de dinero',
  CORPORATE_ACTION: 'Operaciones corporativas (splits, vencimientos...)',
  TAX: 'Impuestos y ajustes fiscales',
  FEE: 'Comisiones sueltas',
};

function ignoredLabel(category: string, type: string): string {
  for (const [k, v] of Object.entries(IGNORED_LABELS)) if (type.includes(k) || category.includes(k)) return v;
  return `Otros (${category}${type ? ' / ' + type : ''})`;
}

export function parseTradeRepublic(text: string): ImportSummary {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ImportError('El archivo está vacío.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const required = ['date', 'category', 'type', 'symbol', 'shares', 'amount'];
  const missing = required.filter((r) => col(r) < 0);
  if (missing.length) {
    throw new ImportError(
      'Este archivo no parece la "Exportación de transacciones" de Trade Republic (faltan las columnas ' + missing.join(', ') + ').',
    );
  }
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');

  const trades: ImportedTrade[] = [];
  const ignored = new Map<string, number>();
  const seen = new Set<string>();
  let dividends = 0;
  const dividendList: Dividend[] = [];
  let interest = 0;
  const currencies = new Map<string, number>();

  for (const r of rows.slice(1)) {
    const category = get(r, 'category').toUpperCase();
    const type = get(r, 'type').toUpperCase();
    const assetClass = get(r, 'asset_class').toUpperCase();
    const symbol = get(r, 'symbol').toUpperCase();
    const shares = num(get(r, 'shares'));
    const amount = num(get(r, 'amount'));
    const fee = Math.abs(num(get(r, 'fee')));
    const tax = Math.abs(num(get(r, 'tax')));
    const price = num(get(r, 'price'));
    const currency = get(r, 'currency').toUpperCase() || 'EUR';
    const date = get(r, 'date') || get(r, 'datetime').slice(0, 10);
    const id = get(r, 'transaction_id') || `${date}-${symbol}-${shares}-${amount}`;
    if (seen.has(id)) continue;
    seen.add(id);

    if (type.includes('DIVIDEND') || type.includes('DISTRIBUTION')) {
      dividends += amount - tax;
      dividendList.push({ id, date, isin: symbol, name: get(r, 'name') || symbol, gross: round2(amount), withheld: round2(tax), currency, kind: 'dividendo' });
      continue;
    }
    if (type.includes('INTEREST')) {
      interest += amount - tax;
      // Intereses de la cuenta (no los cupones de bonos, que llevan ISIN).
      dividendList.push({ id, date, isin: symbol, name: get(r, 'name') || 'Intereses de la cuenta', gross: round2(amount), withheld: round2(tax), currency, kind: 'interes' });
      continue;
    }

    const isSecurity = ISIN.test(symbol) || (assetClass === 'CRYPTO' && !!symbol);
    const isTrade = category === 'TRADING' && isSecurity && shares !== 0;
    // Saveback, regalos de acciones, criptos gratis...: entran participaciones sin pagar.
    const isFreeDelivery = category === 'DELIVERY' && isSecurity && shares > 0;

    if (isTrade) {
      const sell = shares < 0 || type.includes('SELL');
      const gross = Math.abs(amount) || Math.abs(shares * price);
      trades.push({
        id,
        date,
        isin: symbol,
        name: get(r, 'name') || symbol,
        assetClass,
        kind: sell ? 'retirada' : 'aportacion',
        amount: round2(sell ? gross - fee - tax : gross + fee),
        shares: Math.abs(shares),
        currency,
        free: false,
        type,
      });
      currencies.set(currency, (currencies.get(currency) ?? 0) + 1);
    } else if (isFreeDelivery) {
      trades.push({
        id,
        date,
        isin: symbol,
        name: get(r, 'name') || symbol,
        assetClass,
        kind: 'aportacion',
        amount: round2(Math.abs(shares * price)),
        shares: Math.abs(shares),
        currency,
        free: true,
        type,
      });
    } else {
      const label = ignoredLabel(category, type);
      ignored.set(label, (ignored.get(label) ?? 0) + 1);
    }
  }

  trades.sort((a, b) => a.date.localeCompare(b.date));
  const mainCurrency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
  return {
    trades,
    dividends: round2(dividends),
    dividendList,
    interest: round2(interest),
    ignored: [...ignored.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    currency: mainCurrency,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
