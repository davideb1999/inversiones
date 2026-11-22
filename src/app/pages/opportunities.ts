import { Component, OnDestroy, OnInit, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../core/ai.service';
import { MarketDataService } from '../core/market-data.service';
import { Horizon, Recommendation } from '../core/models';
import { OpportunitiesService, expectedMove } from '../core/opportunities.service';
import { msg } from '../core/portfolio.service';
import { Aligned, BENCHMARK, QuantService, UNIVERSE, backtest, explainPick, rank } from '../core/quant';
import { StoreService } from '../core/store.service';
import { LineChart, LineSeries } from '../shared/charts';
import { FechaPipe, MarkdownPipe, MoneyPipe, PctPipe } from '../shared/format';
import { Icon } from '../shared/icon';
import { Help, Notice } from '../shared/ui';
import { GurusPage } from './gurus';

const HORIZON_LABEL: Record<Horizon, string> = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual' };
const HOLD_TEXT: Record<Horizon, string> = { diario: '1 día', semanal: '1 semana', mensual: '1 mes', anual: '1 año' };
const HORIZON_HELP: Record<Horizon, string> = {
  diario: 'Ideas para la próxima sesión. A un día vista la bolsa es casi aleatoria: tómalo como curiosidad, no como estrategia.',
  semanal: 'Ideas para la próxima semana. Siguen siendo muy especulativas.',
  mensual: 'Ideas para el próximo mes. Las tendencias a medio plazo son algo más fiables.',
  anual: 'Ideas para los próximos 12 meses. Es el plazo en el que este tipo de modelo históricamente funciona mejor.',
};

@Component({
  selector: 'app-opportunities',
  imports: [RouterLink, GurusPage, LineChart, MoneyPipe, PctPipe, FechaPipe, MarkdownPipe, Icon, Help, Notice],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Oportunidades</h1>
          <p>Ideas de un modelo con su simulación del último año, y lo que compran los grandes inversores.</p>
        </div>
      </header>

      <div class="segmented section-switch" role="tablist">
        <button role="tab" [class.on]="section() === 'modelo'" (click)="section.set('modelo')">Ideas del modelo</button>
        <button role="tab" [class.on]="section() === 'inversores'" (click)="section.set('inversores')">Grandes inversores</button>
      </div>

      @if (section() === 'inversores') {
        <app-gurus [embedded]="true" />
      } @else {

      @if (!market.hasTwelveData()) {
        <app-notice level="warning">Necesitas la clave gratuita de <strong>Twelve Data</strong> para calcular las oportunidades. <a routerLink="/ajustes">Ir a Ajustes</a></app-notice>
      }

      <div class="tabs" role="tablist">
        @for (h of horizons; track h) {
          <button role="tab" [class.on]="horizon() === h" [attr.aria-selected]="horizon() === h" (click)="horizon.set(h)">{{ label[h] }}</button>
        }
      </div>

      @if (loading()) {
        <section class="card">
          <div class="row"><span class="spinner"></span><strong>Descargando precios ({{ progress().done }}/{{ progress().total }})</strong></div>
          <div class="meter"><span [style.width.%]="(progress().done / progress().total) * 100"></span></div>
          <p class="small muted">El plan gratuito de datos permite 8 consultas por minuto, así que la primera vez tarda unos 3 minutos. Después se guarda y es inmediato.</p>
        </section>
      } @else if (loadError()) {
        <app-notice level="critical">{{ loadError() }} <button class="btn sm" (click)="load()">Reintentar</button></app-notice>
      }

      @if (data()) {
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">Ideas para {{ hold[horizon()] }}<app-help [term]="label[horizon()]" [text]="help[horizon()]" /></h2>
              <div class="small muted">Precios al cierre del {{ lastDate() | fecha }} · modelo de tendencia ajustada al riesgo</div>
            </div>
          </div>
          <div class="ideas">
            @for (p of picks(); track p.symbol; let i = $index) {
              <article class="idea">
                <header>
                  <a class="sym" [routerLink]="['/mercado', p.symbol]">{{ p.symbol }}</a>
                  <span class="badge">{{ p.type === 'etf' ? 'ETF' : 'Acción' }}</span>
                  <span class="spacer"></span>
                  <span class="rank">#{{ i + 1 }}</span>
                </header>
                <div class="name">{{ p.name }}</div>
                <div class="stats">
                  <div><span class="small muted">Tendencia</span><strong [class.up]="p.momentum >= 0" [class.down]="p.momentum < 0">{{ p.momentum | pct }}</strong></div>
                  <div><span class="small muted">Objetivo orientativo</span><strong>+{{ expected(p) }} %</strong></div>
                  <div><span class="small muted">Riesgo</span><strong>{{ explain(p).risk }}</strong></div>
                </div>
                <p class="why">{{ explain(p).reason }}</p>
                <p class="risks"><strong>Qué puede salir mal:</strong> {{ explain(p).risks }}</p>
                <footer>
                  <span>Precio: <strong>{{ p.price | money: 'USD' }}</strong></span>
                  <a [routerLink]="['/mercado', p.symbol]">Ver análisis</a>
                </footer>
              </article>
            }
          </div>
          <p class="small muted">Estas ideas se guardan solas en el registro de abajo para comprobar si aciertan.</p>
        </section>

        <section class="card">
          <h2 class="card-title">Si hubieras seguido el modelo hace un año<app-help term="Simulación" text="Repetimos el modelo hacia atrás con precios reales: en cada fecha elige las 5 mejores usando solo lo que se sabía ese día (sin conocer el futuro), las mantiene el plazo elegido y mide qué pasó. No incluye comisiones ni impuestos." /></h2>
          @if (bt(); as b) {
            <div class="grid kpis">
              <div class="kpi">
                <div class="label">1.000 € con el modelo</div>
                <div class="value" [class.up]="b.totalReturn >= 0" [class.down]="b.totalReturn < 0">{{ 1000 * (1 + b.totalReturn / 100) | money: 'EUR' }}</div>
                <div class="sub">{{ b.totalReturn | pct }}</div>
              </div>
              <div class="kpi">
                <div class="label">1.000 € en el S&P 500</div>
                <div class="value">{{ 1000 * (1 + b.marketReturn / 100) | money: 'EUR' }}</div>
                <div class="sub">{{ b.marketReturn | pct }}</div>
              </div>
              <div class="kpi">
                <div class="label">Ideas que subieron</div>
                <div class="value">{{ b.hitRate.toFixed(0) }} %</div>
                <div class="sub">de {{ b.picks }} ideas</div>
              </div>
              <div class="kpi">
                <div class="label">Periodos que batió al mercado</div>
                <div class="value">{{ b.beatRate.toFixed(0) }} %</div>
                <div class="sub">{{ b.periods.length }} {{ b.periods.length === 1 ? 'periodo' : 'periodos' }}</div>
              </div>
            </div>
            <p class="verdict-line">{{ btSentence() }}</p>
            <app-line-chart [series]="btSeries()" [height]="260" currency="EUR" />

            @if (horizon() === 'anual') {
              <h3 class="sub-h">Lo que habría recomendado el {{ b.periods[0].from | fecha }}</h3>
              <div class="table-scroll">
                <table class="data">
                  <thead><tr><th>Valor</th><th class="num">Resultado en un año</th></tr></thead>
                  <tbody>
                    @for (r of b.periods[0].picks; track r.symbol) {
                      <tr><td><a [routerLink]="['/mercado', r.symbol]"><strong>{{ r.symbol }}</strong></a> <span class="small muted">{{ nameOf(r.symbol) }}</span></td>
                        <td class="num" [class.up]="r.ret >= 0" [class.down]="r.ret < 0">{{ r.ret | pct }}</td></tr>
                    }
                    <tr class="total"><td>Media de las 5 ideas</td><td class="num" [class.up]="b.periods[0].ret >= 0" [class.down]="b.periods[0].ret < 0">{{ b.periods[0].ret | pct }}</td></tr>
                    <tr><td>S&P 500 (el mercado)</td><td class="num">{{ b.periods[0].benchmark | pct }}</td></tr>
                  </tbody>
                </table>
              </div>
            } @else {
              <h3 class="sub-h">Últimos periodos simulados</h3>
              <div class="table-scroll">
                <table class="data">
                  <thead><tr><th>Desde</th><th>Ideas</th><th class="num">Resultado</th><th class="num">S&P 500</th></tr></thead>
                  <tbody>
                    @for (p of recentPeriods(); track p.from) {
                      <tr>
                        <td>{{ p.from | fecha }}</td>
                        <td class="small">{{ symbolsOf(p) }}</td>
                        <td class="num" [class.up]="p.ret >= 0" [class.down]="p.ret < 0">{{ p.ret | pct }}</td>
                        <td class="num">{{ p.benchmark | pct }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <p class="disclaimer">Simulación con precios reales. Que algo funcionara el último año no garantiza que funcione el siguiente.</p>
          } @else {
            <p class="muted">No hay suficiente historia de precios para simular este plazo.</p>
          }
        </section>
      }

      <section class="grid kpis">
        @for (s of opp.stats(); track s.horizon) {
          <button class="kpi score" [class.on]="horizon() === s.horizon" (click)="horizon.set(s.horizon)">
            <div class="label">Registro · {{ label[s.horizon] }}</div>
            @if (s.evaluated) {
              <div class="value">{{ s.hitRate.toFixed(0) }} % <span class="small muted">aciertos</span></div>
              <div class="meter"><span [style.width.%]="s.hitRate"></span></div>
              <div class="sub">{{ s.hits }}/{{ s.evaluated }} · media {{ s.avgResult | pct }}</div>
            } @else {
              <div class="value muted">—</div>
              <div class="sub">{{ s.pending ? s.pending + ' pendientes de comprobar' : 'Sin historial todavía' }}</div>
            }
          </button>
        }
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Registro de recomendaciones<app-help term="Registro" text="Cada idea se comprueba automáticamente cuando termina su plazo: si subió, cuenta como acierto. También se compara con el S&P 500." /></h2>
          <div class="row">
            @if (opp.evaluating()) { <span class="small muted"><span class="spinner"></span> Comprobando...</span> }
            <select [value]="historyFilter()" (change)="historyFilter.set($any($event.target).value)" style="width: auto">
              <option value="todas">Todos los plazos</option>
              @for (h of horizons; track h) { <option [value]="h">{{ label[h] }}</option> }
            </select>
          </div>
        </div>
        @if (history().length) {
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Fecha</th><th>Plazo</th><th>Valor</th><th>Origen</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Resultado</th><th class="num">S&P 500</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (r of history(); track r.id) {
                  <tr>
                    <td>{{ r.createdAt | fecha }}</td>
                    <td>{{ label[r.horizon] }}</td>
                    <td><a [routerLink]="['/mercado', r.symbol]"><strong>{{ r.symbol }}</strong></a></td>
                    <td class="small muted">{{ r.source === 'ia' ? 'IA' : 'Modelo' }}</td>
                    <td class="num">{{ r.entryPrice ? (r.entryPrice | money: 'USD') : '—' }}</td>
                    <td class="num">{{ r.exitPrice ? (r.exitPrice | money: 'USD') : '—' }}</td>
                    <td class="num" [class.up]="(r.resultPct ?? 0) > 0" [class.down]="(r.resultPct ?? 0) < 0">{{ r.resultPct === undefined ? '—' : (r.resultPct | pct) }}</td>
                    <td class="num">{{ r.benchmarkPct === undefined ? '—' : (r.benchmarkPct | pct) }}</td>
                    <td>
                      @switch (r.status) {
                        @case ('acierto') { <span class="badge good">Acierto</span> }
                        @case ('fallo') { <span class="badge bad">Fallo</span> }
                        @case ('sin-datos') { <span class="badge">Sin datos</span> }
                        @default { <span class="badge">Hasta {{ r.evaluateOn | fecha }}</span> }
                      }
                    </td>
                    <td><button class="btn ghost sm" (click)="remove(r)" aria-label="Eliminar"><app-icon name="trash" [size]="15" /></button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="muted">Aún no hay recomendaciones guardadas.</p>
        }
      </section>

      @if (ai.isConfigured()) {
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">Segunda opinión de la IA</h2>
              <div class="small muted">Opcional. La IA propone sus propias ideas con las noticias del día; también se guardan en el registro.</div>
            </div>
            <button class="btn" (click)="generateAi()" [disabled]="generating()">
              @if (generating()) { <span class="spinner"></span> {{ aiStatus() || 'Pensando...' }} } @else { Pedir ideas a la IA }
            </button>
          </div>
          @if (aiError()) { <p class="error">{{ aiError() }}</p> }
          @if (generating() && progressText()) { <div class="md summary" [innerHTML]="progressText() | markdown"></div> }
          @if (aiIdeas().length) {
            @if (aiBatch(); as b) { <div class="md summary" [innerHTML]="b.marketSummary | markdown"></div> }
            <ul class="ai-list">
              @for (r of aiIdeas(); track r.id) {
                <li><a [routerLink]="['/mercado', r.symbol]"><strong>{{ r.symbol }}</strong></a> · {{ r.name }} · {{ r.direction === 'sube' ? 'sube' : 'baja' }} ~{{ r.expectedPct }} % — <span class="text-2">{{ r.reason }}</span></li>
              }
            </ul>
          }
        </section>
      }

      <p class="disclaimer">Las ideas salen de un modelo matemático sencillo (y, si lo pides, de una IA). No son recomendaciones de compra o venta. Invierte solo dinero que puedas permitirte perder, sobre todo en plazos cortos.</p>
      }
    </div>
  `,
  styles: `
    .section-switch { max-width: 420px; }
    .score { text-align: left; font: inherit; color: inherit; cursor: pointer; }
    .score.on { border-color: var(--text); }
    .meter { height: 4px; border-radius: 2px; background: var(--chip); margin: 8px 0 6px; overflow: hidden; }
    .meter span { display: block; height: 100%; background: var(--text); }
    .ideas { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .idea { border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: grid; gap: 8px; align-content: start; }
    .idea header { display: flex; align-items: center; gap: 8px; }
    .sym { font-size: 18px; font-weight: 700; color: var(--text); text-decoration: none; letter-spacing: -0.01em; }
    .rank { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .name { color: var(--text-2); font-size: 14px; margin-top: -6px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 8px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .stats div { display: grid; }
    .stats strong { font-variant-numeric: tabular-nums; text-transform: capitalize; }
    .why { font-size: 14px; margin: 0; }
    .risks { font-size: 13px; color: var(--text-2); margin: 0; }
    .idea footer { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
    .verdict-line { margin: 14px 0 6px; font-weight: 600; }
    .sub-h { margin: 18px 0 8px; font-size: 15px; }
    tr.total td { font-weight: 700; }
    .summary { background: var(--surface-2); border-radius: 8px; padding: 12px 14px; margin: 8px 0; font-size: 14px; }
    .ai-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; }
  `,
})
export class OpportunitiesPage implements OnInit, OnDestroy {
  private abort?: AbortController;
  protected readonly store = inject(StoreService);
  protected readonly ai = inject(AiService);
  protected readonly market = inject(MarketDataService);
  protected readonly opp = inject(OpportunitiesService);
  private readonly quant = inject(QuantService);

  readonly horizons: Horizon[] = ['diario', 'semanal', 'mensual', 'anual'];
  readonly label = HORIZON_LABEL;
  readonly hold = HOLD_TEXT;
  readonly help = HORIZON_HELP;
  readonly horizon = signal<Horizon>('anual');
  /** ?seccion=inversores abre directamente la pestaña de grandes inversores. */
  readonly seccion = input<string>('');
  readonly section = linkedSignal<'modelo' | 'inversores'>(() => (this.seccion() === 'inversores' ? 'inversores' : 'modelo'));
  readonly historyFilter = signal<'todas' | Horizon>('todas');

  readonly data = signal<Aligned | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly progress = signal({ done: 0, total: 1 });

  readonly generating = signal(false);
  readonly progressText = signal('');
  readonly aiStatus = signal('');
  readonly aiError = signal('');

  readonly lastDate = computed(() => this.data()?.dates.at(-1));
  readonly picks = computed(() => {
    const d = this.data();
    return d ? rank(d, d.dates.length - 1, this.horizon()).slice(0, 5) : [];
  });
  readonly bt = computed(() => {
    const d = this.data();
    return d ? backtest(d, this.horizon()) : null;
  });
  readonly btSeries = computed<LineSeries[]>(() => {
    const b = this.bt();
    if (!b) return [];
    return [
      { label: 'Siguiendo el modelo', color: '#0ca30c', points: b.curve.map((c) => ({ t: c.t, close: Math.round(c.model) })), gainAgainst: 'S&P 500' },
      { label: 'S&P 500', color: '#898781', points: b.curve.map((c) => ({ t: c.t, close: Math.round(c.market) })), dashed: true },
    ];
  });
  readonly btSentence = computed(() => {
    const b = this.bt();
    if (!b) return '';
    const diff = b.totalReturn - b.marketReturn;
    const res = b.totalReturn >= 0 ? `habrías ganado un ${b.totalReturn.toFixed(1)} %` : `habrías perdido un ${Math.abs(b.totalReturn).toFixed(1)} %`;
    return `Siguiendo estas ideas durante el último año ${res}; ${
      diff >= 0 ? `${diff.toFixed(1)} puntos más` : `${Math.abs(diff).toFixed(1)} puntos menos`
    } que comprando el S&P 500 y olvidándote.`;
  });
  readonly recentPeriods = computed(() => (this.bt()?.periods ?? []).slice(-10).reverse());

  readonly history = computed(() => {
    const f = this.historyFilter();
    return this.store.recommendations().filter((r) => f === 'todas' || r.horizon === f);
  });
  readonly aiBatch = computed(() => this.store.batches().find((b) => b.source === 'ia' && b.horizon === this.horizon()));
  readonly aiIdeas = computed(() => {
    const b = this.aiBatch();
    return b ? this.store.recommendations().filter((r) => r.batchId === b.id) : [];
  });

  ngOnInit(): void {
    void this.opp.evaluatePending();
    if (this.market.hasTwelveData()) void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.abort = new AbortController();
      const d = await this.quant.load((done, total) => this.progress.set({ done, total }), this.abort.signal);
      this.data.set(d);
      // Se guardan las ideas de hoy de cada plazo en el registro, para comprobarlas después.
      const last = d.dates.length - 1;
      const spy = d.closes[BENCHMARK][last];
      for (const h of this.horizons) this.opp.saveModelPicks(h, rank(d, last, h).slice(0, 5), spy);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) this.loadError.set(msg(e));
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.abort?.abort();
  }

  explain(p: ReturnType<typeof rank>[number]) {
    return explainPick(p, this.horizon());
  }

  expected(p: ReturnType<typeof rank>[number]): number {
    return expectedMove(p, this.horizon());
  }

  nameOf(symbol: string): string {
    return UNIVERSE.find((u) => u.symbol === symbol)?.name ?? '';
  }

  symbolsOf(p: { picks: { symbol: string }[] }): string {
    return p.picks.map((x) => x.symbol).join(', ');
  }

  async generateAi(): Promise<void> {
    this.generating.set(true);
    this.progressText.set('');
    this.aiStatus.set('');
    this.aiError.set('');
    try {
      await this.opp.generate(this.horizon(), (t) => this.progressText.set(t), (s) => this.aiStatus.set(s));
    } catch (e) {
      this.aiError.set(msg(e));
    } finally {
      this.generating.set(false);
    }
  }

  remove(r: Recommendation): void {
    if (confirm(`¿Quitar ${r.symbol} del registro? Dejará de contar en las estadísticas.`)) this.store.removeRecommendation(r.id);
  }

}
