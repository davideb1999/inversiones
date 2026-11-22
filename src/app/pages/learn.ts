import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LineChart, LineSeries } from '../shared/charts';
import { MoneyPipe } from '../shared/format';
import { TaxTips } from '../shared/tax-tips';
import { rescuePlan } from '../core/tax';

const GLOSSARY: { term: string; text: string }[] = [
  { term: 'Acción', text: 'Un trocito de una empresa. Si a la empresa le va bien, tu trocito vale más (y a veces te paga dividendos).' },
  { term: 'ETF', text: 'Una cesta con muchas acciones que compras de golpe. Un ETF del S&P 500 te da 500 empresas de EE. UU. con una sola compra.' },
  { term: 'Fondo indexado', text: 'Como un ETF pero se compra a través de tu banco o gestora. Copia un índice (p. ej. el MSCI World) con comisiones bajas.' },
  { term: 'Diversificar', text: 'No poner todos los huevos en la misma cesta: repartir el dinero entre muchas empresas, países y tipos de activo.' },
  { term: 'Interés compuesto', text: 'Ganar intereses sobre los intereses. Con tiempo, hace crecer el dinero como una bola de nieve.' },
  { term: 'Dividendo', text: 'Parte del beneficio que una empresa reparte en efectivo a sus accionistas.' },
  { term: 'Volatilidad', text: 'Cuánto sube y baja algo. Más volatilidad = más sustos, pero suele ir con más rentabilidad a largo plazo.' },
  { term: 'Aportación periódica (DCA)', text: 'Invertir la misma cantidad cada mes, pase lo que pase. Así compras más barato cuando cae y evitas intentar adivinar el mercado.' },
  { term: 'PER', text: 'Precio de la acción dividido entre lo que gana la empresa por acción. Indica si está "cara" o "barata".' },
  { term: 'TER / comisión', text: 'Lo que te cobra un fondo o ETF cada año. Un 0,2 % frente a un 1,5 % parece poco, pero en 30 años es muchísimo dinero.' },
  { term: 'Fondo de emergencia', text: 'Ahorro de 3-6 meses de gastos en algo seguro, para no tener que vender inversiones en mal momento.' },
  { term: 'TIR / rentabilidad anual', text: 'Lo que has ganado de media cada año teniendo en cuenta cuándo metiste cada euro.' },
  { term: 'Mercado bajista', text: 'Cuando la bolsa cae más de un 20 % desde máximos. Pasa cada pocos años y siempre se ha acabado recuperando (aunque tarde).' },
  { term: '13F', text: 'Informe trimestral en el que los grandes fondos de EE. UU. publican qué acciones tienen.' },
];

const RULES = [
  { title: 'Primero, el colchón', text: 'Antes de invertir, ten ahorrados 3-6 meses de gastos en algo seguro.' },
  { title: 'Piensa en años, no en días', text: 'La bolsa a 1 día es casi una moneda al aire. A 10+ años, históricamente ha ganado casi siempre.' },
  { title: 'Reparte', text: 'Un ETF o fondo indexado global es la forma más fácil y barata de diversificar.' },
  { title: 'Comisiones bajas', text: 'Es de lo poco que controlas. Busca productos por debajo del 0,3 % anual.' },
  { title: 'Aporta cada mes', text: 'Automatiza una cantidad fija. La constancia gana a la puntería.' },
  { title: 'No vendas por miedo', text: 'Las caídas son el precio de la rentabilidad. Vender en pánico es el error más caro.' },
];

