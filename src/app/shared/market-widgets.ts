import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MarketDataService, Series } from '../core/market-data.service';
import { RangeKey, resolveRange } from '../core/ranges';
import { ChartMarker, LineChart } from './charts';
import { FechaPipe, MoneyPipe, NumPipe, PctPipe } from './format';
import { Help, Notice, RangeSelector } from './ui';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Gráfico del precio de un valor con selector de tramo (incluye intradía). */
@Component({
  selector: 'app-price-chart',
  imports: [LineChart, RangeSelector, Notice, PctPipe, MoneyPipe],
  template: `
    <div class="card-head">
      <div>
        <h2 class="card-title">Precio de {{ symbol() }}</h2>
        @if (change(); as c) {
          <div class="chg" [class.up]="c.pct >= 0" [class.down]="c.pct < 0">
            {{ c.pct >= 0 ? '▲' : '▼' }} {{ c.pct | pct }} en el periodo · último {{ c.last | money: currency() }}
          </div>
        }
      </div>
      <app-range-selector [(value)]="range" (customChange)="custom.set($event)" />
    </div>
    @if (!market.hasTwelveData()) {
      <app-notice level="warning">Añade la clave de Twelve Data en Ajustes para ver el gráfico del precio.</app-notice>
    } @else if (data.isLoading() && !data.hasValue()) {
      <div class="skeleton" style="height: 280px"></div>
    } @else if (data.error()) {
      <app-notice level="warning">No se pudo cargar el precio: {{ error() }}</app-notice>
    } @else if (points().length) {
      <app-line-chart [series]="[{ label: symbol(), color: color(), points: points(), fill: true }]" [markers]="visibleMarkers()" [currency]="currency()" [intraday]="range() === '1D' || range() === '1S'" />
      @if (visibleMarkers().length) {
        <p class="small muted">Los puntos son tus compras (verde) y ventas (rojo).</p>
      }
    } @else {
      <p class="muted">No hay datos para este periodo (¿mercado cerrado?).</p>
    }
  `,
  styles: `.chg { font-size: 14px; font-weight: 600; margin-top: -8px; }`,
})
export class PriceChart {
  protected readonly market = inject(MarketDataService);
  readonly symbol = input.required<string>();
  readonly markers = input<ChartMarker[]>([]);
  readonly earliest = input<string | undefined>(undefined);
  readonly range = signal<RangeKey>('1A');
  readonly custom = signal<{ from: string; to: string } | undefined>(undefined);

  readonly data = resource({
    params: () => ({ symbol: this.symbol(), range: resolveRange(this.range(), this.earliest(), this.custom()) }),
    loader: async ({ params }): Promise<Series> => {
      if (!this.market.hasTwelveData()) return { symbol: params.symbol, currency: '', points: [] };
      if (params.range.key === '1D') return this.market.intraday(params.symbol, 1);
      if (params.range.key === '1S') return this.market.intraday(params.symbol, 7);
      return this.market.daily(params.symbol, params.range.from);
    },
  });

  readonly points = computed(() => {
    const s = this.data.value();
    if (!s) return [];
    const r = resolveRange(this.range(), this.earliest(), this.custom());
    if (r.key === '1D' || r.key === '1S') return s.points;
    const from = new Date(r.from + 'T00:00:00').getTime();
    const to = new Date(r.to + 'T23:59:59').getTime();
    return s.points.filter((p) => p.t >= from && p.t <= to);
  });

  readonly currency = computed(() => this.data.value()?.currency || 'USD');

  readonly change = computed(() => {
    const p = this.points();
    if (p.length < 2) return null;
    return { pct: ((p.at(-1)!.close - p[0].close) / p[0].close) * 100, last: p.at(-1)!.close };
  });

  readonly color = computed(() => ((this.change()?.pct ?? 0) >= 0 ? '#0ca30c' : '#d03b3b'));

  readonly visibleMarkers = computed(() => {
    const p = this.points();
    if (!p.length) return [];
    const from = p[0].t;
    const to = p.at(-1)!.t + 86_400_000;
    return this.markers().filter((m) => m.t >= from && m.t <= to);
  });

  error(): string {
    return errText(this.data.error());
  }
}

interface MetricView {
  key: string;
  label: string;
  value: string;
  level: 'good' | 'warn' | 'bad' | 'neutral';
  verdict: string;
  help: string;
}

