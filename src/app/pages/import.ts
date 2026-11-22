import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ImportGroup, ImporterService, PricingMode } from '../core/importer.service';
import { ASSET_TYPE_LABEL } from '../core/models';
import { msg } from '../core/portfolio.service';
import { StoreService } from '../core/store.service';
import { ImportSummary, parseTradeRepublic } from '../core/trade-republic';
import { FechaPipe, MoneyPipe } from '../shared/format';
import { Icon } from '../shared/icon';
import { Help, Notice } from '../shared/ui';

@Component({
  selector: 'app-import',
  imports: [FormsModule, RouterLink, MoneyPipe, FechaPipe, Icon, Help, Notice],
  template: `
    <div class="page narrow">
      <header class="page-header">
        <div>
          <a routerLink="/resumen" class="back"><app-icon name="back" [size]="16" /> Mi cartera</a>
          <h1>Importar de Trade Republic</h1>
          <p>Sube la exportación de transacciones y tus compras se apuntan solas.</p>
        </div>
      </header>

      @if (done() !== null) {
        <section class="card empty">
          <h2>{{ done() }} movimientos importados</h2>
          <p>Ya puedes ver tus inversiones con sus gráficas. Puedes repetir la importación cuando quieras: lo que ya esté importado no se duplica.</p>
          <div class="row" style="justify-content: center">
            <a class="btn primary" routerLink="/resumen">Ver mi cartera</a>
            <button class="btn" (click)="reset()">Importar otro archivo</button>
          </div>
        </section>
      } @else if (!summary()) {
        <section class="card stack">
          <h2>1. Descarga el archivo en Trade Republic</h2>
          <ol class="steps">
            <li>Abre la <strong>app del móvil</strong> de Trade Republic, actualizada (la web no permite descargar el archivo).</li>
            <li>Toca tu <strong>icono de perfil</strong> y entra en <strong>Extractos</strong> (puede llamarse <em>Extractos de cuenta</em> o <em>Extractos y exportación de transacciones</em>).</li>
            <li>Elige <strong>Exportar transacciones</strong>, marca <strong>Todas las transacciones</strong> y pulsa <strong>Crear</strong>.</li>
            <li>Pulsa <strong>Compartir</strong> y envíatelo (correo, Drive, AirDrop...) o guárdalo en Archivos. Puedes importarlo desde el propio móvil.</li>
          </ol>
          <p class="small muted">Si no te aparece, actualiza la app o busca «exportar» o «CSV» en su centro de ayuda: el nombre del menú cambia según la versión.</p>
        </section>

        <section class="card stack">
          <h2>2. Súbelo aquí</h2>
          <label class="drop" [class.over]="dragOver()" (dragover)="$event.preventDefault(); dragOver.set(true)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)">
            <app-icon name="upload" [size]="28" />
            <strong>Arrastra el archivo .csv o pulsa para elegirlo</strong>
            <span class="small muted">Se lee en tu navegador: el archivo no se sube a ningún servidor.</span>
            <input type="file" accept=".csv,text/csv" hidden (change)="onFile($event)" />
          </label>
          @if (error()) { <app-notice level="critical">{{ error() }}</app-notice> }
        </section>
      } @else {
        <section class="card stack">
          <h2>Esto es lo que hemos encontrado</h2>
          <div class="grid kpis">
            <div class="kpi"><div class="label">Operaciones</div><div class="value">{{ summary()!.trades.length }}</div><div class="sub">{{ firstDate() | fecha }} – {{ lastDate() | fecha }}</div></div>
            <div class="kpi"><div class="label">Valores distintos</div><div class="value">{{ groups().length }}</div></div>
            <div class="kpi"><div class="label">Dinero invertido</div><div class="value">{{ totalIn() | money: summary()!.currency }}</div></div>
            @if (summary()!.dividends) {
              <div class="kpi"><div class="label">Dividendos cobrados<app-help term="Dividendos" text="Se muestran como información; no cuentan como dinero aportado." /></div><div class="value up">{{ summary()!.dividends | money: summary()!.currency }}</div></div>
            }
          </div>
          @if (summary()!.ignored.length) {
            <details class="small text-2">
              <summary>No se importan {{ ignoredCount() }} movimientos que no son compras ni ventas</summary>
              <ul>@for (i of summary()!.ignored; track i.label) { <li>{{ i.label }}: {{ i.count }}</li> }</ul>
            </details>
          }
          @if (summary()!.currency !== store.settings().baseCurrency) {
            <app-notice level="warning">Las operaciones están en {{ summary()!.currency }} y tu moneda principal es {{ store.settings().baseCurrency }}. Cámbiala en Ajustes si no es correcta.</app-notice>
          }
        </section>

        <section class="card">
          <h2 class="card-title">Revisa cada valor<app-help term="Cómo se valora" text="Precio automático: el plan gratuito da su precio. Equivalente: sigue a un valor de EE. UU. que se mueve casi igual. A mano: tú apuntas su valor de vez en cuando." /></h2>
          <div class="groups">
            @for (g of groups(); track g.isin; let i = $index) {
              <article class="group" [class.off]="!g.include">
                <header>
                  <label class="inc"><input type="checkbox" [ngModel]="g.include" (ngModelChange)="patch(i, { include: $event })" /></label>
                  <div class="g-main">
                    <strong>{{ g.name }}</strong>
                    <div class="small muted">{{ g.isin }} · {{ typeLabel[g.type] }} · {{ g.trades.length }} operaciones</div>
                  </div>
                  <div class="g-num">
                    <div>{{ g.contributed | money: summary()!.currency }}</div>
                    @if (g.withdrawn) { <div class="small down">−{{ g.withdrawn | money: summary()!.currency }}</div> }
                  </div>
                </header>
                @if (g.alreadyImported) {
                  <p class="small text-2">{{ g.alreadyImported }} de estas operaciones ya estaban importadas y no se duplicarán.</p>
                }
                <div class="form-grid">
                  <label class="field">Cómo se valora
                    @if (g.resolving) {
                      <span class="row small muted"><span class="spinner"></span> Buscando su cotización...</span>
                    } @else {
                      <select [ngModel]="g.mode" (ngModelChange)="patch(i, { mode: $event })" [disabled]="!!g.target">
                        @if (g.direct) { <option value="directo">Precio automático ({{ g.direct.symbol }})</option> }
                        @if (g.equivalent) { <option value="equivalente">Seguir a {{ g.equivalent.symbol }} (equivalente EE. UU.)</option> }
                        <option value="manual">A mano</option>
                      </select>
                    }
                  </label>
                  <label class="field">Dónde guardarlo
                    <select [ngModel]="g.target" (ngModelChange)="patch(i, { target: $event })">
                      <option value="">Nueva inversión</option>
                      @for (a of store.assets(); track a.id) { <option [value]="a.id">Añadir a «{{ a.name }}»</option> }
                    </select>
                  </label>
                </div>
                @if (g.mode === 'equivalente' && g.equivalent && !g.target) {
                  <p class="small text-2">{{ g.equivalent.name }} · {{ g.equivalent.note ?? 'Sigue el mismo índice o empresa.' }}</p>
                }
              </article>
            }
          </div>
        </section>

        @if (error()) { <app-notice level="critical">{{ error() }}</app-notice> }
        <div class="row">
          <button class="btn" (click)="reset()">Cancelar</button>
          <span class="spacer"></span>
          <button class="btn primary" (click)="import()" [disabled]="importing() || resolving() || !includedCount()">
            @if (importing()) { <span class="spinner"></span> Importando {{ progress() }}... } @else { {{ selectedCount() ? 'Importar ' + selectedCount() + ' operaciones' : 'Actualizar datos ya importados' }} }
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 900px; }
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); text-decoration: none; font-size: 14px; margin-bottom: 6px; }
    .steps { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
    .drop { display: grid; justify-items: center; gap: 8px; text-align: center; padding: 32px 16px; border: 2px dashed var(--border); border-radius: var(--radius); cursor: pointer; color: var(--text-2); }
    .drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-soft); }
    .groups { display: grid; gap: 12px; }
    .group { border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
    .group.off { opacity: .5; }
    .group header { display: flex; gap: 12px; align-items: center; }
    .inc input { width: 20px; height: 20px; min-height: 0; }
    .g-main { flex: 1; min-width: 0; }
    .g-num { text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }
    details ul { margin: 6px 0 0; }
  `,
})
export class ImportPage {
  protected readonly store = inject(StoreService);
  private readonly importer = inject(ImporterService);
  readonly typeLabel = ASSET_TYPE_LABEL;