@Component({
  selector: 'app-learn',
  imports: [FormsModule, LineChart, MoneyPipe, TaxTips],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Aprende</h1>
          <p>Lo básico para entender tus inversiones, sin tecnicismos.</p>
        </div>
      </header>

      <section class="card">
        <h2 class="card-title">Calculadora: ¿cuánto puede crecer mi dinero?</h2>
        <div class="form-grid">
          <label class="field">Dinero inicial (€) <input type="number" min="0" [ngModel]="initial()" (ngModelChange)="initial.set(+$event || 0)" /></label>
          <label class="field">Aportación mensual (€) <input type="number" min="0" [ngModel]="monthly()" (ngModelChange)="monthly.set(+$event || 0)" /></label>
          <label class="field">Años <input type="number" min="1" max="60" [ngModel]="years()" (ngModelChange)="years.set(clampYears(+$event))" /></label>
          <label class="field">Rentabilidad anual (%) <small>histórica bolsa mundial ≈ 7 %</small>
            <input type="number" step="0.5" [ngModel]="rate()" (ngModelChange)="rate.set(+$event || 0)" />
          </label>
        </div>
        <div class="result">
          <div><div class="small text-2">Tendrías</div><div class="hero-value">{{ sim().final | money: 'EUR' }}</div></div>
          <div><div class="small text-2">Habrías puesto</div><div class="big">{{ sim().contributed | money: 'EUR' }}</div></div>
          <div><div class="small text-2">Ganancia por interés compuesto</div><div class="big up">{{ sim().final - sim().contributed | money: 'EUR' }}</div></div>
        </div>
        <app-line-chart [series]="series()" [height]="260" />
        <p class="small muted">Simulación con rentabilidad constante. En la realidad habrá años buenos y malos.</p>

        <div class="after-tax">
          <h3>Después de impuestos (España)</h3>
          <div class="result">
            <div><div class="small text-2">Impuesto si lo sacas todo de golpe</div><div class="big down">−{{ rescue().oneYear | money: 'EUR' }}</div></div>
            <div><div class="small text-2">Te quedarías limpio con</div><div class="big">{{ sim().final - rescue().oneYear | money: 'EUR' }}</div></div>
            <div><div class="small text-2">Ganancia neta</div><div class="big up">{{ gain() - rescue().oneYear | money: 'EUR' }}</div></div>
          </div>
          <p class="small text-2">Solo tributa la ganancia ({{ gain() | money: 'EUR' }}), no lo que pusiste. Tipo medio: {{ gain() > 0 ? ((rescue().oneYear / gain()) * 100).toFixed(1) : '0' }} %.</p>

          <label class="field slider">Si en vez de sacarlo de golpe lo repartes en {{ rescueYears() }} {{ rescueYears() === 1 ? 'año' : 'años' }}
            <input type="range" min="1" max="15" [ngModel]="rescueYears()" (ngModelChange)="rescueYears.set(+$event)" />
          </label>
          <p class="plan">
            Sacando la parte de ganancia de unos <strong>{{ rescue().perYear | money: 'EUR' }}</strong> al año pagarías
            <strong>{{ rescue().spread | money: 'EUR' }}</strong> en total:
            @if (rescue().saving > 0) { <span class="up">te ahorras {{ rescue().saving | money: 'EUR' }}</span>. } @else { lo mismo que de golpe (ya estás en el primer tramo). }
            @if (rescue().perYear > 6000) { Para pagar solo el 19 % necesitarías unos {{ yearsFor19() }} años. }
          </p>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Cómo sacar los beneficios pagando lo mínimo (legal)</h2>
        <app-tax-tips />
      </section>

      <section>
        <h2 style="margin-bottom: 12px">6 reglas de oro</h2>
        <div class="rules">
          @for (r of rules; track r.title; let i = $index) {
            <div class="card rule"><span class="n">{{ i + 1 }}</span><div><strong>{{ r.title }}</strong><p class="small text-2">{{ r.text }}</p></div></div>
          }
        </div>
      </section>

      <section>
        <h2 style="margin-bottom: 12px">Diccionario</h2>
        <input class="filter" placeholder="Buscar término..." [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
        <div class="glossary">
          @for (g of glossary(); track g.term) {
            <div class="card"><strong>{{ g.term }}</strong><p class="small text-2">{{ g.text }}</p></div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .result { display: flex; flex-wrap: wrap; gap: 24px 40px; align-items: flex-end; margin: 18px 0; }
    .big { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .after-tax { border-top: 1px solid var(--border); margin-top: 18px; padding-top: 16px; }
    .after-tax h3 { margin-bottom: 4px; }
    .slider input { padding: 0; min-height: 0; accent-color: var(--text); }
    .plan { font-size: 14px; }
    .rules { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .rule { display: flex; gap: 12px; }
    .n { width: 30px; height: 30px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-weight: 800; flex: none; }
    .filter { max-width: 320px; margin-bottom: 12px; }
    .glossary { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .emoji { font-size: 26px; }
  `,
})
export class LearnPage {
  readonly rules = RULES;
  readonly initial = signal(1000);
  readonly monthly = signal(100);
  readonly years = signal(20);
  readonly rate = signal(7);
  readonly filter = signal('');
  readonly rescueYears = signal(5);
  readonly gain = computed(() => Math.max(0, this.sim().final - this.sim().contributed));
  readonly rescue = computed(() => rescuePlan(this.gain(), this.rescueYears()));
  /** Años necesarios para que cada año la ganancia no pase de 6.000 € (tramo del 19 %). */
  readonly yearsFor19 = computed(() => Math.ceil(this.gain() / 6000));

  readonly glossary = computed(() => {
    const f = this.filter().toLowerCase();
    return GLOSSARY.filter((g) => !f || g.term.toLowerCase().includes(f) || g.text.toLowerCase().includes(f));
  });

  clampYears(n: number): number {
    return Math.min(60, Math.max(1, Math.round(n) || 1));
  }

  readonly sim = computed(() => {
    const r = this.rate() / 100 / 12;
    let value = this.initial();
    let contributed = this.initial();
    const start = new Date();
    const value_: { t: number; close: number }[] = [{ t: start.getTime(), close: value }];
    const contrib: { t: number; close: number }[] = [{ t: start.getTime(), close: contributed }];
    for (let m = 1; m <= this.years() * 12; m++) {
      value = value * (1 + r) + this.monthly();
      contributed += this.monthly();
      if (m % 12 === 0) {
        const t = new Date(start);
        t.setFullYear(start.getFullYear() + m / 12);
        value_.push({ t: t.getTime(), close: Math.round(value) });
        contrib.push({ t: t.getTime(), close: Math.round(contributed) });
      }
    }
    return { final: value, contributed, value: value_, contrib };
  });

  readonly series = computed<LineSeries[]>(() => [
    { label: 'Valor con interés compuesto', color: '#0ca30c', points: this.sim().value, gainAgainst: 'Dinero que pones' },
    { label: 'Dinero que pones', color: '#898781', points: this.sim().contrib, dashed: true },
  ]);
}
