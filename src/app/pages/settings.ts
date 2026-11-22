import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MarketDataService } from '../core/market-data.service';
import { AiModel, Settings, today } from '../core/models';
import { PortfolioService, msg } from '../core/portfolio.service';
import { StoreService } from '../core/store.service';
import { Icon } from '../shared/icon';
import { Notice } from '../shared/ui';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon, Notice],
  template: `
    <div class="page narrow">
      <header class="page-header"><div><h1>Ajustes</h1><p>Claves de servicios, apariencia y copias de seguridad.</p></div></header>

      <section class="card stack">
        <h2>Claves de servicios</h2>
        <app-notice level="info">
          Las claves se guardan solo en este navegador, dentro de tu usuario. Gemini, Twelve Data y Finnhub tienen plan gratuito;
          Claude es de pago por uso.
        </app-notice>

        <div class="field">IA para el Asesor, Oportunidades y Grandes inversores
          <div class="segmented">
            <button type="button" [class.on]="form.aiProvider === 'gemini'" (click)="form.aiProvider = 'gemini'">Gemini (gratis)</button>
            <button type="button" [class.on]="form.aiProvider === 'claude'" (click)="form.aiProvider = 'claude'">Claude (de pago)</button>
          </div>
        </div>

        @if (form.aiProvider === 'gemini') {
          <label class="field">Clave de Gemini
            <small>Gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → Create API key.</small>
            <input [type]="show() ? 'text' : 'password'" [(ngModel)]="form.geminiKey" placeholder="AIza..." autocomplete="off" />
          </label>
          <label class="field">Modelo de Gemini
            <small>Puedes escribir otro nombre de modelo si Google saca uno nuevo.</small>
            <input [(ngModel)]="form.geminiModel" list="gemini-models" autocomplete="off" />
            <datalist id="gemini-models">
              @for (m of geminiModels; track m.id) { <option [value]="m.id">{{ m.label }}</option> }
            </datalist>
          </label>
          <label class="check"><input type="checkbox" [(ngModel)]="form.geminiSearch" /> Permitir que Gemini busque en Google</label>
          <p class="small muted" style="margin-top: -6px">
            La búsqueda en Google <strong>no entra en el plan gratuito</strong> de Gemini (necesita facturación activada en Google AI Studio).
            Si la dejas desactivada, la app le pasa a la IA los precios y titulares del día desde Finnhub.
          </p>
        } @else {
          <label class="field">Clave de Anthropic
            <small>En <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> → API Keys (necesita saldo).</small>
            <input [type]="show() ? 'text' : 'password'" [(ngModel)]="form.anthropicKey" placeholder="sk-ant-..." autocomplete="off" />
          </label>
          <label class="field">Modelo de Claude
            <select [(ngModel)]="form.model">
              @for (m of models; track m.id) { <option [value]="m.id">{{ m.label }}</option> }
            </select>
          </label>
        }
        <label class="field">Twelve Data — histórico de precios y gráficas
          <small>Gratis en <a href="https://twelvedata.com/register" target="_blank" rel="noopener">twelvedata.com</a> (800 consultas/día).</small>
          <input [type]="show() ? 'text' : 'password'" [(ngModel)]="form.twelveDataKey" autocomplete="off" />
        </label>
        <label class="field">Finnhub — precio en tiempo real, analistas, salud de la empresa y noticias
          <small>Gratis en <a href="https://finnhub.io/register" target="_blank" rel="noopener">finnhub.io</a>.</small>
          <input [type]="show() ? 'text' : 'password'" [(ngModel)]="form.finnhubKey" autocomplete="off" />
        </label>
        <label class="field">Alpha Vantage — precio objetivo de los analistas (sección Analizar)
          <small>Gratis en <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener">alphavantage.co</a> (25 consultas al día; cada acción se guarda 24 h).</small>
          <input [type]="show() ? 'text' : 'password'" [(ngModel)]="form.alphaVantageKey" autocomplete="off" />
        </label>
        <label class="field">Financial Modeling Prep — rango de precios objetivo (mínimo, máximo, media) y objetivo de cada analista
          <small>Gratis en <a href="https://site.financialmodelingprep.com/register" target="_blank" rel="noopener">financialmodelingprep.com</a> (250 consultas al día). Opcional.</small>
          <input [type]="show() ? 'text' : 'password'" [(ngModel)]="form.fmpKey" autocomplete="off" />
        </label>
        <label class="check"><input type="checkbox" [checked]="show()" (change)="show.set(!show())" /> Mostrar claves</label>

        <div class="form-grid">
          <label class="field">Moneda principal
            <select [(ngModel)]="form.baseCurrency">
              <option value="EUR">Euro (EUR)</option>
              <option value="USD">Dólar (USD)</option>
              <option value="GBP">Libra (GBP)</option>
              <option value="MXN">Peso mexicano (MXN)</option>
            </select>
          </label>
          <label class="field">Tema
            <select [(ngModel)]="form.theme">
              <option value="system">Automático</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
        </div>
        <div class="row">
          @if (saved()) { <span class="small up">✓ Guardado</span> }
          <span class="spacer"></span>
          <button class="btn primary" (click)="save()">Guardar ajustes</button>
        </div>
      </section>

      <section class="card stack">
        <h2>Copia de seguridad</h2>
        <p class="text-2 small">Tus datos viven solo en este navegador. Descarga una copia para no perderlos o para pasarlos al móvil / a otro ordenador (allí: crea tu usuario e importa el archivo).</p>
        <label class="check"><input type="checkbox" [(ngModel)]="includeKeys" /> Incluir mis claves de API en la copia</label>
        <div class="row">
          <button class="btn" (click)="exportData()"><app-icon name="download" [size]="18" />Descargar copia</button>
          <label class="btn"><app-icon name="upload" [size]="18" />Importar copia<input type="file" accept="application/json,.json" hidden (change)="importData($event)" /></label>
          <button class="btn" (click)="clearCache()">Vaciar caché de precios</button>
        </div>
        @if (ioMsg()) { <p class="small">{{ ioMsg() }}</p> }
      </section>

      <section class="card stack">
        <h2>Cuenta</h2>
        <form class="form-grid" (ngSubmit)="changePassword()">
          <label class="field">Contraseña actual <input type="password" name="cur" [(ngModel)]="pwCurrent" autocomplete="current-password" /></label>
          <label class="field">Nueva contraseña <input type="password" name="next" [(ngModel)]="pwNext" autocomplete="new-password" /></label>
          <div class="field" style="align-self: end"><button class="btn" type="submit">Cambiar contraseña</button></div>
        </form>
        @if (pwMsg()) { <p class="small">{{ pwMsg() }}</p> }
        <div class="row">
          <button class="btn" (click)="logout()"><app-icon name="logout" [size]="18" />Cerrar sesión</button>
          <span class="spacer"></span>
          <button class="btn danger" (click)="deleteAccount()"><app-icon name="trash" [size]="18" />Borrar mi cuenta y datos</button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .narrow { max-width: 820px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--text-2); }
    .check input { width: auto; min-height: 0; }
  `,
})
export class SettingsPage {
  private readonly store = inject(StoreService);
  private readonly auth = inject(AuthService);
  private readonly market = inject(MarketDataService);
  private readonly portfolio = inject(PortfolioService);
  private readonly router = inject(Router);

