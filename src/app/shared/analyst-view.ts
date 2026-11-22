import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AiService } from '../core/ai.service';
import { analyze } from '../core/analyst';
import { MarketDataService } from '../core/market-data.service';
import { msg } from '../core/portfolio.service';
import { MarkdownPipe, MoneyPipe, PctPipe } from './format';
import { Help, Notice } from './ui';

/** Análisis de analistas explicado para quien no sabe de bolsa: precio objetivo, veredicto y plazo. */
@Component({
  selector: 'app-analyst-view',
  imports: [RouterLink, MoneyPipe, PctPipe, MarkdownPipe, Help, Notice],
  template: `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Qué dicen los analistas<app-help term="Analistas" text="Profesionales de bancos y casas de análisis que estudian la empresa y fijan un precio objetivo a 12 meses. Aciertan muchas veces, pero no siempre: úsalo como una opinión más." /></h2>
        @if (sourceLabel()) { <span class="small muted">Fuente: {{ sourceLabel() }}</span> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 180px"></div>
      } @else if (!market.hasAlphaVantage() && !market.hasFinnhub()) {
        <app-notice level="info">Añade la clave gratuita de <strong>Alpha Vantage</strong> en <a routerLink="/ajustes">Ajustes</a> para ver el precio objetivo de los analistas.</app-notice>
      } @else if (result(); as r) {
        <div class="verdict" [class]="r.verdict">
          <span class="tag">{{ verdictLabel(r.verdict) }}</span>
          <div>
            <strong>{{ r.title }}</strong>
            <div class="small">Plazo: {{ r.horizon }}</div>
          </div>
        </div>

        <div class="grid kpis tight">
          <div class="kpi">
            <div class="label">Precio actual</div>
            <div class="value">{{ price() | money: currency() }}</div>
          </div>
          <div class="kpi">
            <div class="label">Precio objetivo<app-help term="Precio objetivo" text="La media de los precios a los que los analistas creen que llegará la acción en unos 12 meses." /></div>
            <div class="value">{{ target() ? (target() | money: currency()) : '—' }}</div>
            @if (r.upside !== undefined) {
              <div class="sub" [class.up]="r.upside >= 0" [class.down]="r.upside < 0">{{ r.upside | pct }} de recorrido</div>
            }
          </div>
          <div class="kpi">
            <div class="label">Consenso</div>
            <div class="value">{{ r.consensusLabel }}</div>
            @if (r.analysts) { <div class="sub">{{ r.analysts }} analistas</div> }
          </div>
        </div>

        @if (r.analysts) {
          <div class="stackbar" role="img" [attr.aria-label]="'Comprar ' + r.buyPct.toFixed(0) + '%, mantener ' + r.holdPct.toFixed(0) + '%, vender ' + r.sellPct.toFixed(0) + '%'">
            @if (r.buyPct) { <span class="buy" [style.flex]="r.buyPct"></span> }
            @if (r.holdPct) { <span class="hold" [style.flex]="r.holdPct"></span> }
            @if (r.sellPct) { <span class="sell" [style.flex]="r.sellPct"></span> }
          </div>
          <div class="row small text-2 legend">
            <span><i class="buy"></i>Comprar {{ r.buyPct.toFixed(0) }} %</span>
            <span><i class="hold"></i>Mantener {{ r.holdPct.toFixed(0) }} %</span>
            <span><i class="sell"></i>Vender {{ r.sellPct.toFixed(0) }} %</span>
          </div>
        }

        <ul class="points">
          @for (p of r.points; track p) { <li>{{ p }}</li> }
        </ul>

        @if (ai.isConfigured()) {
          @if (aiText()) {
            <div class="md ai" [innerHTML]="aiText() | markdown"></div>
          }
          @if (aiError()) { <p class="error small">{{ aiError() }}</p> }
          <button class="btn sm" (click)="explain()" [disabled]="aiBusy()">
            @if (aiBusy()) { <span class="spinner"></span> {{ aiStatus() || 'Preparando la explicación...' }} } @else { Explicármelo más a fondo }
          </button>
        }
        <p class="disclaimer">Opinión de terceros, no una recomendación personal. Los precios objetivo se equivocan a menudo.</p>
      } @else if (error()) {
        <app-notice level="warning">{{ error() }}</app-notice>
      }
    </section>
  `,
  styles: `
    .verdict { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 8px; margin-bottom: 14px; border: 1px solid var(--border); }
    .verdict .tag { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; padding: 6px 10px; border-radius: 6px; color: #fff; background: var(--muted); }
    .verdict.comprar .tag { background: var(--gain); }
    .verdict.vender .tag { background: var(--loss); }
    .verdict.mantener .tag { background: #8a6d1f; }
    .tight { margin-bottom: 14px; }
    .stackbar { display: flex; gap: 2px; height: 10px; border-radius: 3px; overflow: hidden; }
    .stackbar .buy, .legend .buy { background: var(--gain); }
    .stackbar .hold, .legend .hold { background: #a8a69e; }
    .stackbar .sell, .legend .sell { background: var(--loss); }
    .legend { margin-top: 6px; gap: 14px; }
    .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
    .points { margin: 14px 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; }
    .ai { background: var(--surface-2); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; font-size: 14px; }
  `,
})
export class AnalystView {
  protected readonly market = inject(MarketDataService);
  protected readonly ai = inject(AiService);
  readonly symbol = input.required<string>();
  readonly isEtf = input(false);

