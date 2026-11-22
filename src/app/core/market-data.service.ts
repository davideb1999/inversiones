import { Injectable, inject } from '@angular/core';
import { StoreService } from './store.service';
import { addDays, today } from './models';

export interface PricePoint {
  t: number; // epoch ms
  close: number;
}

export interface Series {
  symbol: string;
  currency: string;
  points: PricePoint[];
}

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  high: number;
  low: number;
  time: number;
}

export interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  country: string;
  currency: string;
  /** El plan gratuito ("Basic") de Twelve Data da su precio. */
  free: boolean;
}

export interface CompanyProfile {
  name: string;
  logo: string;
  industry: string;
  country: string;
  marketCap: number;
  web: string;
  currency: string;
}

export interface AnalystOverview {
  name: string;
  description: string;
  sector: string;
  targetPrice?: number;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  pe?: number;
  forwardPe?: number;
  peg?: number;
  beta?: number;
  dividendYield?: number;
  profitMargin?: number;
  high52?: number;
  low52?: number;
  eps?: number;
  bookValue?: number;
  /** Media del precio de las últimas 50 sesiones (sirve si no hay precio en vivo). */
  ma50?: number;
  currency: string;
}

export interface TargetConsensus {
  low: number;
  high: number;
  mean: number;
  median?: number;
}

export interface AnalystTarget {
  date: string;
  firm: string;
  analyst: string;
  target: number;
}

export interface AnalystTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface NewsItem {
  headline: string;
  summary: string;
  url: string;
  source: string;
  datetime: number;
  image: string;
}

export class MarketError extends Error {
  /** El valor existe pero el plan gratuito no da su precio. */
  constructor(
    message: string,
    readonly needsPaidPlan = false,
  ) {
    super(message);
  }
}

export function needsPaidPlan(e: unknown): boolean {
  return e instanceof MarketError && e.needsPaidPlan;
}

const TD = 'https://api.twelvedata.com';
const FH = 'https://finnhub.io/api/v1';
const MINUTE = 60_000;

/** ETF que representan el mercado (S&P 500, Nasdaq, Dow, pequeñas, Europa, oro, bonos). */
const BRIEFING_INDEXES = ['SPY', 'QQQ', 'DIA', 'IWM', 'VGK', 'GLD', 'TLT'];
/** Valores populares entre los que la IA puede elegir oportunidades si no puede buscar en internet. */
const WATCHLIST = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'JPM', 'V', 'MA', 'BRK.B', 'UNH', 'LLY', 'JNJ', 'XOM', 'COST', 'WMT', 'KO', 'PG',
  'VOO', 'VTI', 'SCHD', 'XLK', 'XLF', 'XLE', 'XLV', 'SMH', 'VNQ',
];
const HOUR = 60 * MINUTE;

/**
 * Datos de mercado: Twelve Data (histórico) + Finnhub (cotización, empresa, analistas, noticias).
 * Todo se cachea en localStorage y las llamadas a Twelve Data se espacian para no pasar
 * del límite gratuito (8 por minuto).
 */
