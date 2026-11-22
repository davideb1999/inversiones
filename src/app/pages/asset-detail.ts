import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { parseDate } from '../core/market-data.service';
import { ASSET_TYPE_LABEL, Movement, today } from '../core/models';
import { PALETTE, PortfolioService, msg } from '../core/portfolio.service';
import { EquivalentsService } from '../core/equivalents';
import { RangeKey, resolveRange } from '../core/ranges';
import { StoreService } from '../core/store.service';
import { ChartMarker, LineChart, LineSeries } from '../shared/charts';
import { FechaPipe, MoneyPipe, NumPipe, PctPipe } from '../shared/format';
import { Icon } from '../shared/icon';
import { MarketInfo, PriceChart } from '../shared/market-widgets';
import { AnalystView } from '../shared/analyst-view';
import { Help, Notice, RangeSelector } from '../shared/ui';
import { MovementDialog } from './movement-dialog';

@Component({
  selector: 'app-asset-detail',
  imports: [FormsModule, RouterLink, LineChart, PriceChart, MarketInfo, AnalystView, MovementDialog, MoneyPipe, PctPipe, NumPipe, FechaPipe, Icon, Help, Notice, RangeSelector],
  template: `
    @if (asset(); as a) {
      <div class="page">
        <header class="page-header">
          <div>
            <a routerLink="/resumen" class="back"><app-icon name="back" [size]="16" /> Mi cartera</a>
            <h1><span class="swatch" [style.background]="portfolio.colorOf(a)"></span>{{ a.name }}</h1>
            <div class="row small muted">
              <span class="badge">{{ typeLabel[a.type] }}</span>
              @if (a.tracking) {
                <span>{{ a.ticker }} · sigue a <strong>{{ a.symbol }}</strong> (equivalente en EE. UU.)</span>
                <app-help term="Equivalente" [text]="'El plan gratuito de datos no da el precio de ' + a.ticker + ', así que seguimos a ' + a.symbol + ' (' + a.tracking.name + '), que se mueve casi igual, convertido a tu moneda. El valor es una estimación: puede diferir un poco del que ves en tu bróker.' + (a.tracking.note ? ' ' + a.tracking.note : '')" />
              } @else if (a.symbol) { <span>{{ a.symbol }} · {{ a.exchange }} · {{ a.currency }}</span> }
              @else { <span>{{ a.ticker ? a.ticker + ' · ' + (a.exchange ?? '') + ' · ' : '' }}Valor anotado a mano</span> }
            </div>
          </div>
          <div class="row">
            <a class="btn" [routerLink]="['/asesor']" [queryParams]="{ q: askText() }"><app-icon name="chat" [size]="18" />Preguntar al asesor</a>
            <button class="btn" (click)="editing.set(true)"><app-icon name="edit" [size]="18" />Editar</button>
            <button class="btn primary" (click)="openMovement()"><app-icon name="plus" [size]="18" />Movimiento</button>
          </div>
        </header>

        @if (a.symbol && portfolio.live()[a.id]?.paidPlan) {
          <app-notice level="warning">
            El plan gratuito de datos no da el precio de {{ a.symbol }} (solo cubre bolsa de EE. UU. y cripto).
            <div class="row" style="margin-top: 8px">
              <button class="btn sm primary" (click)="useEquivalent()" [disabled]="eqBusy()">Seguir a su equivalente de EE. UU.</button>
              <button class="btn sm" (click)="toManual()">Pasar a valor manual</button>
            </div>
          </app-notice>
        }
        @if (!a.symbol && a.ticker) {
          <app-notice level="info">
            {{ a.ticker }} se valora a mano porque el plan gratuito no da su precio. Puedes seguir automáticamente a un valor de EE. UU. equivalente.
            <div class="row" style="margin-top: 8px">
              <button class="btn sm primary" (click)="useEquivalent()" [disabled]="eqBusy()">
                @if (eqBusy()) { <span class="spinner"></span> Buscando... } @else { Seguir a su equivalente de EE. UU. }
              </button>
            </div>
          </app-notice>
        }
        @if (eqMsg()) { <app-notice level="info">{{ eqMsg() }}</app-notice> }
        @if (convertedNotice()) {
          <app-notice level="info">
            {{ a.name }} ahora se valora <strong>a mano</strong>: el plan gratuito no da su precio. Apunta abajo, en "Valor actual anotado",
            lo que vale según tu bróker (con actualizarlo de vez en cuando es suficiente).
          </app-notice>
        }

        <section class="grid kpis">
          <div class="kpi">
            <div class="label">Vale hoy</div>
            <div class="value">{{ stats()!.value | money }}</div>
            @if (a.symbol && !stats()!.priceAvailable) { <div class="sub down">Sin precio en vivo</div> }
          </div>
          <div class="kpi">
            <div class="label">Has puesto<app-help term="Has puesto" text="Aportaciones menos retiradas." /></div>
            <div class="value">{{ stats()!.invested | money }}</div>
          </div>
          <div class="kpi">
            <div class="label">Ganancia / pérdida</div>
            <div class="value" [class.up]="stats()!.gain >= 0" [class.down]="stats()!.gain < 0">{{ stats()!.gain | money: '' : true }}</div>
            <div class="sub">{{ stats()!.gainPct | pct }}</div>
          </div>
          <div class="kpi">
            <div class="label">Rentabilidad anual<app-help term="Rentabilidad anual" text="Media anual teniendo en cuenta cuándo pusiste cada euro (TIR)." /></div>
            <div class="value">{{ stats()!.annualPct === undefined ? '—' : (stats()!.annualPct | pct) }}</div>
          </div>
          @if (a.symbol) {
            <div class="kpi">
              <div class="label">Participaciones</div>
              <div class="value">{{ stats()!.shares | num: 4 }}</div>
              @if (stats()!.lastPrice) { <div class="sub">Precio: {{ stats()!.lastPrice | money: a.currency }}</div> }
            </div>
            <div class="kpi">
              <div class="label">Precio medio de compra<app-help term="Precio medio" text="Lo que te ha costado de media cada participación (en tu moneda). Si el precio actual está por encima, vas ganando." /></div>
              <div class="value">{{ stats()!.avgPrice ? (stats()!.avgPrice | money) : '—' }}</div>
            </div>
          }
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Tu dinero en {{ a.name }}<app-help term="Evolución" text="Lo que valía tu inversión cada día (línea de color) frente a lo que habías puesto (discontinua)." /></h2>
            <app-range-selector [(value)]="range" [exclude]="['1D']" (customChange)="custom.set($event)" />
          </div>
          @if (!a.movements.length) {
            <p class="muted">Añade una aportación para ver la evolución.</p>
          } @else if (history.isLoading() && !history.hasValue()) {
            <div class="skeleton" style="height: 280px"></div>
          } @else if (history.hasValue()) {
            <app-line-chart [series]="series()" [markers]="valueMarkers()" />
            @for (w of history.value()!.warnings; track w) { <p class="small muted">{{ w }}</p> }
          }
        </section>

        @if (a.symbol) {
          <section class="card">
            <app-price-chart [symbol]="a.symbol" [markers]="priceMarkers()" [earliest]="a.movements[0]?.date" />
          </section>
        } @else {
          <section class="card">
            <div class="card-head">
              <h2 class="card-title">Valor actual anotado<app-help term="Valoración" text="Como este activo no cotiza automáticamente, apunta de vez en cuando lo que vale según tu banco o bróker." /></h2>
            </div>
            <form class="row" (ngSubmit)="addValuation()">
              <input type="date" name="vdate" [(ngModel)]="vDate" [max]="max" style="max-width: 180px" />
              <input type="number" name="vvalue" inputmode="decimal" step="0.01" [(ngModel)]="vValue" placeholder="Valor total hoy" style="max-width: 200px" />
              <button class="btn primary" type="submit">Guardar valor</button>
            </form>
            @if (a.valuations.length) {
              <div class="table-scroll">
                <table class="data" style="margin-top: 12px">
                  <thead><tr><th>Fecha</th><th class="num">Valor</th><th></th></tr></thead>
                  <tbody>
                    @for (v of a.valuations.slice().reverse().slice(0, showAllVals() ? undefined : 6); track v.date) {
                      <tr><td>{{ v.date | fecha }}</td><td class="num">{{ v.value | money }}</td><td class="num"><button class="btn ghost sm danger" (click)="store.removeValuation(a.id, v.date)" aria-label="Eliminar valor"><app-icon name="trash" [size]="16" /></button></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            @if (a.valuations.length > 6) { <button class="btn ghost sm" (click)="showAllVals.set(!showAllVals())">{{ showAllVals() ? 'Ver menos' : 'Ver los ' + a.valuations.length + ' valores' }}</button> }
            }
          </section>
        }

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Tus movimientos</h2>
            <button class="btn sm" (click)="openMovement()"><app-icon name="plus" [size]="16" />Añadir</button>
          </div>
          @if (!a.movements.length) {
            <p class="muted">Todavía no has apuntado ninguna aportación.</p>
          } @else {
            <div class="table-scroll">
              <table class="data">
                <thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Importe</th>@if (a.symbol) {<th class="num">Particip.</th><th class="num">Precio</th>}<th>Nota</th><th></th></tr></thead>
                <tbody>
                  @for (m of a.movements.slice().reverse().slice(0, showAllMoves() ? undefined : 8); track m.id) {
                    <tr>
                      <td>{{ m.date | fecha }}</td>
                      <td>@if (m.kind === 'aportacion') {<span class="badge good">+ Aportación</span>} @else {<span class="badge bad">− Retirada</span>}</td>
                      <td class="num">{{ m.amount | money }}</td>
                      @if (a.symbol) {
                        <td class="num">{{ m.shares | num: 4 }}</td>
                        <td class="num">{{ m.price ? (m.price | money: a.currency) : '—' }}</td>
                      }
                      <td class="small muted">{{ m.note }}</td>
                      <td class="num"><button class="btn ghost sm" (click)="openMovement(m)" aria-label="Editar movimiento"><app-icon name="edit" [size]="16" /></button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (a.movements.length > 8) { <button class="btn ghost sm" (click)="showAllMoves.set(!showAllMoves())">{{ showAllMoves() ? 'Ver menos' : 'Ver los ' + a.movements.length + ' movimientos' }}</button> }
          }
        </section>

        @if (a.symbol && a.type === 'accion' && !a.tracking) {
          <app-analyst-view [symbol]="a.symbol" />
        }
        @if (a.symbol && (a.type === 'accion' || a.type === 'etf')) {
          @if (a.tracking) { <p class="small muted">Datos de {{ a.symbol }}, el equivalente en EE. UU. que sigue esta inversión.</p> }
          <app-market-info [symbol]="a.symbol" />
        }
      </div>

      @if (movementOpen()) {
        <app-movement-dialog [asset]="a" [movement]="editingMovement()" (closed)="movementOpen.set(false)" (convertedToManual)="convertedNotice.set(true)" />
      }

      @if (editing()) {
        <div class="modal-backdrop" (click)="editing.set(false)">
          <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="saveEdit()">
            <h2>Editar inversión</h2>
            <label class="field">Nombre <input name="name" [(ngModel)]="editName" /></label>
            <div class="field">Color
              <div class="colors">
                @for (c of palette; track c) {
                  <button type="button" class="color" [style.background]="c" [class.on]="editColor === c" (click)="editColor = c" [attr.aria-label]="'Color ' + c"></button>
                }
              </div>
            </div>
            <div class="row">
              <button type="button" class="btn danger" (click)="remove()"><app-icon name="trash" [size]="16" />Eliminar inversión</button>
              <span class="spacer"></span>
              <button type="button" class="btn" (click)="editing.set(false)">Cancelar</button>
              <button class="btn primary" type="submit">Guardar</button>
            </div>
          </form>
        </div>
      }
    } @else {
      <div class="page"><app-notice level="warning">Esta inversión no existe. <a routerLink="/resumen">Volver</a></app-notice></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); text-decoration: none; font-size: 14px; margin-bottom: 6px; }
    h1 { display: flex; align-items: center; gap: 10px; }
    .swatch { width: 12px; height: 28px; border-radius: 4px; flex: none; }
    .colors { display: flex; gap: 8px; flex-wrap: wrap; }
    .color { width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--surface); cursor: pointer; box-shadow: 0 0 0 1px var(--border); }
    .color.on { box-shadow: 0 0 0 2px var(--text); }
  `,
})
export class AssetDetailPage {
  protected readonly store = inject(StoreService);
  protected readonly portfolio = inject(PortfolioService);
  private readonly router = inject(Router);
  readonly id = input.required<string>();
  readonly typeLabel = ASSET_TYPE_LABEL;
  readonly palette = PALETTE;
  readonly max = today();

