import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketDataService } from '../core/market-data.service';
import { addDays, today } from '../core/models';
import { msg } from '../core/portfolio.service';
import { FechaPipe, PctPipe } from './format';
import { Help, Notice } from './ui';

interface CongressTrade {
  date: string;
  disclosed: string;
  ticker: string;
  asset: string;
  assetType: string;
  type: string; // Purchase | Sale | Exchange | Other
  amountMin: number;
  amountMax: number;
  amount: string;
  owner: string;
  source: string;
}

interface CongressFile {
  updatedAt: string;
  member: string;
  party: string;
  district: string;
  trades: CongressTrade[];
}

interface Perf {
  ticker: string;
  date: string;
  ret: number;
  spy?: number;
}

/**
 * Operaciones declaradas por un miembro del Congreso de EE. UU. (ley STOCK Act).
 * El archivo lo genera scripts/update-data.mjs a diario.
 */
@Component({
  selector: 'app-congress-trades',
  imports: [RouterLink, FechaPipe, PctPipe, Help, Notice],
  template: `
    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">{{ data.value()?.member ?? 'Congresista' }}<app-help term="Congresistas de EE. UU." text="Por ley (STOCK Act), los congresistas deben declarar sus compras y ventas de acciones en un plazo de 45 días. Las de Nancy Pelosi las hace sobre todo su marido, Paul Pelosi, inversor profesional. Muchas son opciones (apuestas apalancadas), que multiplican ganancias y pérdidas." /></h2>
          @if (data.value(); as d) {
            <div class="small muted">Demócrata · {{ d.district }} · datos actualizados el {{ d.updatedAt | fecha }} · fuente: declaraciones oficiales de la Cámara</div>
          }
        </div>
      </div>

      @if (data.isLoading()) {
        <div class="skeleton" style="height: 160px"></div>
      } @else if (data.error()) {
        <app-notice level="warning">No se pudieron cargar sus operaciones.</app-notice>
      } @else if (data.value(); as d) {
        <app-notice level="info">
          Ves lo que compró <strong>hasta 45 días después</strong> de hacerlo. Copiarla tiene ese retraso, y muchas de sus compras son opciones,
          mucho más arriesgadas que comprar la acción.
        </app-notice>

        <div class="grid kpis" style="margin-top: 14px">
          <div class="kpi"><div class="label">Compras último año</div><div class="value">{{ yearStats().buys }}</div></div>
          <div class="kpi"><div class="label">Ventas último año</div><div class="value">{{ yearStats().sells }}</div></div>
          <div class="kpi"><div class="label">Lo que más ha comprado</div><div class="value small-v">{{ yearStats().top || '—' }}</div></div>
        </div>

        <!-- Móvil: lista compacta -->
        <ul class="tlist only-mobile">
          @for (t of recent(); track $index) {
            <li>
              <div class="tl-main">
                @if (t.ticker) { <a [routerLink]="['/mercado', t.ticker]"><strong>{{ t.ticker }}</strong></a> }
                <span class="tl-name">{{ t.asset }}</span>
                <span class="small muted">{{ t.date | fecha }} · publicada {{ t.disclosed | fecha }}</span>
              </div>
              <div class="tl-side">
                <span class="badge" [class.good]="t.type === 'Purchase'" [class.bad]="t.type === 'Sale'">{{ typeLabel(t.type) }}</span>
                @if (t.assetType.includes('Option')) { <span class="badge warn">Opción</span> }
                <span class="small">{{ t.amount }}</span>
              </div>
            </li>
          }
        </ul>
        <div class="table-scroll hide-mobile">
          <table class="data">
            <thead><tr><th>Operación</th><th>Publicada</th><th>Valor</th><th>Tipo</th><th class="num">Importe</th></tr></thead>
            <tbody>
              @for (t of recent(); track $index) {
                <tr>
                  <td>{{ t.date | fecha }}</td>
                  <td class="small muted">{{ t.disclosed | fecha }}</td>
                  <td>
                    @if (t.ticker) { <a [routerLink]="['/mercado', t.ticker]"><strong>{{ t.ticker }}</strong></a> }
                    <span class="small muted"> {{ t.asset }}</span>
                  </td>
                  <td>
                    <span class="badge" [class.good]="t.type === 'Purchase'" [class.bad]="t.type === 'Sale'">{{ typeLabel(t.type) }}</span>
                    @if (t.assetType.includes('Option')) { <span class="badge warn">Opción</span> }
                  </td>
                  <td class="num small">{{ t.amount }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (d.trades.length > shown()) {
          <button class="btn ghost sm" (click)="shown.set(shown() + 20)">Ver más operaciones</button>
        }

        <h3 class="sub-h">¿Le ha salido bien?<app-help term="Rentabilidad" text="Para sus últimas compras de acciones, comparamos el precio del día de la operación con el de hoy, y lo mismo con el S&P 500 en esas fechas. Las opciones no se pueden medir así: se usa el precio de la acción." /></h3>
        @if (perf().length) {
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Compra</th><th>Fecha</th><th class="num">Desde entonces</th><th class="num">S&P 500</th></tr></thead>
              <tbody>
                @for (p of perf(); track p.ticker + p.date) {
                  <tr>
                    <td><a [routerLink]="['/mercado', p.ticker]"><strong>{{ p.ticker }}</strong></a></td>
                    <td>{{ p.date | fecha }}</td>
                    <td class="num" [class.up]="p.ret >= 0" [class.down]="p.ret < 0">{{ p.ret | pct }}</td>
                    <td class="num">{{ p.spy === undefined ? '—' : (p.spy | pct) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (perfSummary(); as s) {
            <p class="verdict-line">De media, sus compras han {{ s.avg >= 0 ? 'subido' : 'bajado' }} un {{ abs(s.avg).toFixed(1) }} %; el S&P 500, en las mismas fechas, un {{ s.spy.toFixed(1) }} %.</p>
          }
        } @else if (perfBusy()) {
          <p class="small muted"><span class="spinner"></span> Calculando ({{ perfProgress() }})... el plan gratuito de datos va despacio.</p>
        } @else {
          <button class="btn sm" (click)="computePerf()" [disabled]="!market.hasTwelveData()">Calcular la rentabilidad de sus últimas compras</button>
          @if (!market.hasTwelveData()) { <p class="small muted">Necesita la clave de Twelve Data.</p> }
        }
        @if (perfError()) { <p class="error small">{{ perfError() }}</p> }
      }
    </section>
  `,
  styles: `
    .small-v { font-size: 18px !important; }
    .sub-h { margin: 20px 0 8px; font-size: 15px; }
    .verdict-line { margin: 12px 0 0; font-weight: 600; }
    table { margin-top: 14px; }
    .tlist { list-style: none; margin: 14px 0 0; padding: 0; }
    .tlist li { display: flex; gap: 10px; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .tl-main { display: grid; min-width: 0; }
    .tl-main a { text-decoration: none; }
    .tl-name { font-size: 13px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tl-side { display: grid; justify-items: end; align-content: start; gap: 4px; text-align: right; flex: none; max-width: 45%; }
  `,
})
export class CongressTrades {
  protected readonly market = inject(MarketDataService);
  readonly slug = input('nancy-pelosi');
  readonly shown = signal(20);
  readonly perf = signal<Perf[]>([]);
  readonly perfBusy = signal(false);
  readonly perfProgress = signal('');
  readonly perfError = signal('');

