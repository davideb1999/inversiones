import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MarketDataService, SymbolResult, needsPaidPlan } from '../core/market-data.service';
import { Equivalent, EquivalentsService } from '../core/equivalents';
import { ASSET_TYPE_LABEL, AssetType, Movement, today, uid } from '../core/models';
import { PortfolioService, msg } from '../core/portfolio.service';
import { StoreService } from '../core/store.service';
import { Icon } from '../shared/icon';
import { Help, Notice } from '../shared/ui';

const TYPE_HELP: Record<AssetType, string> = {
  accion: 'Un trocito de una empresa concreta (Apple, Inditex...). Más riesgo: depende de una sola empresa.',
  etf: 'Una cesta de muchas empresas que cotiza como una acción (p. ej. el S&P 500). Muy diversificado y barato.',
  fondo: 'Un fondo de inversión de tu banco o gestora (p. ej. un fondo indexado). Normalmente se valora a mano.',
  cripto: 'Monedas digitales como Bitcoin o Ethereum. Muy volátiles: pueden subir o bajar mucho en días.',
  otro: 'Cualquier otra cosa: depósito, plan de pensiones, oro físico... Lo valoras tú a mano.',
};

@Component({
  selector: 'app-asset-new',
  imports: [FormsModule, RouterLink, Icon, Help, Notice],
  template: `
    <div class="page narrow">
      <header class="page-header">
        <div>
          <a routerLink="/resumen" class="back"><app-icon name="back" [size]="16" /> Volver</a>
          <h1>Añadir inversión</h1>
          <p>Paso {{ step() }} de 2</p>
        </div>
      </header>

      @if (step() === 1) {
        <section class="card stack">
          <h2>¿Qué tipo de inversión es?</h2>
          <div class="types">
            @for (t of types; track t) {
              <button type="button" class="type" [class.on]="type() === t" (click)="setType(t)">
                <strong>{{ typeLabel[t] }}</strong>
                <span>{{ typeHelp[t] }}</span>
              </button>
            }
          </div>
        </section>

        <section class="card stack">
          <h2>Búscala por nombre o ticker<app-help term="Ticker" text="Código corto con el que cotiza en bolsa. Apple es AAPL; el ETF del S&P 500 de Vanguard es VOO; Bitcoin en dólares es BTC/USD." /></h2>
          <div class="search">
            <app-icon name="search" [size]="18" />
            <input [(ngModel)]="query" (ngModelChange)="onQuery($event)" placeholder="Ej. Apple, VOO, Bitcoin, Santander..." autocomplete="off" />
          </div>
          @if (searching()) { <div class="row small muted"><span class="spinner"></span> Buscando...</div> }
          @if (results().length) {
            <ul class="results">
              @for (r of results(); track r.symbol + r.exchange) {
                <li>
                  <button type="button" (click)="pick(r)" [class.on]="picked()?.symbol === r.symbol && picked()?.exchange === r.exchange">
                    <span class="sym">{{ r.symbol }}</span>
                    <span class="nm">{{ r.name }}</span>
                    <span class="ex">
                      {{ r.exchange }} · {{ r.currency }} · {{ r.type }} ·
                      @if (r.free) { <span class="up">precio automático</span> } @else { <span>precio a mano</span> }
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
          @if (!market.hasTwelveData()) {
            <app-notice level="info">La búsqueda funciona sin clave, pero para ver precios y gráficas necesitarás la clave gratuita de Twelve Data (Ajustes).</app-notice>
          }
          <p class="small text-2">
            Las bolsas de EE. UU. y las criptos funcionan con el plan gratuito. Si es un fondo de tu banco o no lo encuentras,
            <button type="button" class="link" (click)="manual()">apúntalo a mano</button>.
          </p>
        </section>

        @if (picked() || isManual()) {
          <section class="card stack">
            <h2>Datos de la inversión</h2>
            <div class="form-grid">
              <label class="field">Nombre
                <input [(ngModel)]="name" placeholder="Ej. Fondo indexado mundial" />
              </label>
              @if (picked()) {
                <label class="field">Ticker
                  <input [ngModel]="picked()!.symbol" disabled />
                </label>
              }
              <label class="field">Moneda en la que cotiza
                <input [(ngModel)]="currency" maxlength="3" [disabled]="!!picked()" />
              </label>
            </div>
            @if (picked() && !picked()!.free) {
              @if (findingEq()) {
                <div class="row small muted"><span class="spinner"></span> El plan gratuito no da el precio de este valor. Buscando su equivalente en EE. UU...</div>
              } @else if (equivalent(); as eq) {
                <div class="equiv">
                  <p>
                    El plan gratuito no da el precio de <strong>{{ picked()!.symbol }}</strong>, pero hemos encontrado un equivalente en EE. UU.
                    que se mueve casi igual: <strong>{{ eq.symbol }}</strong> ({{ eq.name }}).
                    @if (eq.note) { <br /><span class="small text-2">{{ eq.note }}</span> }
                  </p>
                  <label class="opt"><input type="radio" name="eqmode" [checked]="useEq()" (change)="useEq.set(true)" />
                    <span><strong>Seguir a {{ eq.symbol }}</strong> (recomendado): precio y gráficas automáticos, convertidos a {{ base() }}. Puede diferir un poco del real.</span></label>
                  <label class="opt"><input type="radio" name="eqmode" [checked]="!useEq()" (change)="useEq.set(false)" />
                    <span><strong>Valorar a mano</strong>: apuntas tú lo que vale según tu bróker. Exacto, pero sin gráficas automáticas.</span></label>
                </div>
              } @else {
                <app-notice level="info">
                  El plan gratuito de datos no da el precio de este valor y no hemos encontrado un equivalente en EE. UU.
                  Lo guardamos como <strong>valor manual</strong>: apuntas lo que metes y, de vez en cuando, lo que vale según tu bróker.
                </app-notice>
              }
            }
            <div class="row"><span class="spacer"></span><button class="btn primary" (click)="step.set(2)" [disabled]="!name.trim() || findingEq()">Siguiente</button></div>
          </section>
        }
      } @else {
        <section class="card stack">
          <h2>¿Cuánto dinero metiste y cuándo?</h2>
          <p class="text-2">Apunta tu primera aportación. Luego podrás añadir más (por ejemplo, cada mes).</p>
          <div class="form-grid">
            <label class="field">Fecha
              <input type="date" [(ngModel)]="date" [max]="max" />
            </label>
            <label class="field">Importe ({{ base() }})
              <input type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="amount" placeholder="Ej. 1000" />
            </label>
            @if (priced()) {
              <label class="field">Participaciones <small>(opcional)</small>
                <input type="number" inputmode="decimal" min="0" step="any" [(ngModel)]="shares" placeholder="Automático" />
              </label>
            } @else if (!tracked()) {
              <label class="field">¿Cuánto vale hoy? <small>(opcional)</small>
                <input type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="currentValue" placeholder="Mira tu banco" />
              </label>
            }
          </div>
          @if (priced()) {
            <p class="small muted">Si no sabes las participaciones, las calculamos con el precio de cierre de ese día.</p>
          } @else if (tracked()) {
            <p class="small muted">Su evolución se calcula con el precio de {{ equivalent()!.symbol }} desde la fecha de cada aportación.</p>
          }
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <div class="row">
            <button class="btn" (click)="step.set(1)">Atrás</button>
            <span class="spacer"></span>
            <button class="btn ghost" (click)="save(true)" [disabled]="busy()">Guardar sin aportación</button>
            <button class="btn primary" (click)="save(false)" [disabled]="busy()">
              @if (busy()) { <span class="spinner"></span> } Guardar
            </button>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 820px; }
    .equiv { display: grid; gap: 10px; padding: 14px; border-radius: 8px; background: var(--accent-soft); }
    .equiv p { margin: 0; }
    .opt { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; cursor: pointer; }
    .opt input { width: auto; min-height: 0; margin-top: 3px; }
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); text-decoration: none; font-size: 14px; margin-bottom: 6px; }
    .types { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    .type { text-align: left; display: grid; gap: 4px; padding: 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
    .type span { font-size: 13px; color: var(--text-2); }
    .type.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
    .search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 6px; padding: 0 12px; background: var(--surface); color: var(--muted); }
    .search input { border: 0; padding-left: 0; background: transparent; }
    .search input:focus { outline: none; }
    .results { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 340px; overflow-y: auto; }
    .results button { width: 100%; display: grid; grid-template-columns: 90px 1fr; gap: 0 12px; text-align: left; padding: 10px 12px; border-radius: 6px; border: 1px solid transparent; background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; }
    .results button.on { border-color: var(--accent); }
    .sym { font-weight: 700; grid-row: span 2; align-self: center; }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ex { font-size: 12px; color: var(--muted); }
    .link { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; }
  `,
})
export class AssetNewPage {
  private readonly store = inject(StoreService);
  protected readonly market = inject(MarketDataService);
  private readonly portfolio = inject(PortfolioService);
  private readonly router = inject(Router);

