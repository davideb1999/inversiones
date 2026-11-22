import { Asset, Dividend, Movement, addDays } from './models';

/**
 * Fiscalidad española (IRPF) de las inversiones, simplificada.
 * Tramos de la base del ahorro vigentes desde 2025 (ganancias, dividendos e intereses).
 */
export const SAVINGS_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 6_000, rate: 0.19 },
  { upTo: 50_000, rate: 0.21 },
  { upTo: 200_000, rate: 0.23 },
  { upTo: 300_000, rate: 0.27 },
  { upTo: Infinity, rate: 0.3 },
];

/** Impuesto sobre una base del ahorro (progresivo por tramos). */
export function savingsTax(base: number): number {
  if (base <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of SAVINGS_BRACKETS) {
    const slice = Math.min(base, b.upTo) - prev;
    if (slice <= 0) break;
    tax += slice * b.rate;
    prev = b.upTo;
  }
  return round2(tax);
}

/** Tipo marginal (el que se paga por el siguiente euro). */
export function marginalRate(base: number): number {
  return (SAVINGS_BRACKETS.find((b) => base < b.upTo) ?? SAVINGS_BRACKETS.at(-1)!).rate;
}

/** Comparación: rescatar toda la ganancia en un año o repartirla en varios. */
export function rescuePlan(gain: number, years: number): { oneYear: number; spread: number; saving: number; perYear: number } {
  const oneYear = savingsTax(gain);
  const perYear = gain / Math.max(1, years);
  const spread = round2(savingsTax(perYear) * Math.max(1, years));
  return { oneYear, spread, saving: round2(oneYear - spread), perYear: round2(perYear) };
}

export interface Sale {
  assetId: string;
  assetName: string;
  isin?: string;
  type: Asset['type'];
  date: string;
  shares?: number;
  proceeds: number; // valor de transmisión (neto de gastos)
  cost?: number; // valor de adquisición (con gastos), por FIFO
  gain?: number;
  /** Pérdida que no se puede declarar este año por haber recomprado en ±2 meses (art. 33.5 LIRPF). */
  washSale: boolean;
  missingData: boolean;
}

/** Participaciones reales de un movimiento (las del bróker si se importó; si no, las apuntadas). */
function realShares(m: Movement, asset: Asset): number | undefined {
  if (m.realShares) return m.realShares;
  // En activos que siguen a un equivalente, `shares` son del equivalente: no sirven para FIFO.
  return asset.tracking ? undefined : m.shares;
}

/**
 * Ventas de un activo con su ganancia o pérdida por FIFO (lo primero que compraste es lo primero que vendes),
 * que es el método obligatorio en España para valores homogéneos.
 */
export function salesOf(asset: Asset): Sale[] {
  const lots: { date: string; shares: number; cost: number }[] = [];
  const out: Sale[] = [];
  const moves = [...asset.movements].sort((a, b) => a.date.localeCompare(b.date));
  let broken = false;
  for (const m of moves) {
    const sh = realShares(m, asset);
    if (m.kind === 'aportacion') {
      if (!sh) {
        broken = true;
        continue;
      }
      lots.push({ date: m.date, shares: sh, cost: m.amount });
      continue;
    }
    const sale: Sale = {
      assetId: asset.id,
      assetName: asset.name,
      isin: asset.isin,
      type: asset.type,
      date: m.date,
      shares: sh,
      proceeds: m.amount,
      washSale: false,
      missingData: false,
    };
    if (!sh || broken) {
      sale.missingData = true;
      out.push(sale);
      continue;
    }
    let left = sh;
    let cost = 0;
    while (left > 1e-9 && lots.length) {
      const lot = lots[0];
      const take = Math.min(left, lot.shares);
      const part = lot.cost * (take / lot.shares);
      cost += part;
      lot.cost -= part;
      lot.shares -= take;
      left -= take;
      if (lot.shares <= 1e-9) lots.shift();
    }
    if (left > 1e-6) {
      sale.missingData = true;
      out.push(sale);
      continue;
    }
    sale.cost = round2(cost);
    sale.gain = round2(m.amount - cost);
    if (sale.gain < 0) {
      // Regla de los 2 meses: la pérdida se aplaza si sigues teniendo participaciones compradas en los 2 meses
      // anteriores o compras más en los 2 meses siguientes. Las que acabas de vender no cuentan.
      const from = addDays(m.date, -61);
      const to = addDays(m.date, 61);
      const keptRecent = lots.some((l) => l.date >= from && l.shares > 1e-9);
      const boughtAfter = moves.some((x) => x.kind === 'aportacion' && x.date > m.date && x.date <= to);
      sale.washSale = keptRecent || boughtAfter;
    }
    out.push(sale);
  }
  return out;
}

