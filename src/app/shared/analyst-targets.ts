import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalystTarget, MarketDataService, TargetConsensus } from '../core/market-data.service';
import { msg } from '../core/portfolio.service';
import { TargetStats, targetStats, valuate } from '../core/valuation';
import { FechaPipe, MoneyPipe, PctPipe } from './format';
import { Help, Notice } from './ui';

/**
 * Barra del rango de precios objetivo: línea discontinua del mínimo al máximo, caja con el 50 % central
 * de los analistas (del 25 % al 75 %), mediana, media y precio actual.
 */
@Component({
  selector: 'app-target-bar',
  imports: [MoneyPipe],
  template: `
    <div class="bar" role="img" [attr.aria-label]="aria()">
      <div class="plot">
        <span class="whisker" [style.left.%]="pos(s().low)" [style.width.%]="pos(s().high) - pos(s().low)"></span>
        <span class="cap" [style.left.%]="pos(s().low)"></span>
        <span class="cap" [style.left.%]="pos(s().high)"></span>
        @if (s().p25 !== undefined && s().p75 !== undefined) {
          <span class="box" [style.left.%]="pos(s().p25!)" [style.width.%]="pos(s().p75!) - pos(s().p25!)"></span>
        }
        @if (s().median !== undefined) { <span class="median" [style.left.%]="pos(s().median!)" title="Mediana"></span> }
        <span class="mean" [style.left.%]="pos(s().mean)" title="Media"></span>
        <span class="now" [style.left.%]="pos(price())"><b>Actual {{ price() | money: currency() }}</b></span>
      </div>
      <div class="labels">
        <span [style.left.%]="pos(s().low)">Mín<br /><strong>{{ s().low | money: currency() }}</strong></span>
        <span [style.left.%]="pos(s().mean)" class="mid">Media<br /><strong>{{ s().mean | money: currency() }}</strong></span>
        <span [style.left.%]="pos(s().high)">Máx<br /><strong>{{ s().high | money: currency() }}</strong></span>
      </div>
      <ul class="legend">
        <li><i class="l-whisker"></i>Todos los analistas</li>
        @if (s().p25 !== undefined) { <li><i class="l-box"></i>El 50 % central</li> }
        <li><i class="l-mean"></i>Media</li>
        @if (s().median !== undefined) { <li><i class="l-median"></i>Mediana</li> }
        <li><i class="l-now"></i>Precio actual</li>
      </ul>
    </div>
  `,
  styles: `
    .bar { padding: 30px 6px 0; }
    .plot { position: relative; height: 34px; }
    .whisker { position: absolute; top: 16px; border-top: 2px dashed var(--muted); }
    .cap { position: absolute; top: 9px; width: 2px; height: 16px; background: var(--muted); transform: translateX(-1px); }
    .box { position: absolute; top: 6px; height: 22px; background: color-mix(in srgb, var(--text) 14%, transparent); border: 1.5px solid var(--text); border-radius: 3px; }
    .median { position: absolute; top: 6px; width: 3px; height: 22px; background: var(--text); transform: translateX(-1.5px); }
    .mean { position: absolute; top: 11px; width: 12px; height: 12px; background: var(--gain); border: 2px solid var(--surface); border-radius: 50%; transform: translateX(-6px); }
    .now { position: absolute; top: -6px; height: 46px; width: 2px; background: var(--loss); transform: translateX(-1px); }
    .now b { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 12px; font-weight: 600; color: var(--loss); margin-bottom: 2px; }
    .labels { position: relative; height: 40px; margin-top: 6px; font-size: 12px; color: var(--muted); }
    .labels span { position: absolute; transform: translateX(-50%); text-align: center; white-space: nowrap; }
    .labels strong { color: var(--text); font-variant-numeric: tabular-nums; }
    .labels span:first-child { transform: translateX(-10%); }
    .labels span:last-child { transform: translateX(-90%); }
    .legend { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--text-2); }
    .legend li { display: flex; align-items: center; gap: 6px; }
    .legend i { display: inline-block; }
    .l-whisker { width: 16px; border-top: 2px dashed var(--muted); }
    .l-box { width: 14px; height: 10px; border: 1.5px solid var(--text); background: color-mix(in srgb, var(--text) 14%, transparent); border-radius: 2px; }
    .l-mean { width: 10px; height: 10px; border-radius: 50%; background: var(--gain); }
    .l-median { width: 3px; height: 12px; background: var(--text); }
    .l-now { width: 2px; height: 12px; background: var(--loss); }
  `,
})
export class TargetBar {
  readonly s = input.required<TargetStats>();
  readonly price = input.required<number>();
  readonly currency = input('USD');

  private readonly range = computed(() => {
    const s = this.s();
    const lo = Math.min(s.low, this.price());
    const hi = Math.max(s.high, this.price());
    const pad = (hi - lo) * 0.06 || hi * 0.05;
    return { min: lo - pad, max: hi + pad };
  });