  readonly data = resource({
    params: () => this.slug(),
    loader: async ({ params }) => {
      const res = await fetch(`data/${params}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as CongressFile;
    },
  });

  readonly recent = computed(() => (this.data.value()?.trades ?? []).slice(0, this.shown()));

  readonly yearStats = computed(() => {
    const since = addDays(today(), -365);
    const trades = (this.data.value()?.trades ?? []).filter((t) => t.date >= since);
    const bought = new Map<string, number>();
    for (const t of trades.filter((x) => x.type === 'Purchase' && x.ticker)) {
      bought.set(t.ticker, (bought.get(t.ticker) ?? 0) + (t.amountMin + t.amountMax) / 2);
    }
    const top = [...bought.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    return {
      buys: trades.filter((t) => t.type === 'Purchase').length,
      sells: trades.filter((t) => t.type === 'Sale').length,
      top: top.join(', '),
    };
  });

  readonly perfSummary = computed(() => {
    const p = this.perf();
    if (!p.length) return null;
    const withSpy = p.filter((x) => x.spy !== undefined);
    return {
      avg: p.reduce((a, x) => a + x.ret, 0) / p.length,
      spy: withSpy.length ? withSpy.reduce((a, x) => a + x.spy!, 0) / withSpy.length : 0,
    };
  });

  typeLabel(t: string): string {
    return { Purchase: 'Compra', Sale: 'Venta', Exchange: 'Canje' }[t] ?? 'Otro';
  }

  abs(n: number): number {
    return Math.abs(n);
  }

  /** Rentabilidad de sus últimas compras (una por valor, máximo 8) frente al S&P 500. */
  async computePerf(): Promise<void> {
    const trades = this.data.value()?.trades ?? [];
    const seen = new Set<string>();
    const buys = trades.filter((t) => {
      if (t.type !== 'Purchase' || !t.ticker || seen.has(t.ticker) || t.date < addDays(today(), -730)) return false;
      seen.add(t.ticker);
      return true;
    }).slice(0, 8);
    this.perfBusy.set(true);
    this.perfError.set('');
    const out: Perf[] = [];
    try {
      const oldest = buys.reduce((m, t) => (t.date < m ? t.date : m), today());
      const spy = await this.market.daily('SPY', oldest).catch(() => null);
      const spyNow = spy?.points.at(-1)?.close;
      for (const [i, t] of buys.entries()) {
        this.perfProgress.set(`${i + 1}/${buys.length}`);
        try {
          const s = await this.market.daily(t.ticker, t.date);
          const start = s.points.find((p) => p.t >= new Date(t.date + 'T00:00:00').getTime())?.close;
          const now = s.points.at(-1)?.close;
          if (!start || !now) continue;
          const spyStart = spy?.points.find((p) => p.t >= new Date(t.date + 'T00:00:00').getTime())?.close;
          out.push({
            ticker: t.ticker,
            date: t.date,
            ret: (now / start - 1) * 100,
            spy: spyStart && spyNow ? (spyNow / spyStart - 1) * 100 : undefined,
          });
          this.perf.set([...out]);
        } catch {
          // valor sin datos gratuitos: se omite
        }
      }
      if (!out.length) this.perfError.set('No se pudo obtener el precio de sus compras.');
    } catch (e) {
      this.perfError.set(msg(e));
    } finally {
      this.perfBusy.set(false);
    }
  }
}
