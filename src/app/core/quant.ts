import { Injectable, inject } from '@angular/core';
import { MarketDataService, PricePoint } from './market-data.service';
import { Horizon, addDays, today, toISODate } from './models';

/**
 * Modelo de oportunidades sin IA: "tendencia ajustada al riesgo" (momentum).
 * Para cada valor se mira cuánto ha subido en una ventana pasada y se divide entre lo que se ha movido
 * (volatilidad). Los que suben de forma más sostenida puntúan más. Solo usa precios hasta la fecha
 * de cálculo, así que se puede simular "qué habría recomendado hace un año" sin mirar el futuro.
 */

/** Acciones y ETF grandes de EE. UU. (precio gratuito). SPY es la referencia del mercado. */
export const UNIVERSE: { symbol: string; name: string; type: 'accion' | 'etf' }[] = [
  { symbol: 'AAPL', name: 'Apple', type: 'accion' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'accion' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'accion' },
  { symbol: 'AMZN', name: 'Amazon', type: 'accion' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', type: 'accion' },
  { symbol: 'META', name: 'Meta (Facebook)', type: 'accion' },
  { symbol: 'AVGO', name: 'Broadcom', type: 'accion' },
  { symbol: 'TSLA', name: 'Tesla', type: 'accion' },
  { symbol: 'AMD', name: 'AMD', type: 'accion' },
  { symbol: 'NFLX', name: 'Netflix', type: 'accion' },
  { symbol: 'JPM', name: 'JPMorgan', type: 'accion' },
  { symbol: 'V', name: 'Visa', type: 'accion' },
  { symbol: 'LLY', name: 'Eli Lilly', type: 'accion' },
  { symbol: 'UNH', name: 'UnitedHealth', type: 'accion' },
  { symbol: 'XOM', name: 'ExxonMobil', type: 'accion' },
  { symbol: 'COST', name: 'Costco', type: 'accion' },
  { symbol: 'WMT', name: 'Walmart', type: 'accion' },
  { symbol: 'KO', name: 'Coca-Cola', type: 'accion' },
  { symbol: 'PG', name: 'Procter & Gamble', type: 'accion' },
  { symbol: 'QQQ', name: 'Nasdaq 100 (ETF)', type: 'etf' },
  { symbol: 'SMH', name: 'Semiconductores (ETF)', type: 'etf' },
  { symbol: 'XLE', name: 'Energía (ETF)', type: 'etf' },
  { symbol: 'GLD', name: 'Oro (ETF)', type: 'etf' },
];
export const BENCHMARK = 'SPY';

/** Días de bolsa que se mantiene cada idea, y ventana de tendencia que mira el modelo. */
export const HORIZON_RULES: Record<Horizon, { hold: number; lookback: number; skip: number; label: string }> = {
  diario: { hold: 1, lookback: 21, skip: 0, label: 'el último mes' },
  semanal: { hold: 5, lookback: 63, skip: 0, label: 'los últimos 3 meses' },
  mensual: { hold: 21, lookback: 126, skip: 5, label: 'los últimos 6 meses' },
  anual: { hold: 252, lookback: 252, skip: 21, label: 'el último año' },
};

export interface Aligned {
  dates: string[];
  closes: Record<string, (number | undefined)[]>;
}

export interface Pick {
  symbol: string;
  name: string;
  type: 'accion' | 'etf';
  score: number;
  momentum: number; // %
  volatility: number; // % anual
  aboveTrend: boolean;
  price: number;
}

/** Junta las series en un calendario común (el de SPY), arrastrando el último precio conocido. */
export function align(series: Record<string, PricePoint[]>, benchmark = BENCHMARK): Aligned {
  const master = series[benchmark] ?? Object.values(series)[0] ?? [];
  const dates = master.map((p) => toISODate(new Date(p.t)));
  const closes: Aligned['closes'] = {};
  for (const [sym, pts] of Object.entries(series)) {
    const byDate = new Map(pts.map((p) => [toISODate(new Date(p.t)), p.close]));
    let last: number | undefined;
    closes[sym] = dates.map((d) => {
      const v = byDate.get(d);
      if (v !== undefined) last = v;
      return last;
    });
  }
  return { dates, closes };
}

function volatility(c: (number | undefined)[], i: number, window = 63): number | undefined {
  const rets: number[] = [];
  for (let k = Math.max(1, i - window + 1); k <= i; k++) {
    const a = c[k - 1];
    const b = c[k];
    if (a && b) rets.push(b / a - 1);
  }
  if (rets.length < 20) return undefined;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function sma(c: (number | undefined)[], i: number, n: number): number | undefined {
  if (i - n + 1 < 0) return undefined;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    if (c[k] === undefined) return undefined;
    s += c[k]!;
  }
  return s / n;
}

/** Puntúa todos los valores usando solo datos hasta el índice `i`. */
export function rank(a: Aligned, i: number, horizon: Horizon): Pick[] {
  const { lookback, skip } = HORIZON_RULES[horizon];
  const out: Pick[] = [];
  for (const u of UNIVERSE) {
    const c = a.closes[u.symbol];
    if (!c) continue;
    const end = c[i - skip];
    const start = c[i - lookback];
    const price = c[i];
    const vol = volatility(c, i);
    if (!end || !start || !price || vol === undefined) continue;
    const momentum = end / start - 1;
    const trend = sma(c, i, 200);
    const aboveTrend = trend === undefined ? true : price > trend;
    const score = momentum / Math.max(vol, 0.1) + (aboveTrend ? 0.15 : -0.3);
    out.push({ ...u, score, momentum: momentum * 100, volatility: vol * 100, aboveTrend, price });
  }
  return out.sort((x, y) => y.score - x.score);
}

export interface BacktestPeriod {
  from: string;
  to: string;
  picks: { symbol: string; ret: number }[];
  ret: number; // media de las ideas, %
  benchmark: number; // SPY, %
}

export interface Backtest {
  horizon: Horizon;
  periods: BacktestPeriod[];
  /** Valor de 1.000 € siguiendo las ideas vs. el S&P 500. */
  curve: { t: number; model: number; market: number }[];
  totalReturn: number;
  marketReturn: number;
  hitRate: number; // % de ideas que subieron
  beatRate: number; // % de periodos que batieron al mercado
  picks: number;
}

/**
 * Simula el último año: en cada fecha se eligen las 5 mejores ideas con lo que se sabía ese día,
 * se mantienen el plazo del horizonte y se mide qué pasó después.
 */
export function backtest(a: Aligned, horizon: Horizon, topN = 5, days = 252): Backtest | null {
  const { hold } = HORIZON_RULES[horizon];
  const last = a.dates.length - 1;
  const start = last - days;
  const bench = a.closes[BENCHMARK];
  if (start < HORIZON_RULES[horizon].lookback + 1 || !bench) return null;
  const periods: BacktestPeriod[] = [];
  let model = 1000;
  let market = 1000;
  const curve = [{ t: new Date(a.dates[start] + 'T12:00:00').getTime(), model, market }];
  let ups = 0;
  let total = 0;
  for (let i = start; i + hold <= last; i += hold) {
    const picks = rank(a, i, horizon).slice(0, topN);
    if (!picks.length) continue;
    const rets = picks.map((p) => {
      const exit = a.closes[p.symbol][i + hold]!;
      return { symbol: p.symbol, ret: (exit / p.price - 1) * 100 };
    });
    const ret = rets.reduce((s, r) => s + r.ret, 0) / rets.length;
    const b = (bench[i + hold]! / bench[i]! - 1) * 100;
    ups += rets.filter((r) => r.ret > 0).length;
    total += rets.length;
    model *= 1 + ret / 100;
    market *= 1 + b / 100;
    periods.push({ from: a.dates[i], to: a.dates[i + hold], picks: rets, ret, benchmark: b });
    curve.push({ t: new Date(a.dates[i + hold] + 'T12:00:00').getTime(), model, market });
  }
  if (!periods.length) return null;
  return {
    horizon,
    periods,
    curve,
    totalReturn: (model / 1000 - 1) * 100,
    marketReturn: (market / 1000 - 1) * 100,
    hitRate: total ? (ups / total) * 100 : 0,
    beatRate: (periods.filter((p) => p.ret > p.benchmark).length / periods.length) * 100,
    picks: total,
  };
}

/** Explicación sencilla de por qué el modelo elige un valor. */
export function explainPick(p: Pick, horizon: Horizon): { reason: string; risks: string; risk: 'bajo' | 'medio' | 'alto' } {
  const risk = p.volatility < 22 ? 'bajo' : p.volatility < 38 ? 'medio' : 'alto';
  const moved = p.volatility < 22 ? 'con pocos sobresaltos' : p.volatility < 38 ? 'con altibajos normales' : 'aunque con muchos altibajos';
  const reason = `${p.momentum >= 0 ? 'Ha subido' : 'Ha bajado'} un ${Math.abs(p.momentum).toFixed(1)} % en ${HORIZON_RULES[horizon].label}, ${moved}${
    p.aboveTrend ? ' y está por encima de su media de 200 días (tendencia de fondo alcista)' : ''
  }. Los valores con una tendencia sostenida suelen mantenerla un tiempo.`;
  const risks =
    risk === 'alto'
      ? 'Se mueve mucho: puede caer un 10-20 % en poco tiempo. Las tendencias se rompen de golpe cuando cambia el mercado.'
      : 'Las tendencias no duran siempre: si el mercado se gira, lo que más ha subido suele caer primero.';
  return { reason, risks, risk };
}

/** Descarga (con caché) los precios del universo respetando el límite gratuito de 8 por minuto. */
@Injectable({ providedIn: 'root' })
export class QuantService {
  private readonly market = inject(MarketDataService);
  private cache?: { at: number; data: Aligned };

  /** Se puede cancelar (al salir de la página) para no dejar ocupada la cola gratuita de datos. */
  async load(onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Aligned> {
    if (this.cache && Date.now() - this.cache.at < 30 * 60_000) return this.cache.data;
    // 2 años y medio: un año de simulación + un año de historia para calcular la tendencia.
    const from = addDays(today(), -900);
    const symbols = [BENCHMARK, ...UNIVERSE.map((u) => u.symbol)];
    const series: Record<string, PricePoint[]> = {};
    let done = 0;
    onProgress?.(0, symbols.length);
    for (const s of symbols) {
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      try {
        series[s] = (await this.market.daily(s, from)).points;
      } catch {
        // Si falla un valor, se sigue con el resto.
      }
      onProgress?.(++done, symbols.length);
    }
    if (!series[BENCHMARK]) throw new Error('No se pudo descargar el S&P 500. Revisa la clave de Twelve Data.');
    const data = align(series);
    this.cache = { at: Date.now(), data };
    return data;
  }
}