export interface YearSummary {
  year: number;
  sales: Sale[];
  gains: number; // suma de ganancias
  losses: number; // suma de pérdidas computables (negativo)
  deferredLosses: number; // pérdidas por recompra en 2 meses (no computan este año)
  netGains: number;
  dividendsGross: number;
  interestGross: number;
  foreignWithholding: number;
  /** Retenciones españolas ya pagadas (p. ej. 19 % sobre intereses): se restan del resultado. */
  spanishWithholding: number;
  /** Lo que saldría a pagar (o a devolver si es negativo) por estas inversiones. */
  toPay: number;
  dividends: Dividend[];
  /** Base del ahorro tras compensar (25 % cruzado entre ganancias y dividendos/intereses). */
  base: number;
  lossesToCarry: number;
  tax: number;
  missing: number;
}

export function yearSummary(year: number, assets: Asset[], dividends: Dividend[]): YearSummary {
  const y = String(year);
  const sales = assets.flatMap((a) => salesOf(a)).filter((s) => s.date.startsWith(y)).sort((a, b) => a.date.localeCompare(b.date));
  const valid = sales.filter((s) => s.gain !== undefined);
  const gains = round2(valid.filter((s) => s.gain! > 0).reduce((a, s) => a + s.gain!, 0));
  const losses = round2(valid.filter((s) => s.gain! < 0 && !s.washSale).reduce((a, s) => a + s.gain!, 0));
  const deferredLosses = round2(valid.filter((s) => s.gain! < 0 && s.washSale).reduce((a, s) => a + s.gain!, 0));
  const netGains = round2(gains + losses);
  const divs = dividends.filter((d) => d.date.startsWith(y));
  const dividendsGross = round2(divs.filter((d) => d.kind !== 'interes').reduce((a, d) => a + d.gross, 0));
  const interestGross = round2(divs.filter((d) => d.kind === 'interes').reduce((a, d) => a + d.gross, 0));
  const foreignWithholding = round2(divs.filter((d) => d.kind !== 'interes').reduce((a, d) => a + d.withheld, 0));

  // Compensación: el saldo negativo de un bloque compensa hasta el 25 % del positivo del otro.
  let g = netGains;
  let r = dividendsGross + interestGross;
  let carry = 0;
  if (g < 0) {
    const off = Math.min(-g, 0.25 * Math.max(r, 0));
    r -= off;
    carry = -g - off;
    g = 0;
  }
  const base = round2(Math.max(g, 0) + Math.max(r, 0));
  // Lo retenido fuera (p. ej. 15 % en EE. UU.) se deduce, con el límite del impuesto español sobre ese dividendo.
  const spanishWithholding = round2(divs.filter((d) => d.kind === 'interes').reduce((a, d) => a + d.withheld, 0));
  const tax = round2(Math.max(0, savingsTax(base) - Math.min(foreignWithholding, dividendsGross * 0.19)));
  return {
    year,
    sales,
    gains,
    losses,
    deferredLosses,
    netGains,
    dividendsGross,
    interestGross,
    foreignWithholding,
    spanishWithholding,
    toPay: round2(tax - spanishWithholding),
    dividends: divs,
    base,
    lossesToCarry: round2(carry),
    tax,
    missing: sales.filter((s) => s.missingData).length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