  readonly aiText = signal('');
  readonly aiBusy = signal(false);
  readonly aiError = signal('');
  readonly aiStatus = signal('');

  private readonly data = resource({
    params: () => this.symbol(),
    loader: async ({ params }) => {
      const [overview, trends, quote] = await Promise.all([
        this.market.hasAlphaVantage() ? this.market.overview(params).catch((e) => ({ error: msg(e) })) : Promise.resolve(null),
        this.market.hasFinnhub() ? this.market.analystTrends(params).catch(() => []) : Promise.resolve([]),
        this.market.quote(params).catch(() => undefined),
      ]);
      return { overview, trends, quote };
    },
  });

  readonly loading = computed(() => this.data.isLoading());
  private readonly overview = computed(() => {
    const o = this.data.value()?.overview;
    return o && !('error' in o) ? o : null;
  });
  readonly error = computed(() => {
    const o = this.data.value()?.overview;
    if (o && 'error' in o) return o.error;
    return this.data.error() ? msg(this.data.error()) : '';
  });

  readonly price = computed(() => this.data.value()?.quote?.price ?? 0);
  readonly target = computed(() => this.overview()?.targetPrice);
  readonly currency = computed(() => this.overview()?.currency || 'USD');

  readonly sourceLabel = computed(() => (this.overview() ? 'Alpha Vantage' : this.data.value()?.trends?.length ? 'Finnhub' : ''));

  readonly result = computed(() => {
    const d = this.data.value();
    if (!d || !this.price()) return null;
    const o = this.overview();
    // Si Alpha Vantage no da opiniones, se usan las de Finnhub (sin precio objetivo).
    const t = d.trends?.at(-1);
    const counts = o && o.strongBuy + o.buy + o.hold + o.sell + o.strongSell > 0 ? o : t;
    return analyze({
      price: this.price(),
      targetPrice: o?.targetPrice,
      strongBuy: counts?.strongBuy ?? 0,
      buy: counts?.buy ?? 0,
      hold: counts?.hold ?? 0,
      sell: counts?.sell ?? 0,
      strongSell: counts?.strongSell ?? 0,
      beta: o?.beta,
      pe: o?.pe,
      isEtf: this.isEtf(),
    });
  });

  verdictLabel(v: string): string {
    return { comprar: 'Comprar', mantener: 'Mantener', vender: 'Vender', 'sin-datos': 'Sin datos' }[v] ?? v;
  }

  async explain(): Promise<void> {
    const r = this.result();
    if (!r) return;
    this.aiBusy.set(true);
    this.aiError.set('');
    this.aiStatus.set('');
    const o = this.overview();
    try {
      const res = await this.ai.ask({
        system:
          'Explicas acciones a personas que no saben nada de bolsa. Español de España, frases cortas, sin jerga (si usas un término, explícalo). Máximo 180 palabras. No inventes cifras: usa solo los datos que te doy.',
        messages: [
          {
            role: 'user',
            content: `Explícame en lenguaje sencillo esta acción y qué opinan los analistas: si tiene sentido comprar, mantener o vender, durante cuánto tiempo y qué riesgos tiene.
Datos: ${this.symbol()} ${o?.name ?? ''} (${o?.sector ?? ''}). Precio ${this.price()}. Precio objetivo ${o?.targetPrice ?? 'desconocido'}. Analistas: ${r.analysts} (comprar ${r.buyPct.toFixed(0)}%, mantener ${r.holdPct.toFixed(0)}%, vender ${r.sellPct.toFixed(0)}%). PER ${o?.pe ?? '—'}, beta ${o?.beta ?? '—'}, dividendo ${o?.dividendYield ? (o.dividendYield * 100).toFixed(2) + '%' : '—'}, margen ${o?.profitMargin ? (o.profitMargin * 100).toFixed(1) + '%' : '—'}.
Descripción de la empresa: ${(o?.description ?? '').slice(0, 600)}`,
          },
        ],
        effort: 'low',
        onText: (t) => this.aiText.set(t),
        onStatus: (s) => this.aiStatus.set(s),
      });
      this.aiText.set(res.text);
    } catch (e) {
      this.aiError.set(msg(e));
    } finally {
      this.aiBusy.set(false);
    }
  }
}
