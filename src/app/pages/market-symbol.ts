import { Component, computed, inject, input, resource } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MarketDataService } from '../core/market-data.service';
import { StoreService } from '../core/store.service';
import { AnalystView } from '../shared/analyst-view';
import { AnalystTargets, FairValue } from '../shared/analyst-targets';
import { Icon } from '../shared/icon';
import { MarketInfo, PriceChart } from '../shared/market-widgets';

/** Ficha de un valor: análisis de analistas, gráfico, salud de la empresa y noticias. */
@Component({
  selector: 'app-market-symbol',
  imports: [RouterLink, PriceChart, MarketInfo, AnalystView, AnalystTargets, FairValue, Icon],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <button class="back" (click)="location.back()"><app-icon name="back" [size]="16" /> Volver</button>
          <h1>{{ name() || symbol() }} <span class="tk">{{ symbol() }}</span></h1>
        </div>
        <div class="row">
          <a class="btn" routerLink="/asesor" [queryParams]="{ q: '¿Qué te parece ' + symbol() + ' para mi cartera y mi perfil?' }"><app-icon name="chat" [size]="18" />Preguntar al asesor</a>
          @if (owned(); as a) {
            <a class="btn primary" [routerLink]="['/activo', a.id]">Ver mi inversión</a>
          } @else {
            <a class="btn primary" routerLink="/nuevo"><app-icon name="plus" [size]="18" />Añadir a mi cartera</a>
          }
        </div>
      </header>
      <app-analyst-view [symbol]="symbol()" [isEtf]="isEtf()" />
      @if (!isEtf()) {
        <app-analyst-targets [symbol]="symbol()" />
      }
      <section class="card"><app-price-chart [symbol]="symbol()" /></section>
      @if (!isEtf()) {
        <app-fair-value [symbol]="symbol()" />
      }
      <app-market-info [symbol]="symbol()" />
    </div>
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); background: none; border: 0; padding: 0; font: inherit; font-size: 14px; margin-bottom: 6px; cursor: pointer; }
    .tk { font-size: 15px; font-weight: 600; color: var(--muted); margin-left: 6px; }
  `,
})
export class MarketSymbolPage {
  protected readonly location = inject(Location);
  private readonly store = inject(StoreService);
  private readonly market = inject(MarketDataService);
  readonly symbol = input.required<string>();
  readonly owned = computed(() => this.store.assets().find((a) => a.symbol === this.symbol() && !a.tracking));

  private readonly info = resource({
    params: () => this.symbol(),
    loader: ({ params }) => this.market.search(params).then((r) => r.find((x) => x.symbol === params && x.country === 'United States') ?? r[0]).catch(() => undefined),
  });
  readonly name = computed(() => this.info.value()?.name ?? '');
  readonly isEtf = computed(() => !!this.info.value()?.type?.includes('ETF'));
}