/** Información de la empresa al estilo "Investing Pro", explicada de forma sencilla. */
@Component({
  selector: 'app-market-info',
  imports: [Notice, Help, NumPipe, FechaPipe],
  template: `
    @if (!market.hasFinnhub()) {
      <section class="card"><app-notice level="info">Añade la clave gratuita de Finnhub en Ajustes para ver la salud de la empresa, la opinión de los analistas y noticias.</app-notice></section>
    } @else {
      <div class="grid two">
        <section class="card">
          <h2 class="card-title">Salud financiera<app-help term="Salud financiera" text="Resumen de los números de la empresa. Verde = bien, amarillo = normal, rojo = ojo. Para ETF muchos datos no aplican." /></h2>
          @if (profile.value(); as p) {
            <div class="profile">
              @if (p.logo) { <img [src]="p.logo" alt="" width="36" height="36" /> }
              <div><strong>{{ p.name }}</strong><div class="small muted">{{ p.industry }} · {{ p.country }} · Tamaño: {{ size(p.marketCap) }}</div></div>
            </div>
          }
          @if (metrics.isLoading()) {
            <div class="skeleton" style="height: 200px"></div>
          } @else if (metrics.error()) {
            <app-notice level="info">{{ err(metrics.error()) }}</app-notice>
          } @else if (metricViews().length) {
            <div class="score">
              <span>Nota global</span>
              <span class="stars" [attr.aria-label]="score() + ' de 5'">
                @for (i of [1, 2, 3, 4, 5]; track i) { <span [class.on]="i <= score()">●</span> }
              </span>
              <span class="small muted">{{ scoreText() }}</span>
            </div>
            <ul class="metrics">
              @for (m of metricViews(); track m.key) {
                <li>
                  <span class="lvl" [class]="m.level" aria-hidden="true"></span>
                  <div class="m-text"><span class="m-label">{{ m.label }}<app-help [term]="m.label" [text]="m.help" /></span><span class="small muted">{{ m.verdict }}</span></div>
                  <strong class="m-val">{{ m.value }}</strong>
                </li>
              }
            </ul>
            @if (range52(); as r) {
              <div class="range52">
                <div class="small text-2">Precio respecto al último año<app-help term="Rango 52 semanas" text="Izquierda = el precio más bajo del último año; derecha = el más alto. Te dice si está cerca de máximos o de mínimos." /></div>
                <div class="track"><span class="dot" [style.left.%]="r.pos"></span></div>
                <div class="row small muted"><span>Mín {{ r.low | num }}</span><span class="spacer"></span><span>Máx {{ r.high | num }}</span></div>
              </div>
            }
          } @else {
            <p class="muted small">Sin datos fundamentales (normal en ETF y criptomonedas).</p>
          }
        </section>

        <section class="card">
          <h2 class="card-title">Noticias recientes</h2>
          @if (news.value()?.length) {
            <ul class="news">
              @for (n of news.value()!.slice(0, 5); track n.url) {
                <li><a [href]="n.url" target="_blank" rel="noopener">{{ n.headline }}</a><span class="small muted">{{ n.source }} · {{ n.datetime * 1000 | fecha }}</span></li>
              }
            </ul>
          } @else {
            <p class="muted small">Sin noticias recientes.</p>
          }
        </section>
      </div>
    }
  `,
  styles: `
    .profile { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
    .profile img { border-radius: 8px; background: #fff; object-fit: contain; }
    .score { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; background: var(--surface-2); border-radius: 6px; margin-bottom: 10px; font-weight: 600; }
    .stars span { color: var(--grid); font-size: 16px; }
    .stars span.on { color: var(--accent); }
    .metrics { list-style: none; margin: 0; padding: 0; display: grid; }
    .metrics li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
    .lvl { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--muted); }
    .lvl.good { background: var(--good); } .lvl.warn { background: var(--warning); } .lvl.bad { background: var(--critical); }
    .m-text { flex: 1; display: grid; min-width: 0; }
    .m-label { font-size: 14px; display: flex; align-items: center; }
    .m-val { font-variant-numeric: tabular-nums; }
    .range52 { margin-top: 14px; }
    .track { position: relative; height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--critical), var(--warning), var(--good)); margin: 10px 0 4px; opacity: .85; }
    .track .dot { position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%; background: var(--text); border: 2px solid var(--surface); transform: translate(-50%, -50%); }

    .news { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .news li { display: grid; gap: 2px; font-size: 14px; }
    .news a { color: var(--text); text-decoration: none; font-weight: 550; }
    .news a:hover { text-decoration: underline; }
  `,
})
export class MarketInfo {
  protected readonly market = inject(MarketDataService);
  readonly symbol = input.required<string>();

  readonly profile = resource({ params: () => this.symbol(), loader: ({ params }) => (this.market.hasFinnhub() ? this.market.profile(params) : Promise.resolve(null)) });
  readonly metrics = resource({ params: () => this.symbol(), loader: ({ params }) => (this.market.hasFinnhub() ? this.market.metrics(params) : Promise.resolve({})) });
  readonly quote = resource({ params: () => this.symbol(), loader: ({ params }) => this.market.quote(params).catch(() => undefined) });
  readonly news = resource({ params: () => this.symbol(), loader: ({ params }) => (this.market.hasFinnhub() ? this.market.news(params) : Promise.resolve([])) });