  readonly types: AssetType[] = ['etf', 'accion', 'fondo', 'cripto', 'otro'];
  readonly typeLabel = ASSET_TYPE_LABEL;
  readonly typeHelp = TYPE_HELP;
  readonly max = today();

  readonly step = signal<1 | 2>(1);
  readonly type = signal<AssetType>('etf');
  readonly results = signal<SymbolResult[]>([]);
  readonly searching = signal(false);
  readonly picked = signal<SymbolResult | null>(null);
  readonly isManual = signal(false);
  /** Valor elegido del buscador cuyo precio da el plan gratuito. */
  readonly priced = computed(() => !!this.picked()?.free);
  readonly findingEq = signal(false);
  readonly equivalent = signal<Equivalent | null>(null);
  readonly useEq = signal(true);
  /** Valor sin precio gratuito que seguirá a su equivalente de EE. UU. */
  readonly tracked = computed(() => !this.priced() && !!this.picked() && this.useEq() && !!this.equivalent());
  private readonly equivalents = inject(EquivalentsService);
  readonly busy = signal(false);
  readonly error = signal('');

  query = '';
  name = '';
  currency = this.store.settings().baseCurrency;
  date = today();
  amount: number | null = null;
  shares: number | null = null;
  currentValue: number | null = null;
  private timer?: ReturnType<typeof setTimeout>;

