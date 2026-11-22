import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ASSET_TYPE_LABEL } from '../core/models';
import { StoreService } from '../core/store.service';
import { SAVINGS_BRACKETS, marginalRate, yearSummary } from '../core/tax';
import { FechaPipe, MoneyPipe, NumPipe } from '../shared/format';
import { Help, Notice } from '../shared/ui';
import { TaxTips } from '../shared/tax-tips';

/** Qué declarar en la renta por las inversiones de un año, calculado con tus movimientos. */
@Component({
  selector: 'app-tax-return',
  imports: [RouterLink, MoneyPipe, FechaPipe, NumPipe, Help, Notice, TaxTips],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Declaración de la renta</h1>
          <p>Qué tendrías que declarar por tus inversiones y dónde ponerlo en Renta Web.</p>
        </div>
        <label class="field year">Ejercicio
          <select [value]="year()" (change)="year.set(+$any($event.target).value)">
            @for (y of years(); track y) { <option [value]="y">{{ y }} (se declara en {{ y + 1 }})</option> }
          </select>
        </label>
      </header>

      <app-notice level="info">
        Es una <strong>estimación</strong> hecha con lo que tienes apuntado aquí. Compárala con los datos fiscales de Hacienda y con el informe fiscal
        anual de tu bróker antes de presentar la declaración.
      </app-notice>
      @if (s().missing) {
        <app-notice level="warning">
          Hay {{ s().missing }} {{ s().missing === 1 ? 'venta' : 'ventas' }} sin participaciones, así que no se puede calcular su ganancia.
          Lo más fácil es <a routerLink="/importar">volver a importar el archivo de Trade Republic</a> (completa los datos que falten).
        </app-notice>
      }

      <section class="grid kpis">
        <div class="kpi"><div class="label">Ganancias por ventas</div><div class="value up">{{ s().gains | money }}</div></div>
        <div class="kpi"><div class="label">Pérdidas por ventas</div><div class="value down">{{ s().losses | money }}</div></div>
        <div class="kpi"><div class="label">Dividendos (bruto)</div><div class="value">{{ s().dividendsGross | money }}</div></div>
        <div class="kpi"><div class="label">Intereses (bruto)</div><div class="value">{{ s().interestGross | money }}</div></div>
        <div class="kpi">
          <div class="label">Impuesto estimado<app-help term="Impuesto estimado" text="Lo que te costarían estas inversiones en la declaración: base del ahorro por tramos (19 % a 30 %), menos lo retenido en el extranjero por dividendos. Ya restadas las retenciones españolas, sale lo de 'a pagar'." /></div>
          <div class="value">{{ s().tax | money }}</div>
          <div class="sub">{{ s().toPay >= 0 ? 'A pagar ≈ ' : 'A devolver ≈ ' }}{{ abs(s().toPay) | money }}</div>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Cómo se calcula</h2>
        <table class="data calc">
          <tbody>
            <tr><td>Ganancias − pérdidas de ventas</td><td class="num">{{ s().netGains | money }}</td></tr>
            @if (s().deferredLosses) {
              <tr><td>Pérdidas que no cuentan este año (recompra en 2 meses)<app-help term="Regla de los 2 meses" text="Si vendes con pérdidas y recompras el mismo valor en los 2 meses anteriores o posteriores, esa pérdida se aplaza hasta que vendas lo recomprado." /></td><td class="num muted">{{ s().deferredLosses | money }}</td></tr>
            }
            <tr><td>Dividendos e intereses</td><td class="num">{{ s().dividendsGross + s().interestGross | money }}</td></tr>
            <tr class="total"><td>Base imponible del ahorro (tras compensar)</td><td class="num">{{ s().base | money }}</td></tr>
            @if (s().lossesToCarry) {
              <tr><td>Pérdidas para compensar en los próximos 4 años</td><td class="num">{{ s().lossesToCarry | money }}</td></tr>
            }
            <tr><td>Cuota por tramos (tipo marginal {{ marginal() * 100 | num: 0 }} %)</td><td class="num">{{ s().tax + deducted() | money }}</td></tr>
            @if (deducted()) {
              <tr><td>Menos deducción por doble imposición internacional</td><td class="num">−{{ deducted() | money }}</td></tr>
            }
            @if (s().spanishWithholding) {
              <tr><td>Menos retenciones ya pagadas en España</td><td class="num">−{{ s().spanishWithholding | money }}</td></tr>
            }
            <tr class="total"><td>Resultado estimado de tus inversiones</td><td class="num" [class.down]="s().toPay > 0" [class.up]="s().toPay < 0">{{ s().toPay | money }}</td></tr>
          </tbody>
        </table>
        <p class="small muted">Tramos del ahorro: @for (b of brackets; track b.rate; let last = $last) { {{ b.rate * 100 | num: 0 }} %{{ b.upTo === inf ? ' en adelante' : ' hasta ' + (b.upTo | num: 0) + ' €' }}{{ last ? '.' : ' · ' }} }</p>
      </section>

      <section class="card">
        <h2 class="card-title">Dónde ponerlo en Renta Web</h2>
        <ol class="where">
          @if (salesBy('accion').length || salesBy('etf').length) {
            <li>
              <strong>Ganancias y pérdidas patrimoniales → Transmisión de acciones admitidas a negociación</strong> (las acciones y los ETF van aquí).
              Añade una línea por cada venta de la tabla de abajo con su <em>valor de transmisión</em> y su <em>valor de adquisición</em>.
            </li>
          }
          @if (salesBy('fondo').length) {
            <li><strong>Ganancias y pérdidas patrimoniales → Transmisiones o reembolsos de fondos de inversión.</strong> Normalmente ya aparecen en tus datos fiscales; compruébalos.</li>
          }
          @if (salesBy('cripto').length) {
            <li><strong>Ganancias y pérdidas patrimoniales → Monedas virtuales.</strong> Una línea por venta de criptomonedas.</li>
          }
          @if (s().dividendsGross) {
            <li><strong>Rendimientos del capital mobiliario → Dividendos</strong>: {{ s().dividendsGross | money }} brutos (antes de retenciones).</li>
          }
          @if (s().interestGross) {
            <li><strong>Rendimientos del capital mobiliario → Intereses de cuentas</strong>: {{ s().interestGross | money }} brutos, con {{ s().spanishWithholding | money }} de retención.</li>
          }
          @if (s().foreignWithholding) {
            <li><strong>Deducción por doble imposición internacional</strong>: {{ s().foreignWithholding | money }} retenidos en el extranjero por dividendos (se deduce como máximo lo que pagarías en España por esos dividendos).</li>
          }
          @if (s().lossesToCarry) {
            <li><strong>Pérdidas pendientes de compensar</strong>: anota {{ s().lossesToCarry | money }} para restarlas de ganancias de los próximos 4 años.</li>
          }
          <li>
            <strong>Modelo 720 / 721 (informativos)</strong>: si a 31 de diciembre tenías más de 50.000 € en valores o cuentas en entidades extranjeras, o en criptomonedas
            custodiadas fuera de España, puede que tengas que presentarlos. Revisa si tu bróker deposita los valores en España o en el extranjero.
          </li>
        </ol>
        <p class="small muted">Los nombres de los apartados son los de Renta Web; los números de casilla cambian cada año, así que búscalos por nombre.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Ventas de {{ year() }}<app-help term="Valor de adquisición" text="Lo que te costaron las participaciones que vendes (comisiones incluidas), calculado por FIFO: primero salen las que compraste antes." /></h2>
        @if (s().sales.length) {
          <ul class="sales only-mobile">
            @for (v of s().sales; track $index) {
              <li>
                <div class="sl-top">
                  <a [routerLink]="['/activo', v.assetId]"><strong>{{ v.assetName }}</strong></a>
                  <strong [class.up]="(v.gain ?? 0) > 0" [class.down]="(v.gain ?? 0) < 0">{{ v.gain === undefined ? '—' : (v.gain | money) }}</strong>
                </div>
                <div class="small muted">{{ v.date | fecha }} · {{ typeLabel[v.type] }} · {{ v.shares | num: 4 }} particip.@if (v.isin) { · {{ v.isin }} }</div>
                <div class="sl-grid small">
                  <span>Transmisión</span><span class="num">{{ v.proceeds | money }}</span>
                  <span>Adquisición</span><span class="num">{{ v.cost === undefined ? '—' : (v.cost | money) }}</span>
                </div>
                @if (v.missingData) { <span class="badge warn">Faltan datos</span> }
                @if (v.washSale) { <span class="badge warn">Pérdida aplazada</span> }
              </li>
            }
          </ul>
          <div class="table-scroll hide-mobile">
            <table class="data">
              <thead><tr><th>Fecha</th><th>Valor</th><th>Tipo</th><th class="num">Particip.</th><th class="num">Transmisión</th><th class="num">Adquisición</th><th class="num">Resultado</th><th></th></tr></thead>
              <tbody>
                @for (v of s().sales; track $index) {
                  <tr>
                    <td>{{ v.date | fecha }}</td>
                    <td><a [routerLink]="['/activo', v.assetId]">{{ v.assetName }}</a>@if (v.isin) { <div class="small muted">{{ v.isin }}</div> }</td>
                    <td>{{ typeLabel[v.type] }}</td>
                    <td class="num">{{ v.shares | num: 4 }}</td>
                    <td class="num">{{ v.proceeds | money }}</td>
                    <td class="num">{{ v.cost === undefined ? '—' : (v.cost | money) }}</td>
                    <td class="num" [class.up]="(v.gain ?? 0) > 0" [class.down]="(v.gain ?? 0) < 0">{{ v.gain === undefined ? '—' : (v.gain | money) }}</td>
                    <td>
                      @if (v.missingData) { <span class="badge warn">Faltan datos</span> }
                      @if (v.washSale) { <span class="badge warn">Pérdida aplazada</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="muted">No hay ventas en {{ year() }}. Si no vendiste nada, no tienes ganancias ni pérdidas que declarar por ventas (aunque tus inversiones hayan subido).</p>
        }
      </section>

      @if (s().dividends.length) {
        <section class="card">
          <h2 class="card-title">Dividendos e intereses de {{ year() }}</h2>
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Bruto</th><th class="num">Retenido</th></tr></thead>
              <tbody>
                @for (d of s().dividends; track d.id) {
                  <tr>
                    <td>{{ d.date | fecha }}</td>
                    <td>{{ d.name }} <span class="small muted">{{ d.kind === 'interes' ? 'intereses' : 'dividendo' }}</span></td>
                    <td class="num">{{ d.gross | money }}</td>
                    <td class="num">{{ d.withheld | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section class="card">
        <h2 class="card-title">Cómo pagar menos impuestos (de forma legal)</h2>
        <app-tax-tips />
      </section>
    </div>
  `,
  styles: `
    .year { min-width: 240px; }
    .calc td:first-child { color: var(--text-2); }
    .calc tr.total td { font-weight: 600; color: var(--text); }
    .sales { list-style: none; margin: 0; padding: 0; }
    .sales li { display: grid; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .sl-top { display: flex; justify-content: space-between; gap: 10px; }
    .sl-top a { text-decoration: none; }
    .sl-grid { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; color: var(--text-2); }
    .sl-grid .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--text); }
    .where { margin: 0; padding-left: 20px; display: grid; gap: 10px; font-size: 14px; line-height: 1.55; }
  `,
})
export class TaxReturnPage {
  private readonly store = inject(StoreService);
  readonly typeLabel = ASSET_TYPE_LABEL;
  readonly brackets = SAVINGS_BRACKETS;
  readonly inf = Infinity;
  readonly year = signal(new Date().getFullYear());

  readonly years = computed(() => {
    const ys = new Set<number>([new Date().getFullYear(), new Date().getFullYear() - 1]);
    for (const a of this.store.assets()) for (const m of a.movements) ys.add(Number(m.date.slice(0, 4)));
    for (const d of this.store.dividends()) ys.add(Number(d.date.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  });

  readonly s = computed(() => yearSummary(this.year(), this.store.assets(), this.store.dividends()));
  readonly marginal = computed(() => marginalRate(this.s().base));
  readonly deducted = computed(() => Math.min(this.s().foreignWithholding, this.s().dividendsGross * 0.19));

  salesBy(type: string) {
    return this.s().sales.filter((v) => v.type === type);
  }

  abs(n: number): number {
    return Math.abs(n);
  }
}
