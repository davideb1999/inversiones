import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ADVISOR_SYSTEM, PROFILE_TEXT, RISK_QUIZ, portfolioContext, scoreProfile } from '../core/advisor';
import { AiService, AiTurn } from '../core/ai.service';
import { MarketDataService } from '../core/market-data.service';
import { PortfolioService, msg } from '../core/portfolio.service';
import { StoreService } from '../core/store.service';
import { FechaPipe, MarkdownPipe } from '../shared/format';
import { Icon } from '../shared/icon';
import { Notice } from '../shared/ui';

@Component({
  selector: 'app-advisor',
  imports: [FormsModule, RouterLink, MarkdownPipe, FechaPipe, Icon, Notice],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Asesor</h1>
          <p>Pregúntale lo que quieras sobre tu dinero. Conoce tu cartera y tu perfil.</p>
        </div>
      </header>

      @if (!ai.isConfigured()) {
        <app-notice level="warning">Para usar el asesor, añade tu clave de {{ ai.providerName() }} en <a routerLink="/ajustes">Ajustes</a>.</app-notice>
      }

      <div class="layout">
        <div class="side stack">
          <section class="card">
            <h2 class="card-title">Tu perfil de inversor</h2>
            @if (store.profile() && !quizOpen()) {
              <div class="profile-badge">{{ store.profile()!.label }}</div>
              <p class="text-2 small">{{ profileText() }}</p>
              <button class="btn sm" (click)="startQuiz()">Repetir test</button>
            } @else if (!quizOpen()) {
              <p class="text-2">Responde 5 preguntas rápidas para que los consejos se ajusten a ti.</p>
              <button class="btn primary" (click)="startQuiz()">Hacer el test (1 min)</button>
            } @else {
              <div class="quiz">
                <div class="small muted">Pregunta {{ qIndex() + 1 }} de {{ quiz.length }}</div>
                <h3>{{ quiz[qIndex()].text }}</h3>
                <div class="stack">
                  @for (o of quiz[qIndex()].options; track o.label) {
                    <button class="btn option" (click)="answer(o.points)">{{ o.label }}</button>
                  }
                </div>
              </div>
            }
          </section>

          <section class="card">
            <div class="card-head">
              <h2 class="card-title">Revisión de tu cartera</h2>
            </div>
            @if (reviewing()) {
              <div class="md" [innerHTML]="reviewText() | markdown"></div>
              <div class="row small muted"><span class="spinner"></span> {{ status() || 'Analizando tu cartera y el mercado...' }}</div>
            } @else if (store.portfolioReview(); as r) {
              <div class="md" [innerHTML]="r.text | markdown"></div>
              <p class="small muted">Hecha el {{ r.at | fecha: true }}</p>
            } @else {
              <p class="text-2 small">Un análisis completo: qué está bien, qué mejorar y próximos pasos concretos.</p>
            }
            @if (reviewError()) { <p class="error">{{ reviewError() }}</p> }
            <button class="btn primary" (click)="review()" [disabled]="reviewing() || !ai.isConfigured() || !store.assets().length">
              <app-icon name="chat" [size]="18" />{{ store.portfolioReview() ? 'Volver a analizar' : 'Analizar mi cartera' }}
            </button>
          </section>
        </div>

        <section class="card chat">
          <div class="card-head">
            <h2 class="card-title">Conversación</h2>
            @if (store.chat().length) { <button class="btn ghost sm" (click)="clear()">Nueva conversación</button> }
          </div>
          <div class="messages" #scroller>
            @if (!store.chat().length && !pending()) {
              <div class="welcome">
                <p>Puedes preguntarme, por ejemplo:</p>
                <div class="chips">
                  @for (s of suggestions; track s) {
                    <button class="chip" (click)="send(s)" [disabled]="!ai.isConfigured()">{{ s }}</button>
                  }
                </div>
              </div>
            }
            @for (m of store.chat(); track $index) {
              <div class="msg" [class.user]="m.role === 'user'">
                @if (m.role === 'user') {
                  <div class="bubble">{{ m.text }}</div>
                } @else {
                  <div class="bubble md" [innerHTML]="m.text | markdown"></div>
                  @if (m.sources?.length) {
                    <div class="sources">
                      @for (s of m.sources; track s.url) { <a [href]="s.url" target="_blank" rel="noopener" [title]="s.title">{{ s.title }}</a> }
                    </div>
                  }
                }
              </div>
            }
            @if (pending()) {
              <div class="msg">
                <div class="bubble md">
                  @if (streaming()) { <div [innerHTML]="streaming() | markdown"></div> } @else { <span class="typing"><span></span><span></span><span></span></span> {{ status() || 'Pensando...' }} }
                </div>
              </div>
            }
            @if (error()) { <p class="error">{{ error() }}</p> }
          </div>
          <form class="composer" (ngSubmit)="send(draft)">
            <textarea name="draft" rows="1" [(ngModel)]="draft" placeholder="Escribe tu pregunta..." (keydown.enter)="onEnter($event)" [disabled]="!ai.isConfigured()"></textarea>
            <label class="web" [title]="ai.canSearch() ? 'Permite buscar noticias y datos actuales en internet' : 'Pasa a la IA los precios y titulares de hoy (Finnhub)'"><input type="checkbox" name="web" [(ngModel)]="web" /> {{ ai.canSearch() ? 'Internet' : 'Datos de hoy' }}</label>
            @if (pending()) {
              <button type="button" class="btn" (click)="stop()" aria-label="Detener"><app-icon name="x" [size]="18" /></button>
            } @else {
              <button class="btn primary" type="submit" [disabled]="!draft.trim() || !ai.isConfigured()" aria-label="Enviar"><app-icon name="send" [size]="18" /></button>
            }
          </form>
          <p class="disclaimer">Las respuestas las genera una IA y pueden contener errores. No es asesoramiento financiero profesional.</p>
        </section>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
    .side { position: sticky; top: 16px; }
    .profile-badge { display: inline-block; font-size: 20px; font-weight: 750; padding: 4px 14px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); margin-bottom: 8px; }
    .quiz h3 { margin: 6px 0 12px; }
    .option { justify-content: flex-start; white-space: normal; text-align: left; }
    .chat { display: flex; flex-direction: column; min-height: 70dvh; }
    .messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 12px; max-height: 64dvh; }
    .msg { display: flex; flex-direction: column; align-items: flex-start; }
    .msg.user { align-items: flex-end; }
    .bubble { max-width: min(680px, 92%); padding: 12px 14px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border); }
    .msg.user .bubble { background: var(--accent); color: var(--accent-ink); border-color: transparent; white-space: pre-wrap; }
    .welcome { color: var(--text-2); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: 6px; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; text-align: left; }
    .chip:hover { border-color: var(--accent); }
    .composer { display: flex; gap: 8px; align-items: flex-end; border-top: 1px solid var(--border); padding-top: 12px; }
    .composer textarea { resize: none; min-height: 44px; max-height: 160px; field-sizing: content; }
    .web { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-2); white-space: nowrap; padding-bottom: 12px; }
    .web input { width: auto; min-height: 0; }
    .typing span { display: inline-block; width: 6px; height: 6px; margin-right: 3px; border-radius: 50%; background: var(--muted); animation: blink 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 50% { opacity: .2; } }
    @media (max-width: 1000px) {
      .layout { grid-template-columns: 1fr; }
      .side { position: static; order: 2; }
      .chat { min-height: 60dvh; }
    }
  `,
})
export class AdvisorPage implements OnInit {
  protected readonly store = inject(StoreService);
  protected readonly ai = inject(AiService);
  private readonly portfolio = inject(PortfolioService);
  private readonly market = inject(MarketDataService);
  readonly q = input<string>('');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly quiz = RISK_QUIZ;
  readonly quizOpen = signal(false);
  readonly qIndex = signal(0);
  private answers: Record<string, number> = {};

  readonly pending = signal(false);
  readonly streaming = signal('');
  readonly status = signal('');
  readonly error = signal('');
  readonly reviewing = signal(false);
  readonly reviewText = signal('');
  readonly reviewError = signal('');
  draft = '';
  web = true;
  private abort?: AbortController;

  readonly profileText = computed(() => {
    const p = this.store.profile();
    return p ? PROFILE_TEXT[p.label] : '';
  });

  readonly suggestions = [
    '¿Estoy bien diversificado?',
    '¿Cuánto debería invertir cada mes?',
    'Explícame mi cartera como si tuviera 12 años',
    '¿Qué hago con lo que tengo en pérdidas?',
    '¿Me conviene un fondo indexado o un ETF?',
    '¿Qué está pasando hoy en los mercados?',
  ];

  ngOnInit(): void {
    if (this.q()) this.draft = this.q();
    if (!this.portfolio.lastRefresh()) void this.portfolio.refresh();
    setTimeout(() => this.scrollDown());
  }

  startQuiz(): void {
    this.answers = {};
    this.qIndex.set(0);
    this.quizOpen.set(true);
  }

  answer(points: number): void {
    this.answers[this.quiz[this.qIndex()].id] = points;
    if (this.qIndex() < this.quiz.length - 1) this.qIndex.update((i) => i + 1);
    else {
      this.store.setProfile(scoreProfile(this.answers));
      this.quizOpen.set(false);
    }
  }

  private context(): string {
    return portfolioContext(this.portfolio.stats(), this.portfolio.totals(), this.store.profile(), this.store.settings().baseCurrency);
  }

  /** Instrucciones + cartera; si la IA no puede buscar en internet, se le pasan los datos de mercado de hoy. */
  private async system(withMarket: boolean): Promise<string> {
    let market = '';
    if (withMarket && !this.ai.canSearch()) {
      const symbols = this.store.assets().flatMap((a) => (a.symbol ? [a.symbol] : []));
      const briefing = await this.market.briefing(symbols).catch(() => '');
      market = briefing
        ? `\n\nNo puedes buscar en internet. Estos son datos reales de mercado de hoy; úsalos y no inventes otras cifras:\n<datos_de_mercado>\n${briefing}\n</datos_de_mercado>`
        : '\n\nNo puedes buscar en internet: si hablas de la actualidad, avisa de que tu información puede estar desactualizada.';
    }
    return `${ADVISOR_SYSTEM}${market}\n\n<cartera_del_usuario>\n${this.context()}\n</cartera_del_usuario>`;
  }

  onEnter(e: Event): void {
    const ke = e as KeyboardEvent;
    if (!ke.shiftKey) {
      e.preventDefault();
      void this.send(this.draft);
    }
  }

  async send(text: string): Promise<void> {
    text = text.trim();
    if (!text || this.pending()) return;
    this.error.set('');
    this.draft = '';
    this.store.addChat({ role: 'user', text, at: new Date().toISOString() });
    this.pending.set(true);
    this.streaming.set('');
    this.status.set('');
    this.scrollDown();
    this.abort = new AbortController();
    const history: AiTurn[] = this.store
      .chat()
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.text }));
    try {
      const res = await this.ai.ask({
        system: await this.system(this.web),
        messages: history,
        webSearch: this.web,
        maxSearches: 4,
        effort: 'medium',
        signal: this.abort.signal,
        onStatus: (s) => this.status.set(s),
        onText: (t) => {
          this.streaming.set(t);
          this.scrollDown();
        },
      });
      this.store.addChat({ role: 'assistant', text: res.text, sources: res.sources, at: new Date().toISOString() });
    } catch (e) {
      this.error.set(msg(e));
    } finally {
      this.pending.set(false);
      this.streaming.set('');
      this.scrollDown();
    }
  }

  stop(): void {
    this.abort?.abort();
  }

  clear(): void {
    if (confirm('¿Borrar la conversación?')) this.store.clearChat();
  }

  async review(): Promise<void> {
    this.reviewing.set(true);
    this.reviewError.set('');
    this.reviewText.set('');
    this.status.set('');
    try {
      const res = await this.ai.ask({
        system: await this.system(true),
        messages: [
          {
            role: 'user',
            content: `Analiza mi cartera completa${this.ai.canSearch() ? '. Busca en internet la situación actual de los valores que tengo si te ayuda' : ''}.
Estructura la respuesta con estos apartados (títulos con ###):
### En resumen (2-3 frases)
### Lo que está bien
### Lo que mejoraría
### Próximos pasos concretos (lista numerada, con importes o porcentajes orientativos)
### Nota de riesgo (1-10) y por qué`,
          },
        ],
        webSearch: true,
        maxSearches: 5,
        effort: 'high',
        onText: (t) => this.reviewText.set(t),
        onStatus: (s) => this.status.set(s),
      });
      this.store.setPortfolioReview(res.text);
    } catch (e) {
      this.reviewError.set(msg(e));
    } finally {
      this.reviewing.set(false);
    }
  }

  private scrollDown(): void {
    requestAnimationFrame(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
