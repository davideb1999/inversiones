import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MarketDataService, SymbolResult } from '../core/market-data.service';
import { Icon } from '../shared/icon';
import { Notice } from '../shared/ui';
import { TickerTape } from '../shared/ticker-tape';

const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'NFLX', 'KO', 'JPM', 'V', 'LLY'];
const RECENT_KEY = 'inv.recentAnalyses';

/** Buscador para analizar cualquier acción de EE. UU. con la opinión de los analistas. */
@Component({
  selector: 'app-analyze',
  imports: [FormsModule, RouterLink, Icon, Notice, TickerTape],
  template: `
    <div class="page narrow">
      <app-ticker-tape />
      <header class="page-header">
        <div>
          <h1>Analizar una acción</h1>
          <p>Busca una empresa y te explicamos qué opinan los analistas, a qué precio la ven y cuánto tiempo tiene sentido mantenerla.</p>
        </div>
      </header>

      @if (!market.hasAlphaVantage()) {
        <app-notice level="info">
          Para ver el <strong>precio objetivo</strong> de los analistas añade la clave gratuita de Alpha Vantage en <a routerLink="/ajustes">Ajustes</a>
          (sin ella verás solo cuántos recomiendan comprar o vender).
        </app-notice>
      }

      <section class="card stack">
        <div class="search">
          <app-icon name="search" [size]="18" />
          <input [(ngModel)]="query" (ngModelChange)="onQuery($event)" (keydown.enter)="goFirst()" placeholder="Nombre o ticker: Apple, Tesla, KO..." autocomplete="off" aria-label="Buscar acción" />
          @if (searching()) { <span class="spinner"></span> }
        </div>
        @if (results().length) {
          <ul class="results">
            @for (r of results(); track r.symbol + r.exchange) {
              <li>
                <button type="button" (click)="go(r.symbol)">
                  <span class="sym">{{ r.symbol }}</span>
                  <span class="nm">{{ r.name }}</span>
                  <span class="ex">{{ r.exchange }} · {{ r.type }}</span>
                </button>
              </li>
            }
          </ul>
        } @else if (query.trim().length >= 2 && !searching()) {
          <p class="small muted">Sin resultados en bolsas de EE. UU. Los datos gratuitos solo cubren acciones y ETF de EE. UU.</p>
        }

        @if (recent().length) {
          <div>
            <div class="small muted label">Analizadas hace poco</div>
            <div class="chips">@for (s of recent(); track s) { <button class="chip" (click)="go(s)">{{ s }}</button> }</div>
          </div>
        }
        <div>
          <div class="small muted label">Populares</div>
          <div class="chips">@for (s of popular; track s) { <button class="chip" (click)="go(s)">{{ s }}</button> }</div>
        </div>
      </section>
    </div>
  `,
  styles: `
    .narrow { max-width: 820px; }
    .search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; background: var(--surface); color: var(--muted); }
    .search input { border: 0; padding-left: 0; background: transparent; font-size: 16px; }
    .search input:focus { outline: none; }
    .results { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .results button { width: 100%; display: grid; grid-template-columns: 80px 1fr; gap: 0 12px; text-align: left; padding: 10px 12px; border-radius: 6px; border: 0; background: none; color: var(--text); font: inherit; cursor: pointer; }
    .results button:hover { background: var(--surface-2); }
    .sym { font-weight: 700; grid-row: span 2; align-self: center; }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ex { font-size: 12px; color: var(--muted); }
    .label { margin-bottom: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .chip:hover { border-color: var(--text); }
  `,
})
export class AnalyzePage {
  protected readonly market = inject(MarketDataService);
  private readonly router = inject(Router);
  readonly popular = POPULAR;
  readonly results = signal<SymbolResult[]>([]);
  readonly searching = signal(false);
  readonly recent = signal<string[]>(this.readRecent());
  query = '';
  private timer?: ReturnType<typeof setTimeout>;

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
        this.results.set(res.filter((r) => r.free && r.country === 'United States' && /Stock|ETF|Depositary|REIT/.test(r.type)).slice(0, 10));
      } catch {
        this.results.set([]);
      } finally {
        this.searching.set(false);
      }
    }, 300);
  }

  goFirst(): void {
    const first = this.results()[0];
    if (first) this.go(first.symbol);
    else if (/^[A-Za-z.]{1,6}$/.test(this.query.trim())) this.go(this.query.trim().toUpperCase());
  }

  go(symbol: string): void {
    const next = [symbol, ...this.recent().filter((s) => s !== symbol)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // sin almacenamiento: no pasa nada
    }
    void this.router.navigate(['/mercado', symbol]);
  }

  private readRecent(): string[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }
}
