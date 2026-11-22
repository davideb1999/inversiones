import { Component, computed, inject, input, signal } from '@angular/core';
import { CongressTrades } from '../shared/congress';
import { RouterLink } from '@angular/router';
import { AiService, extractJson } from '../core/ai.service';
import { GURUS } from '../core/gurus';
import { GuruReport, today } from '../core/models';
import { msg } from '../core/portfolio.service';
import { StoreService } from '../core/store.service';
import { FechaPipe } from '../shared/format';
import { Icon } from '../shared/icon';
import { Help, Notice } from '../shared/ui';

@Component({
  selector: 'app-gurus',
  imports: [RouterLink, FechaPipe, Icon, Help, Notice, CongressTrades],
  template: `
    <div [class.page]="!embedded()" class="stack-lg">
      <header class="page-header">
        <div>
          @if (!embedded()) { <h1>Grandes inversores</h1> } @else { <h2>Fondos famosos</h2> }
          <p>Qué compran y venden los inversores más famosos del mundo, explicado fácil.</p>
        </div>
        <button class="btn primary" (click)="refresh()" [disabled]="loading() || !ai.isConfigured()">
          @if (loading()) { <span class="spinner"></span> Investigando... } @else { <app-icon name="refresh" [size]="18" /> {{ report() ? 'Actualizar' : 'Ver sus últimos movimientos' }} }
        </button>
      </header>

      @if (!ai.isConfigured()) {
        <app-notice level="warning">Para consultar sus últimos movimientos necesitas la clave de {{ ai.providerName() }} en <a routerLink="/ajustes">Ajustes</a>. Mientras, puedes leer cómo invierte cada uno.</app-notice>
      } @else if (!ai.canSearch()) {
        <app-notice level="warning">Tu IA no tiene la búsqueda en internet activada, así que los movimientos saldrán de lo que la IA conoce y <strong>pueden tener varios meses de retraso</strong>. Fíjate en el periodo de cada informe.</app-notice>
      }
      <app-congress-trades slug="nancy-pelosi" />

      <app-notice level="info">
        Los fondos grandes de EE. UU. publican sus carteras cada trimestre (informe <strong>13F</strong>) con hasta 45 días de retraso.
        Es decir: ves lo que hicieron hace semanas, no lo que hacen hoy.
      </app-notice>
      @if (error()) { <p class="error">{{ error() }}</p> }
      @if (loading()) {
        <div class="skeleton" style="height: 220px"></div>
        <p class="small muted">La IA está buscando los últimos informes en internet. Puede tardar 1-2 minutos.</p>
      }

      @if (report(); as r) {
        <p class="small muted">Actualizado el {{ r.createdAt | fecha: true }}</p>
        @if (r.consensus.length) {
          <section class="card">
            <h2 class="card-title">Lo que compran varios a la vez<app-help term="Consenso" text="Valores que aparecen en las compras o carteras de varios de estos inversores. Que coincidan no garantiza nada, pero es una pista interesante." /></h2>
            <div class="consensus">
              @for (c of r.consensus; track c.symbol) {
                <a class="cons" [routerLink]="['/mercado', c.symbol]">
                  <strong>{{ c.symbol }}</strong>
                  <span class="small text-2">{{ c.name }}</span>
                  <span class="small">{{ c.note }}</span>
                  <span class="who">{{ c.investors.join(' · ') }}</span>
                </a>
              }
            </div>
          </section>
        }
      }

      <div class="gurus">
        @for (g of gurus; track g.name) {
          <article class="card guru">
            <header>
              <div class="avatar">{{ initials(g.name) }}</div>
              <div><h3>{{ g.name }}</h3><div class="small muted">{{ g.fund }}</div></div>
            </header>
            <span class="badge accent">{{ g.style }}</span>
            <p class="small">{{ g.idea }}</p>
            <p class="lesson">{{ g.lesson }}</p>
            @if (byName()[g.name]; as d) {
              <div class="moves">
                <div class="small muted">{{ d.period }}</div>
                <p class="small">{{ d.summary }}</p>
                @if (d.buys.length) {
                  <div class="mv"><span class="badge good">Compró</span>
                    @for (b of d.buys; track b.symbol) { <a [routerLink]="['/mercado', b.symbol]" [title]="b.note">{{ b.symbol }}</a> }
                  </div>
                }
                @if (d.sells.length) {
                  <div class="mv"><span class="badge bad">Vendió</span>
                    @for (s of d.sells; track s.symbol) { <a [routerLink]="['/mercado', s.symbol]" [title]="s.note">{{ s.symbol }}</a> }
                  </div>
                }
                @if (d.topHoldings.length) {
                  <div class="small muted" style="margin-top: 8px">Sus mayores posiciones</div>
                  <ul class="holdings">
                    @for (h of d.topHoldings; track h.symbol) {
                      <li>
                        <a [routerLink]="['/mercado', h.symbol]">{{ h.symbol }}</a>
                        <span class="bar"><span [style.width.%]="barWidth(h.weightPct, d.topHoldings)"></span></span>
                        <span class="w">{{ h.weightPct.toFixed(1) }} %</span>
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </article>
        }
      </div>

      @if (report()?.sources?.length) {
        <div class="sources">@for (s of report()!.sources; track s.url) { <a [href]="s.url" target="_blank" rel="noopener" [title]="s.title">{{ s.title }}</a> }</div>
      }
      <p class="disclaimer">Copiar a un gran inversor no garantiza sus resultados: compraron a otros precios y con otros objetivos. Información recopilada por IA; verifica antes de decidir.</p>
    </div>
  `,
  styles: `
    .stack-lg { display: grid; gap: 20px; }
    .gurus { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .guru { display: grid; gap: 8px; align-content: start; }
    .guru header { display: flex; gap: 12px; align-items: center; }
    .guru .badge { justify-self: start; }
    .avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-weight: 800; flex: none; }
    .lesson { font-size: 13px; color: var(--text-2); font-style: italic; margin: 0; }
    .moves { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 4px; }
    .mv { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; font-size: 13px; }
    .mv a, .holdings a { font-weight: 700; text-decoration: none; }
    .holdings { list-style: none; padding: 0; margin: 6px 0 0; display: grid; gap: 6px; font-size: 13px; }
    .holdings li { display: grid; grid-template-columns: 64px 1fr 52px; gap: 8px; align-items: center; }
    .bar { height: 8px; background: var(--chip); border-radius: 4px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
    .w { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-2); }
    .consensus { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    .cons { display: grid; gap: 2px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--text); }
    .cons:hover { border-color: var(--accent); }
    .cons strong { font-size: 18px; }
    .who { font-size: 12px; color: var(--accent); margin-top: 4px; }
  `,
})
export class GurusPage {
  /** Dentro de otra página (Oportunidades): sin márgenes de página ni título principal. */
  readonly embedded = input(false);
  protected readonly store = inject(StoreService);
  protected readonly ai = inject(AiService);
  readonly gurus = GURUS;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly report = this.store.guruReport;
  readonly byName = computed(() => Object.fromEntries((this.report()?.investors ?? []).map((i) => [i.name, i])));

