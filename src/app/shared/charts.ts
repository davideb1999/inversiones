import {
  ArcElement,
  Chart,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  Plugin,
  PointElement,
  ScatterController,
  TimeScale,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { es } from 'date-fns/locale';
import {
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { PricePoint } from '../core/market-data.service';
import { formatMoney, formatPct } from './format';
import { StoreService } from '../core/store.service';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Filler,
  DoughnutController,
  ArcElement,
  ScatterController,
);

export interface LineSeries {
  label: string;
  color: string;
  points: PricePoint[];
  fill?: boolean;
  dashed?: boolean;
  /** Etiqueta de otra serie: verde por encima de ella (beneficio) y rojo por debajo (pérdida). */
  gainAgainst?: string;
}

export interface ChartMarker {
  t: number;
  y: number;
  label: string;
  color: string;
}

/** Línea vertical que sigue al dedo/ratón (crosshair). */
const crosshair: Plugin<'line'> = {
  id: 'crosshair',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = getComputedStyle(chart.canvas).getPropertyValue('--muted') || '#898781';
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  },
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

@Component({
  selector: 'app-line-chart',
  template: `
    @if (series().length > 1) {
      <ul class="legend">
        @for (s of series(); track s.label) {
          <li><span class="swatch" [class.dashed]="s.dashed" [style.background]="s.gainAgainst ? 'linear-gradient(90deg, var(--line-up) 50%, var(--line-down) 50%)' : s.dashed ? 'transparent' : s.color" [style.border-color]="s.gainAgainst ? 'transparent' : s.color"></span>{{ s.label }}@if (s.gainAgainst) { <span class="muted">(verde: ganas · rojo: pierdes)</span> }</li>
        }
      </ul>
    }
    <div class="wrap" [style.height.px]="height()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
    </div>
  `,
  styles: `
    :host { display: block; }
    .wrap { position: relative; width: 100%; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; margin: 0 0 8px; padding: 0; font-size: 13px; color: var(--text-2); }
    .legend li { display: flex; align-items: center; gap: 6px; }
    .swatch { width: 14px; height: 4px; border-radius: 2px; border: 1px solid; }
    .swatch.dashed { border-style: dashed; height: 0; border-width: 2px 0 0; }
  `,
})
export class LineChart implements OnDestroy {
  private readonly theme = inject(ThemeService);
  private readonly store = inject(StoreService);
  readonly series = input.required<LineSeries[]>();
  readonly markers = input<ChartMarker[]>([]);
  readonly currency = input<string>('');
  readonly intraday = input(false);
  readonly height = input(280);
  /** 'money' formatea como dinero; 'pct' como porcentaje. */
  readonly format = input<'money' | 'pct'>('money');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart<'line' | 'scatter', { x: number; y: number }[]>;

  readonly ariaLabel = computed(() => 'Gráfico: ' + this.series().map((s) => s.label).join(', '));

  constructor() {
    afterRenderEffect(() => {
      const series = this.series();
      const markers = this.markers();
      this.theme.dark();
      this.render(series, markers);
    });
  }

  private fmt(v: number): string {
    if (this.format() === 'pct') return formatPct(v);
    return formatMoney(v, this.currency() || this.store.settings().baseCurrency);
  }

  private render(series: LineSeries[], markers: ChartMarker[]): void {
    const muted = this.theme.token('--muted');
    const grid = this.theme.token('--grid');
    const surface = this.theme.token('--surface');
    const text = this.theme.token('--text');
    const allT = series.flatMap((s) => s.points.map((p) => p.t));
    const span = allT.length ? Math.max(...allT) - Math.min(...allT) : 0;
    const unit = this.intraday() && span < 2 * 86_400_000 ? 'hour' : span < 45 * 86_400_000 ? 'day' : span < 800 * 86_400_000 ? 'month' : 'year';

    const gain = this.theme.token('--line-up') || '#0ca30c';
    const loss = this.theme.token('--line-down') || '#d03b3b';
    const datasets = [
      ...series.map((s) => {
        // Línea verde cuando va por encima de la serie de referencia (lo aportado) y roja cuando va por debajo.
        const refIdx = s.gainAgainst ? series.findIndex((o) => o.label === s.gainAgainst) : -1;
        const ref = refIdx >= 0 ? series[refIdx].points : undefined;
        const above = (i: number) => (ref ? s.points[i].close >= (ref[i]?.close ?? ref.at(-1)?.close ?? 0) : true);
        const lineColor = ref ? (above(s.points.length - 1) ? gain : loss) : s.color;
        return {
        type: 'line' as const,
        label: s.label,
        data: s.points.map((p) => ({ x: p.t, y: p.close })),
        borderColor: lineColor,
        ...(ref
          ? {
              segment: {
                borderColor: (ctx: { p1DataIndex: number }) => (above(ctx.p1DataIndex) ? gain : loss),
              },
            }
          : {}),
        borderWidth: 2,
        borderDash: s.dashed ? [6, 4] : [],
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: surface,
        pointHoverBackgroundColor: lineColor,
        tension: 0.15,
        fill: ref ? { target: refIdx, above: hexToRgba(gain, 0.16), below: hexToRgba(loss, 0.16) } : s.fill ? 'origin' : false,
        backgroundColor: (ctx: { chart: Chart }) => {
          const area = ctx.chart.chartArea;
          if (!area) return hexToRgba(s.color, 0.1);
          const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, hexToRgba(s.color, 0.22));
          g.addColorStop(1, hexToRgba(s.color, 0));
          return g;
        },
        };
      }),
      ...(markers.length
        ? [
            {
              type: 'scatter' as const,
              label: 'Movimientos',
              data: markers.map((m) => ({ x: m.t, y: m.y })),
              pointRadius: 5,
              pointHoverRadius: 7,
              pointBackgroundColor: markers.map((m) => m.color),
              pointBorderColor: surface,
              pointBorderWidth: 2,
            },
          ]
        : []),
    ];

    if (this.chart) this.chart.destroy();
    const values = series.flatMap((s) => s.points.map((p) => p.close));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const anyFill = series.some((s) => s.fill);

    this.chart = new Chart(this.canvas().nativeElement, {
      type: 'line',
      data: { datasets } as never,
      plugins: [crosshair as Plugin<'line' | 'scatter'>],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        layout: { padding: { top: 6, right: 4 } },
        scales: {
          x: {
            type: 'time',
            adapters: { date: { locale: es } },
            time: { unit, tooltipFormat: this.intraday() ? 'd MMM, HH:mm' : 'd MMM yyyy' },
            grid: { display: false },
            border: { color: grid },
            ticks: { color: muted, maxRotation: 0, autoSkipPadding: 18, font: { size: 11 } },
          },
          y: {
            position: 'right',
            beginAtZero: anyFill && min > 0 && min < max * 0.35,
            grid: { color: grid },
            border: { display: false },
            ticks: {
              color: muted,
              font: { size: 11 },
              maxTicksLimit: 6,
              callback: (v) => {
                const n = Number(v);
                if (this.format() === 'pct') return formatPct(n);
                const cur = this.currency() || this.store.settings().baseCurrency;
                return Math.abs(n) >= 10_000 ? formatMoney(n, cur, true) : formatMoney(n, cur);
              },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surface,
            titleColor: text,
            bodyColor: text,
            borderColor: grid,
            borderWidth: 1,
            padding: 10,
            usePointStyle: true,
            boxPadding: 4,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === 'Movimientos') return markers[ctx.dataIndex]?.label ?? '';
                return `${ctx.dataset.label}: ${this.fmt(ctx.parsed.y ?? 0)}`;
              },
            },
          },
        },
      },
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}