  readonly summary = signal<ImportSummary | null>(null);
  readonly groups = signal<ImportGroup[]>([]);
  readonly error = signal('');
  readonly dragOver = signal(false);
  readonly importing = signal(false);
  readonly progress = signal('');
  readonly done = signal<number | null>(null);

  readonly resolving = computed(() => this.groups().some((g) => g.resolving));
  readonly totalIn = computed(() => this.groups().reduce((a, g) => a + g.contributed, 0));
  readonly firstDate = computed(() => this.summary()?.trades[0]?.date);
  readonly lastDate = computed(() => this.summary()?.trades.at(-1)?.date);
  readonly ignoredCount = computed(() => (this.summary()?.ignored ?? []).reduce((a, i) => a + i.count, 0));
  readonly includedCount = computed(() => this.groups().filter((g) => g.include).length);
  readonly selectedCount = computed(() =>
    this.groups()
      .filter((g) => g.include)
      .reduce((a, g) => a + g.trades.length - g.alreadyImported, 0),
  );

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) void this.read(file);
  }

  onFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.read(file);
  }

  private async read(file: File): Promise<void> {
    this.error.set('');
    try {
      const summary = parseTradeRepublic(await file.text());
      if (!summary.trades.length) {
        this.error.set('El archivo no tiene compras ni ventas de valores.');
        return;
      }
      this.summary.set(summary);
      const groups = this.importer.group(summary.trades);
      this.groups.set(groups);
      // Se resuelven de uno en uno para no saturar los límites gratuitos de datos.
      for (const g of groups) {
        const resolved = await this.importer.resolve(g);
        this.groups.update((gs) => gs.map((x) => (x.isin === g.isin ? { ...resolved, include: x.include, target: x.target } : x)));
      }
    } catch (e) {
      this.error.set(msg(e));
    }
  }

  patch(i: number, change: Partial<ImportGroup> & { mode?: PricingMode }): void {
    this.groups.update((gs) => gs.map((g, j) => (j === i ? { ...g, ...change } : g)));
  }

  async import(): Promise<void> {
    this.importing.set(true);
    this.error.set('');
    try {
      const added = await this.importer.apply(this.groups(), (d, t) => this.progress.set(`${d}/${t}`));
      this.store.addDividends(this.summary()?.dividendList ?? []);
      this.done.set(added);
    } catch (e) {
      this.error.set('Error al importar: ' + msg(e));
    } finally {
      this.importing.set(false);
    }
  }

  reset(): void {
    this.summary.set(null);
    this.groups.set([]);
    this.error.set('');
    this.done.set(null);
  }
}