  initials(name: string): string {
    return name
      .split(' ')
      .filter((w) => w.length > 2)
      .slice(0, 2)
      .map((w) => w[0])
      .join('');
  }

  barWidth(w: number, all: { weightPct: number }[]): number {
    const max = Math.max(...all.map((h) => h.weightPct), 1);
    return (w / max) * 100;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const names = GURUS.map((g) => `${g.name} (${g.fund})`).join('; ');
      const res = await this.ai.ask({
        system: 'Eres un analista que resume los movimientos de grandes inversores para personas sin conocimientos financieros. Escribe en español de España, frases cortas. Usa solo datos que encuentres en fuentes fiables (13F en SEC, Dataroma, WhaleWisdom, informes trimestrales de los fondos, prensa económica). No inventes.',
        messages: [
          {
            role: 'user',
            content: `Hoy es ${today()}. ${
              this.ai.canSearch()
                ? 'Busca en internet el último informe trimestral publicado'
                : 'No puedes buscar en internet: usa el último informe trimestral que conozcas'
            } (13F o informe del fondo) de estos inversores: ${names}.
Para cada uno indica: periodo del informe, un resumen de 1-2 frases sencillas, hasta 3 compras destacadas, hasta 3 ventas destacadas y sus 5 mayores posiciones con su peso aproximado en %.
Después, detecta valores que compren o tengan varios de ellos a la vez (consenso, hasta 6).
Usa tickers de EE. UU. cuando existan. Si no encuentras datos de alguno, deja sus listas vacías y dilo en el resumen.
Responde SOLO con un bloque \`\`\`json con este formato:
{"investors":[{"name":"Warren Buffett","fund":"Berkshire Hathaway","period":"T3 2026","summary":"...","topHoldings":[{"symbol":"AAPL","name":"Apple","weightPct":25.1}],"buys":[{"symbol":"X","name":"...","note":"..."}],"sells":[{"symbol":"Y","name":"...","note":"..."}]}],
"consensus":[{"symbol":"GOOGL","name":"Alphabet","investors":["Bill Ackman","..."],"note":"..."}]}
Usa exactamente estos nombres en "name": ${GURUS.map((g) => g.name).join(', ')}.`,
          },
        ],
        webSearch: true,
        maxSearches: 15,
        effort: 'medium',
      });
      const parsed = extractJson<Omit<GuruReport, 'createdAt' | 'sources'>>(res.text);
      this.store.setGuruReport({
        createdAt: new Date().toISOString(),
        investors: (parsed.investors ?? []).map((i) => ({
          ...i,
          topHoldings: (i.topHoldings ?? []).map((h) => ({ ...h, weightPct: Number(h.weightPct) || 0 })),
          buys: i.buys ?? [],
          sells: i.sells ?? [],
        })),
        consensus: parsed.consensus ?? [],
        sources: res.sources,
      });
    } catch (e) {
      this.error.set(msg(e));
    } finally {
      this.loading.set(false);
    }
  }
}