export interface DonutItem {
  label: string;
  value: number;
  pct: number;
  color: string;
}

@Component({
  selector: 'app-donut',
  imports: [],
  template: `
    <div class="donut">
      <div class="canvas-wrap"><canvas #canvas role="img" [attr.aria-label]="'Reparto: ' + labels()"></canvas></div>
      <ul class="items">
        @for (it of items(); track it.label) {
          <li>
            <span class="dot" [style.background]="it.color"></span>
            <span class="name">{{ it.label }}</span>
            <span class="pct">{{ it.pct.toFixed(1) }} %</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .donut { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
    .canvas-wrap { width: 150px; height: 150px; flex: none; }
    .items { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 160px; display: grid; gap: 8px; font-size: 14px; }
    li { display: flex; align-items: center; gap: 8px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
    .pct { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
  `,
})
export class Donut implements OnDestroy {
  private readonly theme = inject(ThemeService);
  private readonly store = inject(StoreService);
  readonly items = input.required<DonutItem[]>();
  readonly labels = computed(() => this.items().map((i) => `${i.label} ${i.pct.toFixed(0)}%`).join(', '));
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart<'doughnut'>;

  constructor() {
    afterRenderEffect(() => {
      const items = this.items();
      this.theme.dark();
      const surface = this.theme.token('--surface');
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, {
        type: 'doughnut',
        data: {
          labels: items.map((i) => i.label),
          datasets: [{ data: items.map((i) => i.value), backgroundColor: items.map((i) => i.color), borderColor: surface, borderWidth: 2 }],
        },
        options: {
          cutout: '68%',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${formatMoney(Number(ctx.raw), this.store.settings().baseCurrency)} (${items[ctx.dataIndex].pct.toFixed(1)} %)`,
              },
            },
          },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