@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly store = inject(StoreService);
  private readonly inflight = new Map<string, Promise<unknown>>();
  private tdCalls: number[] = [];
  private tdQueue: Promise<void> = Promise.resolve();
  private fhCalls: number[] = [];
  private fhQueue: Promise<void> = Promise.resolve();

  hasTwelveData(): boolean {
    return !!this.store.settings().twelveDataKey;
  }

  hasAlphaVantage(): boolean {
    return !!this.store.settings().alphaVantageKey;
  }

  /**
   * Ficha de Alpha Vantage: precio objetivo medio de los analistas y cuántos recomiendan comprar/mantener/vender.
   * El plan gratuito permite 25 consultas al día, así que se guarda 24 h.
   */
  overview(symbol: string): Promise<AnalystOverview | null> {
    return this.cached(`av.${symbol}`, 24 * HOUR, async () => {
      const key = this.store.settings().alphaVantageKey;
      if (!key) throw new MarketError('Falta la clave de Alpha Vantage (Ajustes).');
      const qs = new URLSearchParams({ function: 'OVERVIEW', symbol, apikey: key });
      const res = await fetch(`https://www.alphavantage.co/query?${qs}`, { signal: AbortSignal.timeout(20_000) });
      const j = (await res.json()) as Record<string, string>;
      if (j['Information'] || j['Note']) {
        throw new MarketError('Has usado las 25 consultas diarias gratuitas de Alpha Vantage. Vuelve mañana.');
      }
      if (j['Error Message'] || !j['Symbol']) return null;
      const n = (k: string) => {
        const v = Number(j[k]);
        return j[k] && j[k] !== 'None' && isFinite(v) ? v : undefined;
      };
      return {
        name: j['Name'] ?? symbol,
        description: j['Description'] ?? '',
        sector: j['Sector'] ?? '',
        targetPrice: n('AnalystTargetPrice'),
        strongBuy: n('AnalystRatingStrongBuy') ?? 0,
        buy: n('AnalystRatingBuy') ?? 0,
        hold: n('AnalystRatingHold') ?? 0,
        sell: n('AnalystRatingSell') ?? 0,
        strongSell: n('AnalystRatingStrongSell') ?? 0,
        pe: n('PERatio'),
        forwardPe: n('ForwardPE'),
        peg: n('PEGRatio'),
        beta: n('Beta'),
        dividendYield: n('DividendYield'),
        profitMargin: n('ProfitMargin'),
        high52: n('52WeekHigh'),
        low52: n('52WeekLow'),
        eps: n('EPS'),
        bookValue: n('BookValue'),
        ma50: n('50DayMovingAverage'),
        currency: j['Currency'] ?? 'USD',
      };
    });
  }

  hasFmp(): boolean {
    return !!this.store.settings().fmpKey;
  }

  private async fmp<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.store.settings().fmpKey;
    if (!key) throw new MarketError('Falta la clave de Financial Modeling Prep (Ajustes).');
    const qs = new URLSearchParams({ ...params, apikey: key });
    const res = await fetch(`https://financialmodelingprep.com/stable/${path}?${qs}`, { signal: AbortSignal.timeout(20_000) });
    if (res.status === 401) throw new MarketError('La clave de Financial Modeling Prep no es válida.');
    if (res.status === 402 || res.status === 403) throw new MarketError('Este dato no está en el plan gratuito de Financial Modeling Prep.', true);
    if (res.status === 429) throw new MarketError('Has usado las consultas diarias gratuitas de Financial Modeling Prep. Vuelve mañana.');
    const j = (await res.json()) as T & { 'Error Message'?: string };
    if (!Array.isArray(j) && j['Error Message']) {
      const m = j['Error Message'];
      throw new MarketError(/premium|subscription|plan/i.test(m) ? 'Este dato no está en el plan gratuito de Financial Modeling Prep.' : m, /premium|subscription|plan/i.test(m));
    }
    return j;
  }

  /** Precio objetivo mínimo, máximo, medio y mediano de los analistas. */
  targetConsensus(symbol: string): Promise<TargetConsensus | null> {
    return this.cached(`fmp.tc.${symbol}`, 24 * HOUR, async () => {
      const rows = await this.fmp<{ targetHigh?: number; targetLow?: number; targetConsensus?: number; targetMedian?: number }[]>('price-target-consensus', { symbol });
      const r = rows[0];
      if (!r?.targetHigh || !r.targetLow || !r.targetConsensus) return null;
      return { low: r.targetLow, high: r.targetHigh, mean: r.targetConsensus, median: r.targetMedian || undefined };
    });
  }

  /** Precios objetivo individuales del último año (el más reciente de cada casa de análisis). */
  analystTargets(symbol: string): Promise<AnalystTarget[]> {
    return this.cached(`fmp.tn.${symbol}`, 24 * HOUR, async () => {
      const rows = await this.fmp<{ publishedDate?: string; analystCompany?: string; analystName?: string; priceTarget?: number; adjPriceTarget?: number }[]>('price-target-news', { symbol, limit: '100' });
      const since = addDays(today(), -365);
      const byFirm = new Map<string, AnalystTarget>();
      for (const r of rows) {
        const date = (r.publishedDate ?? '').slice(0, 10);
        const target = r.adjPriceTarget || r.priceTarget;
        const firm = r.analystCompany || r.analystName || 'Analista';
        if (!target || date < since) continue;
        const prev = byFirm.get(firm);
        if (!prev || prev.date < date) byFirm.set(firm, { date, firm, analyst: r.analystName ?? '', target });
      }
      return [...byFirm.values()].sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  hasFinnhub(): boolean {
    return !!this.store.settings().finnhubKey;
  }

  // ---------- caché ----------

  private cacheGet<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem('inv.cache.' + key);
      if (!raw) return undefined;
      const { exp, val } = JSON.parse(raw) as { exp: number; val: T };
      if (Date.now() > exp) return undefined;
      return val;
    } catch {
      return undefined;
    }
  }

  private cacheSet(key: string, val: unknown, ttl: number): void {
    try {
      localStorage.setItem('inv.cache.' + key, JSON.stringify({ exp: Date.now() + ttl, val }));
    } catch {
      // Si el almacenamiento está lleno, se vacía la caché de mercado y se sigue sin cachear.
      this.clearCache();
    }
  }

  clearCache(): void {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('inv.cache.'))
      .forEach((k) => localStorage.removeItem(k));
  }

  private cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cacheGet<T>(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = load()
      .then((val) => {
        this.cacheSet(key, val, ttl);
        return val;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  // ---------- Twelve Data ----------

  private async tdThrottle(): Promise<void> {
    const turn = this.tdQueue.then(async () => {
      const now = Date.now();
      this.tdCalls = this.tdCalls.filter((t) => now - t < MINUTE);
      if (this.tdCalls.length >= 7) {
        await new Promise((r) => setTimeout(r, MINUTE - (now - this.tdCalls[0]) + 250));
      }
      this.tdCalls.push(Date.now());
    });
    this.tdQueue = turn.catch(() => undefined);
    return turn;
  }

  /** Finnhub gratis: 60 llamadas por minuto. */
  private async fhThrottle(): Promise<void> {
    const turn = this.fhQueue.then(async () => {
      const now = Date.now();
      this.fhCalls = this.fhCalls.filter((t) => now - t < MINUTE);
      if (this.fhCalls.length >= 55) {
        await new Promise((r) => setTimeout(r, MINUTE - (now - this.fhCalls[0]) + 250));
      }
      this.fhCalls.push(Date.now());
    });
    this.fhQueue = turn.catch(() => undefined);
    return turn;
  }

  private async td<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.store.settings().twelveDataKey;
    if (!key) throw new MarketError('Falta la clave de Twelve Data (Ajustes).');
    await this.tdThrottle();
    const qs = new URLSearchParams({ ...params, apikey: key });
    const res = await fetch(`${TD}/${path}?${qs}`, { signal: AbortSignal.timeout(20_000) });
    const json = (await res.json()) as T & { status?: string; message?: string; code?: number };
    if (json.status === 'error') {
      const m = json.message ?? '';
      if (/plan|upgrad/i.test(m)) {
        throw new MarketError('Este valor no tiene precio en el plan gratuito (solo bolsa de EE. UU. y cripto). Usa el valor manual.', true);
      }
      throw new MarketError(m || 'Error de Twelve Data');
    }
    return json;
  }

  async search(query: string): Promise<SymbolResult[]> {
    if (query.trim().length < 1) return [];
    return this.cached(`search2.${query.toLowerCase()}`, 24 * HOUR, async () => {
      const qs = new URLSearchParams({ symbol: query.trim(), outputsize: '20', show_plan: 'true' });
      const res = await fetch(`${TD}/symbol_search?${qs}`, { signal: AbortSignal.timeout(15_000) });
      const json = (await res.json()) as {
        data?: {
          symbol: string;
          instrument_name: string;
          exchange: string;
          instrument_type: string;
          country: string;
          currency: string;
          access?: { global?: string; plan?: string };
        }[];
      };
      return (json.data ?? []).map((d) => ({
        symbol: d.symbol,
        name: d.instrument_name,
        exchange: d.exchange,
        type: d.instrument_type,
        country: d.country,
        currency: d.currency,
        free: (d.access?.plan ?? d.access?.global ?? 'Basic') === 'Basic',
      }));
    });
  }

  /** Serie diaria desde `from` (incluido) hasta hoy. */
  async daily(symbol: string, from: string): Promise<Series> {
    const key = `daily.${symbol}`;
    const hit = this.cacheGet<Series & { from: string }>(key);
    if (hit && hit.from <= from) return hit;
    // Se pide un poco más atrás para tener precio de "ayer" en el primer día.
    const start = addDays(from, -7);
    const running = this.inflight.get(key);
    if (running) {
      const r = (await running) as Series & { from: string };
      if (r.from <= from) return r;
    }
    const p = this.fetchSeries(symbol, '1day', start, today()).then((s) => {
      const val = { ...s, from: start };
      this.cacheSet(key, val, 6 * HOUR);
      return val;
    });
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Serie intradía (para 1 día o 1 semana). */
  intraday(symbol: string, days: 1 | 7): Promise<Series> {
    const interval = days === 1 ? '5min' : '1h';
    return this.cached(`intra.${symbol}.${days}`, days === 1 ? 5 * MINUTE : 30 * MINUTE, async () => {
      const s = await this.fetchSeries(symbol, interval, undefined, undefined, days === 1 ? 120 : 60);
      if (days === 1 && s.points.length) {
        // Solo la última sesión.
        const last = new Date(s.points[s.points.length - 1].t).toDateString();
        s.points = s.points.filter((p) => new Date(p.t).toDateString() === last);
      }
      return s;
    });
  }

  private async fetchSeries(
    symbol: string,
    interval: string,
    start?: string,
    end?: string,
    outputsize = 5000,
  ): Promise<Series> {
    const params: Record<string, string> = { symbol, interval, outputsize: String(outputsize), order: 'ASC' };
    if (start) params['start_date'] = start;
    if (end) params['end_date'] = addDays(end, 1);
    const json = await this.td<{
      meta: { symbol: string; currency?: string; currency_quote?: string };
      values: { datetime: string; close: string }[];
    }>('time_series', params);
    return {
      symbol,
      currency: json.meta.currency ?? json.meta.currency_quote ?? 'USD',
      points: json.values.map((v) => ({ t: parseDate(v.datetime), close: Number(v.close) })),
    };
  }

  /** Precio de cierre del primer día de mercado igual o posterior a `date`. */
  async closeOn(symbol: string, date: string): Promise<number | undefined> {
    const s = await this.daily(symbol, addDays(date, -10));
    const target = parseDate(date);
    const after = s.points.find((p) => p.t >= target);
    if (after) return after.close;
    return s.points.at(-1)?.close;
  }

  /** Tipo de cambio diario: cuántas unidades de `to` vale 1 unidad de `from`. */
  async fxDaily(from: string, to: string, since: string): Promise<PricePoint[]> {
    if (from === to) return [];
    const s = await this.daily(`${from}/${to}`, since);
    return s.points;
  }

  async fxNow(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    return this.cached(`fx.${from}${to}`, 2 * HOUR, async () => {
      const json = await this.td<{ rate: number }>('exchange_rate', { symbol: `${from}/${to}` });
      return Number(json.rate);
    });
  }

  // ---------- Cotización actual ----------

  async quote(symbol: string): Promise<Quote> {
    const useFinnhub = this.hasFinnhub() && !symbol.includes('/') && !symbol.includes(':');
    return this.cached(`quote.${symbol}`, 2 * MINUTE, async () => {
      if (useFinnhub) {
        const q = await this.fh<{ c: number; d: number; dp: number; pc: number; h: number; l: number; t: number }>(
          'quote',
          { symbol },
        );
        if (q.c) return { price: q.c, change: q.d, changePct: q.dp, prevClose: q.pc, high: q.h, low: q.l, time: q.t * 1000 };
      }
      const q = await this.td<{
        close: string;
        change: string;
        percent_change: string;
        previous_close: string;
        high: string;
        low: string;
        timestamp: number;
      }>('quote', { symbol });
      return {
        price: Number(q.close),
        change: Number(q.change),
        changePct: Number(q.percent_change),
        prevClose: Number(q.previous_close),
        high: Number(q.high),
        low: Number(q.low),
        time: q.timestamp * 1000,
      };
    });
  }

  // ---------- Finnhub ----------

  private async fh<T>(path: string, params: Record<string, string>): Promise<T> {
    const token = this.store.settings().finnhubKey;
    if (!token) throw new MarketError('Falta la clave de Finnhub (Ajustes).');
    const qs = new URLSearchParams({ ...params, token });
    await this.fhThrottle();
    const res = await fetch(`${FH}/${path}?${qs}`, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 429) throw new MarketError('Finnhub: demasiadas peticiones, espera un minuto.');
    if (res.status === 403) throw new MarketError('Finnhub no da este dato en el plan gratuito.');
    if (!res.ok) throw new MarketError(`Finnhub respondió ${res.status}`);
    return (await res.json()) as T;
  }

  profile(symbol: string): Promise<CompanyProfile | null> {
    return this.cached(`profile.${symbol}`, 24 * HOUR, async () => {
      const p = await this.fh<{
        name?: string;
        logo?: string;
        finnhubIndustry?: string;
        country?: string;
        marketCapitalization?: number;
        weburl?: string;
        currency?: string;
      }>('stock/profile2', { symbol });
      if (!p.name) return null;
      return {
        name: p.name,
        logo: p.logo ?? '',
        industry: p.finnhubIndustry ?? '',
        country: p.country ?? '',
        marketCap: p.marketCapitalization ?? 0,
        web: p.weburl ?? '',
        currency: p.currency ?? '',
      };
    });
  }

  analystTrends(symbol: string): Promise<AnalystTrend[]> {
    return this.cached(`analyst.${symbol}`, 12 * HOUR, async () => {
      const rows = await this.fh<AnalystTrend[]>('stock/recommendation', { symbol });
      return rows.slice(0, 6).reverse();
    });
  }

  metrics(symbol: string): Promise<Record<string, number | undefined>> {
    return this.cached(`metrics.${symbol}`, 12 * HOUR, async () => {
      const r = await this.fh<{ metric?: Record<string, number> }>('stock/metric', { symbol, metric: 'all' });
      return r.metric ?? {};
    });
  }

  generalNews(): Promise<NewsItem[]> {
    return this.cached('news.general', 30 * MINUTE, async () => {
      const rows = await this.fh<NewsItem[]>('news', { category: 'general' });
      return rows.slice(0, 25);
    });
  }

  /**
   * Resumen de mercado en texto para pasárselo a la IA cuando no puede buscar en internet:
   * titulares del día y cotización de índices y valores populares.
   */
  async briefing(extraSymbols: string[] = [], withWatchlist = false): Promise<string> {
    if (!this.hasFinnhub()) return '';
    const symbols = [...new Set([...BRIEFING_INDEXES, ...(withWatchlist ? WATCHLIST : []), ...extraSymbols.filter((s) => !s.includes('/'))])];
    const [news, quotes] = await Promise.all([
      this.generalNews().catch(() => [] as NewsItem[]),
      Promise.all(symbols.map((s) => this.quote(s).then((q) => ({ s, q })).catch(() => null))),
    ]);
    const lines = quotes
      .filter((x): x is { s: string; q: Quote } => !!x && !!x.q.price)
      .map(({ s, q }) => `${s}: ${q.price.toFixed(2)} USD (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)} % hoy; rango del día ${q.low}–${q.high})`);
    const heads = news
      .filter((n) => Date.now() / 1000 - n.datetime < 3 * 86_400)
      .slice(0, 20)
      .map((n) => `- [${new Date(n.datetime * 1000).toISOString().slice(0, 10)}] ${n.headline} (${n.source})`);
    return `COTIZACIONES ACTUALES (Finnhub):\n${lines.join('\n')}\n\nTITULARES RECIENTES:\n${heads.join('\n') || '(sin titulares)'}`;
  }

  news(symbol: string): Promise<NewsItem[]> {
    return this.cached(`news.${symbol}`, HOUR, async () => {
      const rows = await this.fh<NewsItem[]>('company-news', { symbol, from: addDays(today(), -10), to: today() });
      return rows.slice(0, 8);
    });
  }
}

/** Twelve Data devuelve "2024-01-02" o "2024-01-02 15:30:00". */
export function parseDate(s: string): number {
  return new Date(s.length <= 10 ? s + 'T00:00:00' : s.replace(' ', 'T')).getTime();
}
