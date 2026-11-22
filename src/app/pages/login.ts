import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { msg } from '../core/portfolio.service';
import { Logo } from '../shared/icon';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Logo],
  template: `
    <div class="wrap">
      <section class="intro">
        <app-logo [size]="40" [text]="false" />
        <h1>Cartera</h1>
        <p>Controla cuánto has invertido, cómo va cada inversión y recibe consejos de un asesor con IA, explicado sin tecnicismos.</p>
        <ul>
          <li>Gráficas por día, mes, año o las fechas que quieras</li>
          <li>Un asesor con IA que conoce tu cartera</li>
          <li>Oportunidades con registro de aciertos</li>
          <li>Qué compran los grandes inversores</li>
        </ul>
      </section>

      <form class="card" (ngSubmit)="submit()">
        <div class="segmented" role="tablist">
          <button type="button" role="tab" [class.on]="mode() === 'login'" (click)="mode.set('login')">Entrar</button>
          <button type="button" role="tab" [class.on]="mode() === 'register'" (click)="mode.set('register')">Crear cuenta</button>
        </div>

        <label class="field">Usuario
          <input name="username" autocomplete="username" [(ngModel)]="username" required autocapitalize="none" />
        </label>
        @if (mode() === 'register') {
          <label class="field">Tu nombre <small>(cómo quieres que te llame)</small>
            <input name="displayName" autocomplete="name" [(ngModel)]="displayName" />
          </label>
        }
        <label class="field">Contraseña
          <input name="password" type="password" [autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'" [(ngModel)]="password" required />
        </label>
        @if (mode() === 'register') {
          <label class="field">Repite la contraseña
            <input name="password2" type="password" autocomplete="new-password" [(ngModel)]="password2" required />
          </label>
        } @else {
          <label class="check"><input type="checkbox" name="remember" [(ngModel)]="remember" /> Mantener la sesión abierta</label>
        }

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="btn primary" type="submit" [disabled]="busy()">
          @if (busy()) { <span class="spinner"></span> }
          {{ mode() === 'login' ? 'Entrar' : 'Crear cuenta' }}
        </button>

        <p class="disclaimer">
          Tus datos se guardan solo en este navegador; no se envían a ningún servidor. Para pasarlos a otro dispositivo usa
          <em>Ajustes → Copia de seguridad</em>.
        </p>
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: grid; grid-template-columns: 1fr 420px; gap: 48px; align-items: center; max-width: 1000px; margin: 0 auto; padding: 32px 24px; }
    .intro app-logo { color: var(--text); }
    .intro h1 { font-size: 36px; margin: 8px 0 12px; }
    .intro p { color: var(--text-2); font-size: 17px; max-width: 460px; }
    .intro ul { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 10px; color: var(--text-2); }
    form { display: grid; gap: 16px; padding: 24px; box-shadow: var(--shadow); }
    .check { display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--text-2); }
    .check input { width: auto; min-height: 0; }
    @media (max-width: 800px) {
      .wrap { grid-template-columns: 1fr; gap: 24px; padding: 24px 16px; align-content: start; }
      .intro h1 { font-size: 28px; }
      .intro ul { display: none; }
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>(this.auth.hasAnyUser() ? 'login' : 'register');
  readonly error = signal('');
  readonly busy = signal(false);
  username = '';
  displayName = '';
  password = '';
  password2 = '';
  remember = true;

  async submit(): Promise<void> {
    this.error.set('');
    if (this.mode() === 'register' && this.password !== this.password2) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.busy.set(true);
    try {
      if (this.mode() === 'login') await this.auth.login(this.username, this.password, this.remember);
      else await this.auth.register(this.username, this.displayName, this.password);
      await this.router.navigate(['/resumen']);
    } catch (e) {
      this.error.set(msg(e));
    } finally {
      this.busy.set(false);
    }
  }
}