  readonly metricViews = computed<MetricView[]>(() => {
    const m: Record<string, number | undefined> = this.metrics.value() ?? {};
    const out: MetricView[] = [];
    const pe = m['peTTM'] ?? m['peBasicExclExtraItemsTTM'];
    if (pe !== undefined && pe !== null) {
      out.push({
        key: 'pe',
        label: 'PER (precio / beneficios)',
        value: pe > 0 ? pe.toFixed(1) : 'Pérdidas',
        level: pe <= 0 ? 'bad' : pe < 15 ? 'good' : pe < 30 ? 'warn' : 'bad',
        verdict: pe <= 0 ? 'La empresa no gana dinero ahora mismo' : pe < 15 ? 'Parece barata' : pe < 30 ? 'Precio normal' : 'Parece cara (el mercado espera mucho crecimiento)',
        help: 'Cuántos años de beneficios actuales pagas al comprar la acción. Menos de 15 suele considerarse barato; más de 30, caro.',
      });
    }
    const growth = m['revenueGrowthTTMYoy'];
    if (growth !== undefined && growth !== null) {
      out.push({
        key: 'growth',
        label: 'Crecimiento de ventas',
        value: `${growth.toFixed(1)} %`,
        level: growth > 10 ? 'good' : growth > 0 ? 'warn' : 'bad',
        verdict: growth > 10 ? 'Vende bastante más que hace un año' : growth > 0 ? 'Crece poco' : 'Vende menos que hace un año',
        help: 'Cuánto han crecido sus ventas en el último año respecto al anterior.',
      });
    }
    const margin = m['netProfitMarginTTM'];
    if (margin !== undefined && margin !== null) {
      out.push({
        key: 'margin',
        label: 'Margen de beneficio',
        value: `${margin.toFixed(1)} %`,
        level: margin > 15 ? 'good' : margin > 5 ? 'warn' : 'bad',
        verdict: `De cada 100 € que vende, gana ${Math.max(0, margin).toFixed(0)} €`,
        help: 'Qué parte de lo que vende se queda como beneficio limpio.',
      });
    }
    const roe = m['roeTTM'];
    if (roe !== undefined && roe !== null) {
      out.push({
        key: 'roe',
        label: 'Rentabilidad sobre su capital (ROE)',
        value: `${roe.toFixed(1)} %`,
        level: roe > 15 ? 'good' : roe > 5 ? 'warn' : 'bad',
        verdict: roe > 15 ? 'Saca mucho partido a su dinero' : roe > 5 ? 'Rentabilidad normal' : 'Rentabilidad baja',
        help: 'Cuánto beneficio genera por cada euro de los accionistas. Más del 15 % es muy bueno.',
      });
    }
    const debt = m['totalDebt/totalEquityQuarterly'];
    if (debt !== undefined && debt !== null) {
      out.push({
        key: 'debt',
        label: 'Deuda',
        value: debt.toFixed(2),
        level: debt < 0.5 ? 'good' : debt < 1.5 ? 'warn' : 'bad',
        verdict: debt < 0.5 ? 'Poca deuda' : debt < 1.5 ? 'Deuda moderada' : 'Mucha deuda',
        help: 'Deuda dividida entre el dinero propio de la empresa. Por debajo de 0,5 es poca; por encima de 1,5, mucha.',
      });
    }
    const div = m['dividendYieldIndicatedAnnual'] ?? m['currentDividendYieldTTM'];
    if (div !== undefined && div !== null) {
      out.push({
        key: 'div',
        label: 'Dividendo anual',
        value: `${div.toFixed(2)} %`,
        level: div > 2 ? 'good' : 'neutral',
        verdict: div > 0 ? `Te paga ~${div.toFixed(1)} € al año por cada 100 € invertidos` : 'No reparte dividendo',
        help: 'Parte de los beneficios que la empresa te paga en efectivo cada año.',
      });
    }
    const beta = m['beta'];
    if (beta !== undefined && beta !== null) {
      out.push({
        key: 'beta',
        label: 'Nerviosismo (beta)',
        value: beta.toFixed(2),
        level: beta < 0.8 ? 'good' : beta < 1.3 ? 'warn' : 'bad',
        verdict: beta < 0.8 ? 'Se mueve menos que el mercado' : beta < 1.3 ? 'Se mueve como el mercado' : 'Se mueve mucho más que el mercado',
        help: 'Si el mercado sube o baja un 10 %, esta acción suele moverse un 10 % × beta.',
      });
    }
    return out;
  });

  readonly score = computed(() => {
    const v = this.metricViews().filter((m) => m.level !== 'neutral');
    if (!v.length) return 0;
    const pts = v.reduce((a, m) => a + (m.level === 'good' ? 2 : m.level === 'warn' ? 1 : 0), 0);
    return Math.max(1, Math.round((pts / (v.length * 2)) * 5));
  });

  readonly scoreText = computed(() => ['', 'Débil', 'Floja', 'Correcta', 'Buena', 'Excelente'][this.score()]);

  readonly range52 = computed(() => {
    const m: Record<string, number | undefined> = this.metrics.value() ?? {};
    const high = m['52WeekHigh'];
    const low = m['52WeekLow'];
    const price = this.quote.value()?.price;
    if (!high || !low || !price || high <= low) return null;
    return { high, low, pos: Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) };
  });

  size(capMillions: number): string {
    if (!capMillions) return '—';
    if (capMillions > 200_000) return 'gigante';
    if (capMillions > 10_000) return 'grande';
    if (capMillions > 2_000) return 'mediana';
    return 'pequeña';
  }

  err(e: unknown): string {
    return errText(e);
  }
}
