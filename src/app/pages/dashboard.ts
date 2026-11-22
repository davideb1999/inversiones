import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MarketDataService } from '../core/market-data.service';
import { ASSET_TYPE_LABEL } from '../core/models';
import { PortfolioService } from '../core/portfolio.service';
import { RangeKey, resolveRange } from '../core/ranges';
import { StoreService } from '../core/store.service';
import { Donut, LineChart, LineSeries } from '../shared/charts';
import { MoneyPipe, PctPipe } from '../shared/format';
import { Icon } from '../shared/icon';
import { Help, Notice, RangeSelector } from '../shared/ui';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, LineChart, Donut, MoneyPipe, PctPipe, Icon, Help, Notice, RangeSelector],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Hola, {{ auth.user()?.displayName }}</h1>
          <p>Así van tus inversiones{{ portfolio.lastRefresh() ? ' · precios de las ' + time(portfolio.lastRefresh()!) : '' }}</p>
        </div>
        <div class="row">
          @if (store.assets().length) {
            <button class="btn" (click)="refresh()" [disabled]="refreshing()">
              @if (refreshing()) { <span class="spinner"></span> } @else { <app-icon name="refresh" [size]="18" /> }
              Actualizar
            </button>
          }
          <a class="btn" routerLink="/importar"><app-icon name="upload" [size]="18" />Importar de Trade Republic</a>
          <a class="btn primary" routerLink="/nuevo"><app-icon name="plus" [size]="18" />Añadir inversión</a>
        </div>
      </header>

      @if (!market.hasTwelveData() || !market.hasFinnhub()) {
        <app-notice level="warning">
          Para ver precios en tiempo real y gráficas, añade tus claves gratuitas de
          <strong>Twelve Data</strong> y <strong>Finnhub</strong> en <a routerLink="/ajustes">Ajustes</a>. Sin ellas puedes
          seguir apuntando aportaciones y valores a mano.
        </app-notice>
      }

      @if (!store.assets().length) {
        <section class="card empty">
          <h2>Empieza añadiendo tu primera inversión</h2>
          <p>Puede ser una acción (Apple), un ETF (S&P 500), un fondo de tu banco o criptomonedas.<br />Solo necesitas saber cuánto dinero metiste y cuándo.</p>
          <div class="row" style="justify-content: center"><a class="btn primary" routerLink="/importar"><app-icon name="upload" [size]="18" />Importar de Trade Republic</a><a class="btn" routerLink="/nuevo"><app-icon name="plus" [size]="18" />Añadir a mano</a></div>
        </section>
      } @else {
        <section class="card hero">
          <div class="hero-main">
            <div class="label">Tu dinero invertido vale hoy</div>
            <div class="hero-value">{{ totals().value | money }}</div>
            <div class="hero-sub" [class.up]="totals().gain >= 0" [class.down]="totals().gain < 0">
              <app-icon [name]="totals().gain >= 0 ? 'arrowUp' : 'arrowDown'" [size]="16" />
              {{ totals().gain | money: '' : true }} ({{ totals().gainPct | pct }}) desde que empezaste
            </div>
            <p class="plain">{{ plainSentence() }}</p>
          </div>
          <div class="grid kpis">
            <div class="kpi">
              <div class="label">Dinero que has puesto<app-help term="Dinero puesto" text="Todo lo que has aportado menos lo que has retirado. Es tu dinero de bolsillo, sin contar ganancias." /></div>
              <div class="value">{{ totals().invested | money }}</div>
            </div>
            <div class="kpi">
              <div class="label">Ganancia / pérdida<app-help term="Ganancia" text="Diferencia entre lo que vale hoy tu inversión y lo que pusiste. Mientras no vendas, es 'sobre el papel'." /></div>
              <div class="value" [class.up]="totals().gain >= 0" [class.down]="totals().gain < 0">{{ totals().gain | money: '' : true }}</div>
            </div>
            <div class="kpi">
              <div class="label">Hoy<app-help term="Variación de hoy" text="Cuánto ha subido o bajado tu cartera en la sesión de bolsa de hoy." /></div>
              <div class="value" [class.up]="totals().dayChange >= 0" [class.down]="totals().dayChange < 0">{{ totals().dayChange | money: '' : true }}</div>
              <div class="sub">{{ totals().dayChangePct | pct }}</div>
            </div>
            <div class="kpi">
              <div class="label">Rentabilidad anual<app-help term="Rentabilidad anual" text="Lo que has ganado de media cada año, teniendo en cuenta cuándo metiste cada euro (TIR). Sirve para compararte con un depósito o con la inflación (~2-3 %)." /></div>
              <div class="value">{{ totals().annualPct === undefined ? '—' : (totals().annualPct | pct) }}</div>
              <div class="sub">{{ totals().annualPct === undefined ? 'Se calcula tras 3 meses' : 'al año' }}</div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Evolución de tu cartera<app-help term="Evolución" text="La línea continua es lo que vale tu cartera cada día; la discontinua, el dinero que habías puesto hasta ese día. Verde: vas ganando. Rojo: vas perdiendo." /></h2>
            <app-range-selector [(value)]="range" [exclude]="['1D']" (customChange)="custom.set($event)" />
          </div>
          @if (history.isLoading() && !history.hasValue()) {
            <div class="skeleton" style="height: 300px"></div>
          } @else if (history.error()) {
            <app-notice level="warning">No se pudo cargar el histórico: {{ errorText() }}</app-notice>
          } @else if (history.hasValue()) {
            @if (rangeChange(); as rc) {
              <p class="range-summary">
                En este periodo tu cartera ha
                <strong [class.up]="rc.diff >= 0" [class.down]="rc.diff < 0">{{ rc.diff >= 0 ? 'ganado' : 'perdido' }} {{ abs(rc.diff) | money }}</strong>
                sin contar el dinero nuevo que has metido.
              </p>
            }
            <app-line-chart [series]="chartSeries()" [height]="300" />
            @for (w of history.value().warnings; track w) {
              <p class="small muted">{{ w }}</p>
            }
          }
        </section>

        <div class="grid two">
          <section class="card">
            <div class="card-head">
              <h2 class="card-title">¿Cómo está repartido tu dinero?</h2>
              <div class="segmented small-seg">
                <button [class.on]="split() === 'asset'" (click)="split.set('asset')">Por inversión</button>
                <button [class.on]="split() === 'type'" (click)="split.set('type')">Por tipo</button>
              </div>
            </div>
            <app-donut [items]="split() === 'asset' ? portfolio.allocation().byAsset : portfolio.allocation().byType" />
          </section>

          <section class="card">
            <h2 class="card-title">Semáforo de tu cartera<app-help term="Semáforo" text="Comprobaciones automáticas sencillas. Para un análisis completo, pide una revisión al asesor." /></h2>
            <div class="stack">
              @for (i of insights(); track i.title) {
                <app-notice [level]="i.level"><strong>{{ i.title }}.</strong> {{ i.text }}</app-notice>
              }
              <a class="btn" routerLink="/asesor"><app-icon name="chat" [size]="18" />Pedir una revisión al asesor</a>
            </div>
          </section>
        </div>

        <section class="card">
          <h2 class="card-title">Tus inversiones</h2>
          <div class="assets">
            @for (s of sortedStats(); track s.asset.id) {
              <a class="asset" [routerLink]="['/activo', s.asset.id]">
                <span class="bar" [style.background]="portfolio.colorOf(s.asset)"></span>
                <div class="a-main">
                  <div class="a-name">{{ s.asset.name }}</div>
                  <div class="a-meta">
                    <span class="badge">{{ typeLabel[s.asset.type] }}</span>
                    @if (s.asset.symbol) { <span>{{ s.asset.symbol }}</span> } @else { <span>Valor manual</span> }
                    @if (live()[s.asset.id]?.loading) { <span class="spinner sm"></span> }
                    @if (live()[s.asset.id]?.error) { <span title="{{ live()[s.asset.id]?.error }}" class="down">sin precio</span> }
                  </div>
                </div>
                <div class="a-num">
                  <div class="a-value">{{ s.value | money }}</div>
                  <div class="a-gain" [class.up]="s.gain >= 0" [class.down]="s.gain < 0">{{ s.gain | money: '' : true }} · {{ s.gainPct | pct }}</div>
                  <div class="a-inv">Puesto: {{ s.invested | money }}</div>
                </div>
              </a>
            }
          </div>
        </section>
      }

      <p class="disclaimer">
        Esta app es una herramienta personal de seguimiento. Nada de lo que muestra es asesoramiento financiero profesional.
        Las rentabilidades pasadas no garantizan rentabilidades futuras.
      </p>
    </div>
  `,
  styles: `
    .hero { display: grid; grid-template-columns: minmax(260px, 1fr) 1.4fr; gap: 24px; align-items: center; }
    .hero .grid.kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hero .label { color: var(--text-2); font-size: 14px; }
    .hero-sub { display: flex; align-items: center; gap: 4px; font-weight: 600; margin-top: 6px; }
    .plain { margin-top: 12px; color: var(--text-2); font-size: 14px; background: var(--surface-2); border-radius: 6px; padding: 10px 12px; }
    .range-summary { color: var(--text-2); font-size: 14px; }
    .small-seg { min-width: 230px; }
    .small-seg button { font-size: 13px; padding: 6px; }
    .assets { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
    .asset { display: flex; gap: 12px; align-items: center; padding: 14px; border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--text); background: var(--surface); transition: background .15s; }
    .asset:hover { background: var(--surface-2); }
    .bar { width: 4px; align-self: stretch; border-radius: 4px; }
    .a-main { flex: 1; min-width: 0; }
    .a-name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .a-meta { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); margin-top: 2px; }
    .a-num { text-align: right; font-variant-numeric: tabular-nums; }
    .a-value { font-weight: 700; }
    .a-gain { font-size: 13px; font-weight: 600; }
    .a-inv { font-size: 12px; color: var(--muted); }
    .spinner.sm { width: 12px; height: 12px; }
    @media (max-width: 800px) {
      .hero { grid-template-columns: 1fr; }
      .assets { grid-template-columns: 1fr; }
    }
  `,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(StoreService);
  protected readonly portfolio = inject(PortfolioService);
  protected readonly market = inject(MarketDataService);
  readonly typeLabel = ASSET_TYPE_LABEL;

  readonly range = signal<RangeKey>('1A');
  readonly custom = signal<{ from: string; to: string } | undefined>(undefined);
  readonly split = signal<'asset' | 'type'>('asset');
  readonly refreshing = signal(false);
  readonly totals = this.portfolio.totals;
  readonly live = this.portfolio.live;

  readonly sortedStats = computed(() => [...this.portfolio.stats()].sort((a, b) => b.value - a.value));
  readonly insights = computed(() => this.portfolio.insights());

  readonly history = resource({
    params: () => {
      const earliest = this.portfolio.earliestDate();
      return {
        range: resolveRange(this.range(), earliest, this.custom()),
        assets: this.store.assets(),
        live: this.totals().value,
      };
    },
    loader: ({ params }) => this.portfolio.history(params.range, params.assets),
  });

  readonly chartSeries = computed<LineSeries[]>(() => {
    const h = this.history.value();
    if (!h) return [];
    return [
      { label: 'Valor de tu cartera', color: '#0ca30c', points: h.value, gainAgainst: 'Dinero que habías puesto' },
      { label: 'Dinero que habías puesto', color: '#898781', points: h.invested, dashed: true },
    ];
  });

  /** Ganancia del periodo descontando las aportaciones nuevas. */
  readonly rangeChange = computed(() => {
    const h = this.history.value();
    if (!h || h.value.length < 2) return null;
    const v0 = h.value[0].close;
    const v1 = h.value.at(-1)!.close;
    const i0 = h.invested[0].close;
    const i1 = h.invested.at(-1)!.close;
    return { diff: v1 - v0 - (i1 - i0) };
  });

  readonly plainSentence = computed(() => {
    const t = this.totals();
    if (t.invested <= 0) return 'Añade aportaciones para ver cómo evoluciona tu dinero.';
    const per100 = 100 + t.gainPct;
    return t.gain >= 0
      ? `En lenguaje llano: por cada 100 € que has puesto, ahora tienes ${per100.toFixed(2).replace('.', ',')} €.`
      : `En lenguaje llano: por cada 100 € que has puesto, ahora tienes ${per100.toFixed(2).replace('.', ',')} €. Las caídas temporales son normales; lo importante es el plazo.`;
  });

  constructor() {
    if (this.store.assets().some((a) => a.symbol) && !this.portfolio.lastRefresh()) void this.refresh();
  }

  async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.portfolio.refresh();
    } finally {
      this.refreshing.set(false);
    }
  }

  errorText(): string {
    const e = this.history.error();
    return e instanceof Error ? e.message : String(e);
  }

  time(t: number): string {
    return new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  abs(n: number): number {
    return Math.abs(n);
  }
}