  readonly asset = computed(() => this.store.asset(this.id()));
  readonly stats = computed(() => this.portfolio.stats().find((s) => s.asset.id === this.id()));
  readonly range = signal<RangeKey>('TODO');
  readonly custom = signal<{ from: string; to: string } | undefined>(undefined);
  readonly movementOpen = signal(false);
  readonly editingMovement = signal<Movement | undefined>(undefined);
  readonly editing = signal(false);
  readonly convertedNotice = signal(false);
  readonly showAllMoves = signal(false);
  readonly showAllVals = signal(false);

  readonly eqBusy = signal(false);
  readonly eqMsg = signal('');
  private readonly equivalents = inject(EquivalentsService);

  toManual(): void {
    const a = this.asset();
    if (!a) return;
    this.store.convertToManual(a.id);
    this.convertedNotice.set(true);
  }

  async useEquivalent(): Promise<void> {
    const a = this.asset();
    if (!a) return;
    this.eqBusy.set(true);
    this.eqMsg.set('');
    this.convertedNotice.set(false);
    try {
      const original = a.ticker ?? a.symbol ?? '';
      const eq = await this.equivalents.find({ symbol: original, name: a.name, type: a.type === 'etf' ? 'ETF' : 'Common Stock' });
      if (!eq) {
        this.eqMsg.set(`No he encontrado un equivalente en EE. UU. para ${original}. Seguirá valorándose a mano.`);
        return;
      }
      if (!confirm(`Seguir a ${eq.symbol} (${eq.name}) como equivalente de ${original}?\n\nSe recalcularán tus aportaciones con su precio de cada día.`)) return;
      if (a.symbol && !a.tracking) this.store.convertToManual(a.id);
      await this.portfolio.switchToEquivalent(a.id, eq);
      this.eqMsg.set(`Listo: ${a.name} sigue ahora a ${eq.symbol}. Su valor es una estimación basada en ese equivalente.`);
    } catch (e) {
      this.eqMsg.set('No se pudo cambiar al equivalente: ' + msg(e));
    } finally {
      this.eqBusy.set(false);
    }
  }
  editName = '';
  editColor = '';
  vDate = today();
  vValue: number | null = null;