  pos(v: number): number {
    const { min, max } = this.range();
    return ((v - min) / (max - min)) * 100;
  }

  aria(): string {
    const s = this.s();
    return `Precio objetivo de los analistas entre ${s.low} y ${s.high}, media ${s.mean}; precio actual ${this.price()}`;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Tarjeta "Objetivos de los analistas" al estilo Investing Pro. */
@Component({
  selector: 'app-analyst-targets',
  imports: [RouterLink, TargetBar, MoneyPipe, PctPipe, FechaPipe, Help, Notice],
  template: `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Precio objetivo de los analistas<app-help term="Rango de mercado" text="Cada analista fija el precio al que cree que llegará la acción en 12 meses. La línea discontinua va del más pesimista al más optimista; la caja recoge al 50 % de analistas del centro (sin los extremos)." /></h2>
        @if (source()) { <span class="small muted">Fuente: {{ source() }}</span> }
      </div>
      @if (data.isLoading()) {
        <div class="skeleton" style="height: 150px"></div>
      } @else if (stats(); as s) {
        <div class="metrics">
          <div><span class="label">Rango de mercado<app-help term="Rango de mercado" text="Del precio objetivo más bajo al más alto de todos los analistas." /></span><strong>{{ s.low | money: cur() }} – {{ s.high | money: cur() }}</strong></div>
          <div><span class="label">Recorrido medio<app-help term="Recorrido medio" text="Cuánto subiría (o bajaría) la acción si llegara al precio objetivo medio." /></span><strong [class.up]="s.upside >= 0" [class.down]="s.upside < 0">{{ s.upside | pct }}</strong></div>
          <div><span class="label">Incertidumbre<app-help term="Incertidumbre" text="Si los analistas están de acuerdo (baja) o muy repartidos (alta). Se mide por la distancia entre el objetivo más alto y el más bajo respecto a la media." /></span><strong>{{ s.uncertainty }}</strong></div>
          <div><span class="label">Dispersión<app-help term="Dispersión" text="Diferencia entre el objetivo más alto y el más bajo." /></span><strong>{{ s.spread | money: cur() }}</strong><span class="small muted"> ({{ s.spreadPct.toFixed(0) }} % de la media)</span></div>
        </div>
        <app-target-bar [s]="s" [price]="price()" [currency]="cur()" />
        @if (s.p25 === undefined && individual().length < 4) {
          <p class="small muted">Sin los objetivos de cada analista no se puede dibujar la caja del 50 % central.</p>
        }
        @if (individual().length) {
          <h3 class="sub-h">Últimos objetivos publicados</h3>
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Fecha</th><th>Casa de análisis</th><th class="num">Objetivo</th><th class="num">vs. hoy</th></tr></thead>
              <tbody>
                @for (t of individual().slice(0, 10); track t.firm) {
                  <tr>
                    <td>{{ t.date | fecha }}</td>
                    <td>{{ t.firm }}</td>
                    <td class="num">{{ t.target | money: cur() }}</td>
                    <td class="num" [class.up]="t.target >= price()" [class.down]="t.target < price()">{{ (t.target / price() - 1) * 100 | pct }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <app-notice level="info">
          @if (fmpError()) { {{ fmpError() }} }
          Para ver el rango completo (mínimo, máximo y la caja del 50 % central) añade la clave gratuita de
          <strong>Financial Modeling Prep</strong> en <a routerLink="/ajustes">Ajustes</a>.
        </app-notice>
      }
    </section>
  `,
  styles: `
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .metrics > div { background: var(--surface); padding: 10px 12px; display: grid; gap: 2px; }
    .metrics .label { font-size: 12px; color: var(--muted); display: flex; align-items: center; }
    .metrics strong { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .sub-h { margin: 18px 0 6px; font-size: 15px; }
  `,
})
export class AnalystTargets {
  private readonly market = inject(MarketDataService);
  readonly symbol = input.required<string>();

  readonly data = resource({
    params: () => this.symbol(),
    loader: async ({ params }) => {
      const quote = await this.market.quote(params).catch(() => undefined);
      let consensus: TargetConsensus | null = null;
      let individual: AnalystTarget[] = [];
      let fmpError = '';
      if (this.market.hasFmp()) {
        [consensus, individual] = await Promise.all([
          this.market.targetConsensus(params).catch((e) => ((fmpError = msg(e)), null)),
          this.market.analystTargets(params).catch(() => [] as AnalystTarget[]),
        ]);
      }
      // Sin FMP: si hay objetivos individuales se calcula el rango con ellos; si no, solo la media de Alpha Vantage.
      let source = consensus ? 'Financial Modeling Prep' : '';
      if (!consensus && individual.length >= 2) {
        const v = individual.map((t) => t.target);
        consensus = { low: Math.min(...v), high: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length };
        source = 'Financial Modeling Prep';
      }
      if (!consensus && this.market.hasAlphaVantage()) {
        const o = await this.market.overview(params).catch(() => null);
        if (o?.targetPrice) {
          consensus = { low: o.targetPrice, high: o.targetPrice, mean: o.targetPrice };
          source = 'Alpha Vantage (solo la media)';
        }
      }
      return { price: quote?.price ?? 0, consensus, individual, fmpError, source };
    },
  });

  readonly price = computed(() => this.data.value()?.price ?? 0);
  readonly individual = computed(() => this.data.value()?.individual ?? []);
  readonly source = computed(() => this.data.value()?.source ?? '');
  readonly fmpError = computed(() => this.data.value()?.fmpError ?? '');
  readonly cur = computed(() => 'USD');
  readonly stats = computed(() => {
    const d = this.data.value();
    if (!d?.consensus || !d.price) return null;
    return targetStats(d.price, d.consensus, d.individual.map((t) => t.target));
  });
}

/** Modelos de valoración ("Investing Models"): valor razonable según varios métodos clásicos. */
@Component({
  selector: 'app-fair-value',
  imports: [RouterLink, MoneyPipe, PctPipe, Help, Notice],
  template: `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Modelos de valoración<app-help term="Valor razonable" text="Varias fórmulas clásicas estiman cuánto 'debería' valer la acción según sus beneficios. No son exactas: sirven para saber si el precio parece caro o barato." /></h2>
        @if (v()?.verdict) {
          <span class="verdict" [class]="v()!.verdict!">{{ verdictLabel() }}</span>
        }
      </div>
      @if (data.isLoading()) {
        <div class="skeleton" style="height: 140px"></div>
      } @else if (!hasAv) {
        <app-notice level="info">Añade la clave gratuita de Alpha Vantage en <a routerLink="/ajustes">Ajustes</a> para calcular el valor razonable.</app-notice>
      } @else if (v(); as val) {
        @if (val.note) {
          <p class="text-2">{{ val.note }}</p>
        } @else if (val.fairValue) {
          <div class="fv">
            <div><span class="small muted">Valor razonable (mediana de los modelos)</span><div class="big">{{ val.fairValue | money: 'USD' }}</div></div>
            <div><span class="small muted">Precio actual</span><div class="big">{{ price() | money: 'USD' }}</div></div>
            <div><span class="small muted">Recorrido</span><div class="big" [class.up]="val.upside! >= 0" [class.down]="val.upside! < 0">{{ val.upside | pct }}</div></div>
          </div>
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Modelo</th><th class="num">Valor</th><th class="num">vs. hoy</th></tr></thead>
              <tbody>
                @for (m of val.models; track m.key) {
                  <tr>
                    <td>{{ m.name }}<div class="small muted">{{ m.explain }}</div></td>
                    <td class="num">{{ m.value | money: 'USD' }}</td>
                    <td class="num" [class.up]="m.upside >= 0" [class.down]="m.upside < 0">{{ m.upside | pct }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else if (data.error()) {
        <app-notice level="warning">{{ err() }}</app-notice>
      } @else {
        <p class="muted small">No hay datos para valorar este valor (es normal en ETF).</p>
      }
    </section>
  `,
  styles: `
    .verdict { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 4px 8px; border-radius: 4px; color: #fff; background: #8a6d1f; }
    .verdict.infravalorada { background: var(--gain); }
    .verdict.sobrevalorada { background: var(--loss); }
    .fv { display: flex; flex-wrap: wrap; gap: 16px 36px; margin-bottom: 12px; }
    .big { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
    td .small { max-width: 520px; }
  `,
})
export class FairValue {
  private readonly market = inject(MarketDataService);
  readonly symbol = input.required<string>();
  readonly hasAv = this.market.hasAlphaVantage();

  readonly data = resource({
    params: () => this.symbol(),
    loader: async ({ params }) => {
      if (!this.market.hasAlphaVantage()) return null;
      // El precio en vivo no puede bloquear la tarjeta: si tarda más de 8 s, se usa la media de 50 sesiones.
      const [o, q] = await Promise.all([this.market.overview(params), withTimeout(this.market.quote(params), 8_000).catch(() => undefined)]);
      const price = q?.price ?? o?.ma50;
      return o && price ? { o, price } : null;
    },
  });

  readonly price = computed(() => this.data.value()?.price ?? 0);
  readonly v = computed(() => {
    const d = this.data.value();
    if (!d) return null;
    return valuate({ price: d.price, eps: d.o.eps, bookValue: d.o.bookValue, pe: d.o.pe, peg: d.o.peg });
  });

  verdictLabel(): string {
    return { infravalorada: 'Parece barata', justa: 'Precio razonable', sobrevalorada: 'Parece cara' }[this.v()?.verdict ?? 'justa'];
  }

  err(): string {
    return msg(this.data.error());
  }
}