  readonly models: { id: AiModel; label: string }[] = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — el más listo (recomendado)' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — rápido y más barato' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — muy rápido y muy barato' },
  ];
  readonly geminiModels = [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — recomendado, gratis' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — más rápido, gratis' },
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen — el más nuevo' },
  ];
  form: Settings = { ...this.store.settings() };
  readonly show = signal(false);
  readonly saved = signal(false);
  readonly ioMsg = signal('');
  readonly pwMsg = signal('');
  includeKeys = false;
  pwCurrent = '';
  pwNext = '';

  save(): void {
    const trimmed = {
      ...this.form,
      geminiKey: this.form.geminiKey.trim(),
      geminiModel: this.form.geminiModel.trim() || 'gemini-3.8-flash',
      anthropicKey: this.form.anthropicKey.trim(),
      finnhubKey: this.form.finnhubKey.trim(),
      twelveDataKey: this.form.twelveDataKey.trim(),
      alphaVantageKey: (this.form.alphaVantageKey ?? '').trim(),
      fmpKey: (this.form.fmpKey ?? '').trim(),
    };
    const currencyChanged = trimmed.baseCurrency !== this.store.settings().baseCurrency;
    this.store.updateSettings(trimmed);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
    if (currencyChanged || trimmed.finnhubKey || trimmed.twelveDataKey) void this.portfolio.refresh();
  }

  exportData(): void {
    const blob = new Blob([this.store.exportJson(this.includeKeys)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inversiones-${this.auth.user()?.username}-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async importData(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Importar reemplazará tus datos actuales en este navegador. ¿Continuar?')) return;
    try {
      this.store.importJson(await file.text());
      this.form = { ...this.store.settings() };
      this.ioMsg.set('✓ Copia importada correctamente.');
      void this.portfolio.refresh();
    } catch (err) {
      this.ioMsg.set('No se pudo importar: ' + msg(err));
    }
  }

  clearCache(): void {
    this.market.clearCache();
    this.ioMsg.set('✓ Caché vaciada. Los precios se volverán a descargar.');
  }

  async changePassword(): Promise<void> {
    try {
      await this.auth.changePassword(this.pwCurrent, this.pwNext);
      this.pwMsg.set('✓ Contraseña cambiada.');
      this.pwCurrent = this.pwNext = '';
    } catch (e) {
      this.pwMsg.set(msg(e));
    }
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  deleteAccount(): void {
    if (confirm('Se borrarán tu usuario y TODOS tus datos de este navegador. ¿Seguro?') && confirm('Última confirmación: esto no se puede deshacer.')) {
      this.auth.deleteAccount();
      void this.router.navigate(['/login']);
    }
  }
}
