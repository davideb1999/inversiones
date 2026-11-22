import { Injectable, computed, inject, signal } from '@angular/core';
import { MarketDataService, PricePoint, Quote, needsPaidPlan, parseDate } from './market-data.service';
import { StoreService } from './store.service';
import { ASSET_TYPE_LABEL, Asset, AssetType, addDays, toISODate, today } from './models';
import { DateRange } from './ranges';

export interface AssetLive {
  quote?: Quote;
  fx: number;
  error?: string;
  loading: boolean;
  paidPlan?: boolean;
}

export interface AssetStats {
  asset: Asset;
  invested: number; // neto: aportado - retirado
  contributed: number; // total aportado
  withdrawn: number;
  shares: number;
  value: number;
  gain: number;
  gainPct: number;
  dayChange: number;
  dayChangePct: number;
  annualPct?: number;
  priceAvailable: boolean;
  lastPrice?: number;
  avgPrice?: number;
  firstDate?: string;
}

export interface Insight {
  level: 'good' | 'warning' | 'critical' | 'info';
  title: string;
  text: string;
}

export interface HistoryResult {
  value: PricePoint[];
  invested: PricePoint[];
  warnings: string[];
}

export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private readonly store = inject(StoreService);
  private readonly market = inject(MarketDataService);

  readonly live = signal<Record<string, AssetLive>>({});
  readonly lastRefresh = signal<number | null>(null);

  readonly stats = computed<AssetStats[]>(() => {
    const live = this.live();
    return this.store.assets().map((a) => this.assetStats(a, live[a.id]));
  });

  readonly totals = computed(() => {
    const s = this.stats();
    const invested = sum(s.map((x) => x.invested));
    const contributed = sum(s.map((x) => x.contributed));
    const value = sum(s.map((x) => x.value));
    const dayChange = sum(s.map((x) => x.dayChange));
    const gain = value - invested;
    const flows = this.store.assets().flatMap((a) =>
      a.movements.map((m) => ({ date: m.date, amount: m.kind === 'aportacion' ? -m.amount : m.amount })),
    );
    return {
      invested,
      contributed,
      value,
      gain,
      gainPct: invested > 0 ? (gain / invested) * 100 : 0,
      dayChange,
      dayChangePct: value - dayChange > 0 ? (dayChange / (value - dayChange)) * 100 : 0,
      annualPct: annualized(flows, value),
      count: s.length,
    };
  });

  /** Reparto por activo y por tipo (para los gráficos de tarta). */
  readonly allocation = computed(() => {
    const s = this.stats().filter((x) => x.value > 0);
    const total = sum(s.map((x) => x.value)) || 1;
    const byAsset = s
      .map((x, i) => ({ label: x.asset.name, value: x.value, pct: (x.value / total) * 100, color: this.colorOf(x.asset, i) }))
      .sort((a, b) => b.value - a.value);
    const typeMap = new Map<AssetType, number>();
    s.forEach((x) => typeMap.set(x.asset.type, (typeMap.get(x.asset.type) ?? 0) + x.value));
    const byType = [...typeMap.entries()]
      .map(([t, v], i) => ({ label: ASSET_TYPE_LABEL[t], value: v, pct: (v / total) * 100, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value);
    return { byAsset, byType };
  });

  colorOf(asset: Asset, index?: number): string {
    if (asset.color) return asset.color;
    const i = index ?? this.store.assets().findIndex((a) => a.id === asset.id);
    return PALETTE[Math.max(0, i) % PALETTE.length];
  }

  async refresh(): Promise<void> {
    const assets = this.store.assets().filter((a) => a.symbol);
    const base = this.store.settings().baseCurrency;
    const next: Record<string, AssetLive> = { ...this.live() };
    assets.forEach((a) => (next[a.id] = { ...(next[a.id] ?? { fx: 1 }), loading: true }));
    this.live.set({ ...next });
    await Promise.all(
      assets.map(async (a) => {
        try {
          const [quote, fx] = await Promise.all([this.market.quote(a.symbol!), this.market.fxNow(a.currency, base)]);
          this.live.update((l) => ({ ...l, [a.id]: { quote, fx, loading: false } }));
        } catch (e) {
          this.live.update((l) => ({ ...l, [a.id]: { ...l[a.id], fx: l[a.id]?.fx ?? 1, loading: false, error: msg(e), paidPlan: needsPaidPlan(e) } }));
        }
      }),
    );
    this.lastRefresh.set(Date.now());
  }

  assetStats(asset: Asset, live?: AssetLive): AssetStats {
    let contributed = 0;
    let withdrawn = 0;
    let shares = 0;
    let boughtShares = 0;
    for (const m of asset.movements) {
      if (m.kind === 'aportacion') {
        contributed += m.amount;
        shares += m.shares ?? 0;
        boughtShares += m.shares ?? 0;
      } else {
        withdrawn += m.amount;
        shares -= m.shares ?? 0;
      }
    }
    const invested = contributed - withdrawn;
    const price = live?.quote?.price;
    const fx = live?.fx ?? 1;
    const priceAvailable = !!asset.symbol && price !== undefined && shares > 0;
    let value: number;
    let dayChange = 0;
    if (priceAvailable) {
      value = shares * price! * fx;
      dayChange = shares * (live!.quote!.change ?? 0) * fx;
    } else {
      value = manualValueAt(asset, today());
    }
    const gain = value - invested;
    const flows = asset.movements.map((m) => ({ date: m.date, amount: m.kind === 'aportacion' ? -m.amount : m.amount }));
    return {
      asset,
      invested,
      contributed,
      withdrawn,
      shares,
      value,
      gain,
      gainPct: invested > 0 ? (gain / invested) * 100 : 0,
      dayChange,
      dayChangePct: value - dayChange > 0 ? (dayChange / (value - dayChange)) * 100 : 0,
      annualPct: annualized(flows, value),
      priceAvailable,
      lastPrice: price,
      avgPrice: boughtShares > 0 ? contributed / boughtShares : undefined,
      firstDate: asset.movements[0]?.date,
    };
  }

  /** Calcula cuántas participaciones compraste con un importe en una fecha. */
  async estimateShares(asset: Asset, date: string, amount: number, price?: number): Promise<{ shares: number; price: number }> {
    if (!asset.symbol) throw new Error('Este activo no tiene cotización automática.');
    const base = this.store.settings().baseCurrency;
    const p = price ?? (await this.market.closeOn(asset.symbol, date));
    if (!p) throw new Error('No encontré el precio de ese día.');
    let fx = 1;
    if (asset.currency !== base) {
      fx = (await this.market.closeOn(`${asset.currency}/${base}`, date)) ?? (await this.market.fxNow(asset.currency, base));
    }
    return { shares: amount / (p * fx), price: p };
  }

  /**
   * Pasa a seguir un equivalente de EE. UU. y recalcula las participaciones de cada aportación
   * con el precio del equivalente ese día (así el valor evoluciona igual que el original).
   */
  async switchToEquivalent(assetId: string, eq: Parameters<StoreService['useEquivalent']>[1]): Promise<void> {
    this.store.useEquivalent(assetId, eq);
    const asset = this.store.asset(assetId);
    if (!asset) return;
    for (const m of asset.movements) {
      const est = await this.estimateShares(asset, m.date, m.amount);
      this.store.saveMovement(assetId, { ...m, shares: est.shares, price: est.price });
    }
    this.live.update((l) => {
      const { [assetId]: _, ...rest } = l;
      return rest;
    });
    await this.refresh();
  }

  earliestDate(assets = this.store.assets()): string | undefined {
    return assets
      .flatMap((a) => [...a.movements.map((m) => m.date), ...a.valuations.map((v) => v.date)])
      .sort()[0];
  }

  /** Evolución diaria del valor de la cartera y del dinero aportado. */
  async history(range: DateRange, assets = this.store.assets()): Promise<HistoryResult> {
    const base = this.store.settings().baseCurrency;
    const warnings: string[] = [];
    const from = range.from;
    const to = range.to;
    const days = dayList(from, to);
    const valueByDay = new Array<number>(days.length).fill(0);
    const investedByDay = new Array<number>(days.length).fill(0);

    await Promise.all(
      assets.map(async (asset) => {
        const firstMove = asset.movements[0]?.date;
        if (!firstMove) return;
        let closes: PricePoint[] | null = null;
        let fxs: PricePoint[] = [];
        if (asset.symbol && asset.movements.some((m) => m.shares)) {
          try {
            const since = from < firstMove ? from : firstMove;
            closes = (await this.market.daily(asset.symbol, since)).points;
            if (asset.currency !== base) fxs = await this.market.fxDaily(asset.currency, base, since);
          } catch (e) {
            warnings.push(`${asset.name}: ${msg(e)} Se usa el valor manual.`);
            closes = null;
          }
        }
        let ci = 0;
        let fi = 0;
        let lastClose: number | undefined;
        let lastFx = 1;
        days.forEach((d, i) => {
          const dayEnd = parseDate(d) + 86_399_999;
          let invested = 0;
          let shares = 0;
          for (const m of asset.movements) {
            if (m.date > d) break;
            invested += m.kind === 'aportacion' ? m.amount : -m.amount;
            shares += (m.kind === 'aportacion' ? 1 : -1) * (m.shares ?? 0);
          }
          investedByDay[i] += invested;
          if (closes) {
            while (ci < closes.length && closes[ci].t <= dayEnd) lastClose = closes[ci++].close;
            while (fi < fxs.length && fxs[fi].t <= dayEnd) lastFx = fxs[fi++].close;
            valueByDay[i] += lastClose !== undefined ? shares * lastClose * lastFx : invested;
          } else {
            valueByDay[i] += manualValueAt(asset, d);
          }
        });
      }),
    );

    // Hoy: usar el valor en vivo si lo hay, para que el gráfico cuadre con la cifra grande.
    const lastIdx = days.length - 1;
    if (days[lastIdx] === today() && assets === this.store.assets()) {
      valueByDay[lastIdx] = this.totals().value;
    }

    const step = days.length > 900 ? 3 : 1;
    const value: PricePoint[] = [];
    const invested: PricePoint[] = [];
    days.forEach((d, i) => {
      if (i % step !== 0 && i !== lastIdx) return;
      const t = parseDate(d);
      value.push({ t, close: round2(valueByDay[i]) });
      invested.push({ t, close: round2(investedByDay[i]) });
    });
    return { value, invested, warnings };
  }

  insights(): Insight[] {
    const out: Insight[] = [];
    const stats = this.stats().filter((s) => s.value > 0);
    const totals = this.totals();
    if (!stats.length) return out;
    const top = [...stats].sort((a, b) => b.value - a.value)[0];
    const topPct = (top.value / totals.value) * 100;
    if (stats.length === 1 && top.asset.type === 'accion') {
      out.push({
        level: 'critical',
        title: 'Todo en una sola empresa',
        text: `Si a ${top.asset.name} le va mal, le va mal a todo tu dinero. Un ETF indexado reparte el riesgo entre cientos de empresas.`,
      });
    } else if (topPct > 50 && top.asset.type !== 'etf' && top.asset.type !== 'fondo') {
      out.push({
        level: 'warning',
        title: 'Mucho peso en un solo activo',
        text: `${top.asset.name} es el ${topPct.toFixed(0)}% de tu cartera. Lo habitual es que ninguna empresa individual pase del 10-20%.`,
      });
    } else {
      out.push({ level: 'good', title: 'Reparto razonable', text: 'Ningún activo individual domina tu cartera.' });
    }
    const crypto = stats.filter((s) => s.asset.type === 'cripto').reduce((a, s) => a + s.value, 0);
    if (crypto / totals.value > 0.2) {
      out.push({
        level: 'warning',
        title: 'Mucha cripto',
        text: `Las criptomonedas son el ${((crypto / totals.value) * 100).toFixed(0)}% de tu dinero. Pueden caer más de un 50% en meses.`,
      });
    }
    const lastMove = this.store
      .assets()
      .flatMap((a) => a.movements.filter((m) => m.kind === 'aportacion').map((m) => m.date))
      .sort()
      .at(-1);
    if (lastMove && lastMove < addDays(today(), -90)) {
      out.push({
        level: 'info',
        title: 'Hace tiempo que no aportas',
        text: 'Aportar una cantidad fija cada mes (aunque sea pequeña) suele funcionar mejor que intentar adivinar el mejor momento.',
      });
    }
    const losers = stats.filter((s) => s.gainPct < -20);
    if (losers.length) {
      out.push({
        level: 'info',
        title: 'Inversiones en pérdidas fuertes',
        text: `${losers.map((l) => l.asset.name).join(', ')} pierde más de un 20%. Pregunta al Asesor IA si sigue teniendo sentido mantenerla.`,
      });
    }
    if (totals.gain > 0 && totals.gainPct > 0) {
      out.push({
        level: 'good',
        title: 'Vas en positivo',
        text: `Por cada 100 € que has puesto, ahora tienes ${(100 + totals.gainPct).toFixed(0)} €.`,
      });
    }
    return out;
  }
}

/** Valor de un activo manual: última valoración anotada + aportaciones/retiradas posteriores. */
export function manualValueAt(asset: Asset, date: string): number {
  const val = [...asset.valuations].filter((v) => v.date <= date).at(-1);
  let total = val ? val.value : 0;
  for (const m of asset.movements) {
    if (m.date > date) break;
    if (val && m.date <= val.date) continue;
    total += m.kind === 'aportacion' ? m.amount : -m.amount;
  }
  return total;
}

/** Rentabilidad anual equivalente (TIR / XIRR). Solo si llevas más de 3 meses. */
export function annualized(flows: { date: string; amount: number }[], finalValue: number): number | undefined {
  if (!flows.length) return undefined;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = parseDate(sorted[0].date);
  const now = Date.now();
  if (now - t0 < 90 * 86_400_000) return undefined;
  const cfs = [...sorted.map((f) => ({ t: (parseDate(f.date) - t0) / (365 * 86_400_000), a: f.amount })), { t: (now - t0) / (365 * 86_400_000), a: finalValue }];
  let r = 0.05;
  for (let i = 0; i < 100; i++) {
    let f = 0;
    let df = 0;
    for (const c of cfs) {
      const d = Math.pow(1 + r, c.t);
      f += c.a / d;
      df -= (c.t * c.a) / (d * (1 + r));
    }
    if (Math.abs(df) < 1e-12) break;
    const next = r - f / df;
    if (!isFinite(next)) return undefined;
    if (Math.abs(next - r) < 1e-9) {
      r = next;
      break;
    }
    r = Math.max(next, -0.99);
  }
  return isFinite(r) ? r * 100 : undefined;
}

function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (d <= end) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