  readonly history = resource({
    params: () => {
      const a = this.asset();
      return a ? { asset: a, range: resolveRange(this.range(), this.portfolio.earliestDate([a]), this.custom()), live: this.stats()?.value } : undefined;
    },
    loader: async ({ params }) => {
      const h = await this.portfolio.history(params.range, [params.asset]);
      // Último punto = valor en vivo, para que cuadre con la cifra de arriba.
      if (h.value.length && params.range.to === today() && params.live !== undefined && this.stats()?.priceAvailable) {
        h.value[h.value.length - 1] = { ...h.value[h.value.length - 1], close: params.live };
      }
      return h;
    },
  });

  readonly series = computed<LineSeries[]>(() => {
    const h = this.history.value();
    const a = this.asset();
    if (!h || !a) return [];
    return [
      { label: 'Valor', color: '#0ca30c', points: h.value, gainAgainst: 'Dinero puesto' },
      { label: 'Dinero puesto', color: '#898781', points: h.invested, dashed: true },
    ];
  });

  readonly valueMarkers = computed<ChartMarker[]>(() => {
    const h = this.history.value();
    const a = this.asset();
    if (!h || !a) return [];
    return a.movements
      .map((m) => {
        const t = parseDate(m.date);
        const point = h.invested.find((p) => p.t >= t);
        return point ? { t, y: point.close, color: m.kind === 'aportacion' ? '#0ca30c' : '#d03b3b', label: `${m.kind === 'aportacion' ? 'Aportación' : 'Retirada'}: ${m.amount.toLocaleString('es-ES')} ${this.store.settings().baseCurrency}` } : null;
      })
      .filter((x): x is ChartMarker => !!x);
  });