  base(): string {
    return this.store.settings().baseCurrency;
  }

  setType(t: AssetType): void {
    this.type.set(t);
    if (t === 'fondo' || t === 'otro') this.manual();
  }

  onQuery(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (q.trim().length < 2) {
        this.results.set([]);
        return;
      }
      this.searching.set(true);
      try {
        const res = await this.market.search(q);
        const allowed = ['Common Stock', 'ETF', 'Digital Currency', 'Mutual Fund', 'Physical Currency', 'Depositary Receipt', 'REIT'];
        // Primero los de EE. UU. y cripto, que son los que cubren los planes gratuitos.
        const free = (r: SymbolResult) => (r.free ? 0 : 1);
        this.results.set(
          res
            .filter((r) => allowed.some((a) => r.type?.includes(a)) || !r.type)
            .sort((a, b) => free(a) - free(b))
            .slice(0, 15),
        );
      } catch {
        this.results.set([]);
      } finally {
        this.searching.set(false);
      }
    }, 350);
  }

  pick(r: SymbolResult): void {
    this.isManual.set(false);
    this.picked.set(r);
    this.name = r.name;
    this.currency = r.currency || 'USD';
    if (r.type?.includes('ETF')) this.type.set('etf');
    else if (r.type?.includes('Digital')) this.type.set('cripto');
    else if (r.type?.includes('Fund')) this.type.set('fondo');
    else this.type.set('accion');
    this.equivalent.set(null);
    this.useEq.set(true);
    if (!r.free) void this.findEquivalent(r);
  }

  private async findEquivalent(r: SymbolResult): Promise<void> {
    this.findingEq.set(true);
    try {
      const eq = await this.equivalents.find(r);
      // Ignorar si mientras tanto se eligió otro valor.
      if (this.picked() === r) this.equivalent.set(eq);
    } finally {
      if (this.picked() === r) this.findingEq.set(false);
    }
  }

  manual(): void {
    this.findingEq.set(false);
    this.equivalent.set(null);
    this.picked.set(null);
    this.isManual.set(true);
    this.currency = this.base();
  }

  async save(skipMovement: boolean): Promise<void> {
    this.error.set('');
    const p = this.picked();
    if (!skipMovement && (!this.amount || this.amount <= 0)) {
      this.error.set('Escribe cuánto dinero metiste (o pulsa "Guardar sin aportación").');
      return;
    }
    this.busy.set(true);
    const eq = this.tracked() ? this.equivalent() : null;
    const asset = this.store.addAsset({
      name: this.name.trim(),
      type: this.type(),
      symbol: this.priced() ? p?.symbol : (eq?.symbol ?? undefined),
      ticker: this.priced() ? undefined : p?.symbol,
      tracking: eq ? { name: eq.name, how: eq.how, note: eq.note } : undefined,
      exchange: eq ? eq.exchange : p?.exchange,
      currency: (eq ? eq.currency : this.currency || this.base()).toUpperCase(),
    });
    try {
      if (!skipMovement) {
        const movement: Movement = { id: uid(), date: this.date, kind: 'aportacion', amount: Number(this.amount) };
        if (asset.symbol) {
          if (this.shares) movement.shares = Number(this.shares);
          else {
            try {
              const est = await this.portfolio.estimateShares(asset, this.date, movement.amount);
              movement.shares = est.shares;
              movement.price = est.price;
            } catch (e) {
              if (needsPaidPlan(e)) this.store.convertToManual(asset.id);
              else this.error.set(`Inversión creada, pero no pude calcular las participaciones (${msg(e)}). Edita la aportación para escribirlas.`);
            }
          }
        }
        this.store.saveMovement(asset.id, movement);
        if (!asset.symbol && this.currentValue) this.store.saveValuation(asset.id, { date: today(), value: Number(this.currentValue) });
      }
      void this.portfolio.refresh();
      await this.router.navigate(['/activo', asset.id]);
    } finally {
      this.busy.set(false);
    }
  }
}
