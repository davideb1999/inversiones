import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketDataService } from '../core/market-data.service';
import { PctPipe } from './format';

interface Tick {
  symbol: string;
  price: number;
  pct: number;
}

/** Cinta de cotizaciones en movimiento, como las pantallas de Wall Street. */
@Component({
  selector: 'app-ticker-tape',
  imports: [RouterLink, PctPipe],
  template: `
    @if (ticks().length) {
      <div class="tape" aria-label="Cotizaciones del día">
        <div class="track" [style.animation-duration.s]="ticks().length * 3.2">
          @for (round of [0, 1]; track round) {
            @for (t of ticks(); track t.symbol) {
              <a class="tick" [routerLink]="['/mercado', t.symbol]" [attr.aria-hidden]="round === 1 ? 'true' : null" [attr.tabindex]="round === 1 ? -1 : null">
                <span class="sym">{{ t.symbol }}</span>
                <span class="px">{{ t.price.toFixed(2) }}</span>
                <span class="chg" [class.up]="t.pct >= 0" [class.down]="t.pct < 0">{{ t.pct >= 0 ? '▲' : '▼' }} {{ t.pct | pct }}</span>
              </a>
            }
          }
        </div>
      </div>
      <div class="small muted stamp">Variación de la última sesión · se actualiza cada 2 minutos</div>
    } @else if (loading()) {
      <div class="tape skeleton-tape"></div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; max-width: 100%; overflow: hidden; }
    .tape { overflow: hidden; background: #0c0c0b; border-radius: 8px; border: 1px solid #222; mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
    .skeleton-tape { height: 42px; opacity: .6; }
    .track { display: flex; width: max-content; animation: scroll linear infinite; }
    .tape:hover .track { animation-play-state: paused; }
    @media (prefers-reduced-motion: reduce) { .track { animation: none; } .tape { overflow-x: auto; } }
    @keyframes scroll { to { transform: translateX(-50%); } }
    .tick { display: inline-flex; align-items: baseline; gap: 8px; padding: 11px 18px; border-right: 1px solid #222; color: #e9e8e3; text-decoration: none; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 14px; }
    .tick:hover { background: #1a1a19; }
    .sym { font-weight: 700; letter-spacing: .02em; }
    .px { color: #c8c7bf; }
    .chg { font-size: 13px; font-weight: 600; }
    .chg.up { color: #3ccf5c; }
    .chg.down { color: #ff6b6b; }
    .stamp { margin-top: 4px; }
  `,
})
export class TickerTape implements OnInit, OnDestroy {
  private readonly market = inject(MarketDataService);
  readonly symbols = input<string[]>(['SPY', 'QQQ', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'JPM', 'V', 'NFLX', 'KO', 'XOM', 'GLD']);
  readonly ticks = signal<Tick[]>([]);
  readonly loading = signal(true);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (!this.market.hasFinnhub()) {
      this.loading.set(false);
      return;
    }
    void this.load();
    this.timer = setInterval(() => void this.load(), 2 * 60_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async load(): Promise<void> {
    const out: Tick[] = [];
    await Promise.all(
      this.symbols().map(async (symbol) => {
        try {
          const q = await this.market.quote(symbol);
          if (q.price) out.push({ symbol, price: q.price, pct: q.changePct });
        } catch {
          // un valor sin datos no rompe la cinta
        }
      }),
    );
    const order = this.symbols();
    this.ticks.set(out.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol)));
    this.loading.set(false);
  }
}