  readonly priceMarkers = computed<ChartMarker[]>(() => {
    const a = this.asset();
    if (!a) return [];
    return a.movements
      .filter((m) => m.price)
      .map((m) => ({
        t: parseDate(m.date),
        y: m.price!,
        color: m.kind === 'aportacion' ? '#0ca30c' : '#d03b3b',
        label: `${m.kind === 'aportacion' ? 'Compra' : 'Venta'} a ${m.price!.toLocaleString('es-ES')} ${a.currency}`,
      }));
  });

  askText(): string {
    const s = this.stats();
    const a = this.asset();
    if (!s || !a) return '';
    return `Tengo ${a.name}${a.symbol ? ` (${a.symbol})` : ''}: he puesto ${s.invested.toFixed(0)} y ahora vale ${s.value.toFixed(0)} (${s.gainPct.toFixed(1)}%). ¿Qué me recomiendas hacer: mantener, aportar más o vender?`;
  }

  openMovement(m?: Movement): void {
    this.editingMovement.set(m);
    this.movementOpen.set(true);
  }

  addValuation(): void {
    const a = this.asset();
    if (!a || !this.vValue || !this.vDate) return;
    this.store.saveValuation(a.id, { date: this.vDate, value: Number(this.vValue) });
    this.vValue = null;
  }

  constructor() {
    if (!this.portfolio.lastRefresh()) void this.portfolio.refresh();
  }

  ngOnInit(): void {
    const a = this.asset();
    if (a) {
      this.editName = a.name;
      this.editColor = this.portfolio.colorOf(a);
    }
  }

  saveEdit(): void {
    const a = this.asset();
    if (!a) return;
    this.store.updateAsset(a.id, { name: this.editName.trim() || a.name, color: this.editColor });
    this.editing.set(false);
  }

  remove(): void {
    const a = this.asset();
    if (a && confirm(`¿Eliminar "${a.name}" y todos sus movimientos? No se puede deshacer.`)) {
      this.store.removeAsset(a.id);
      void this.router.navigate(['/resumen']);
    }
  }
}
