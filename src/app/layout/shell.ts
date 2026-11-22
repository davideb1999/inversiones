import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Icon, Logo } from '../shared/icon';

interface NavItem {
  path: string;
  label: string;
  short: string;
  icon: string;
  /** Va en la barra inferior del móvil; el resto, en "Más". */
  bar: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo],
  template: `
    <aside class="sidebar">
      <a routerLink="/resumen" class="brand"><app-logo /></a>
      <nav>
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="on"><app-icon [name]="item.icon" [size]="18" />{{ item.label }}</a>
        }
      </nav>
      <div class="me">
        <div class="avatar">{{ initial() }}</div>
        <div class="who">
          <strong>{{ auth.user()?.displayName }}</strong>
          <button class="link" (click)="logout()">Cerrar sesión</button>
        </div>
      </div>
    </aside>

    <main>
      <router-outlet />
    </main>

    <!-- Móvil: todo el menú abajo, al alcance del pulgar -->
    <nav class="bottom" aria-label="Navegación principal">
      @for (item of barNav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="on" (click)="more.set(false)"><app-icon [name]="item.icon" [size]="22" /><span>{{ item.short }}</span></a>
      }
      <button type="button" [class.on]="more() || inMore()" (click)="more.set(!more())" [attr.aria-expanded]="more()">
        <app-icon name="menu" [size]="22" /><span>Más</span>
      </button>
    </nav>

    @if (more()) {
      <div class="sheet-backdrop" (click)="more.set(false)">
        <div class="sheet" role="dialog" aria-label="Más opciones" (click)="$event.stopPropagation()">
          <div class="grabber"></div>
          <div class="sheet-user">
            <div class="avatar">{{ initial() }}</div>
            <strong>{{ auth.user()?.displayName }}</strong>
          </div>
          @for (item of moreNav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="on" (click)="more.set(false)"><app-icon [name]="item.icon" [size]="20" />{{ item.label }}<app-icon class="chev" name="back" [size]="16" /></a>
          }
          <button class="logout" (click)="logout()"><app-icon name="logout" [size]="20" />Cerrar sesión</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100dvh; }
    .sidebar { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; gap: 24px; padding: 22px 12px; background: var(--surface); border-right: 1px solid var(--border); }
    .brand { text-decoration: none; padding: 0 10px; display: inline-flex; }
    .sidebar nav { display: grid; gap: 1px; }
    .sidebar nav a { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 6px; color: var(--text-2); text-decoration: none; font-weight: 500; font-size: 14px; }
    .sidebar nav a:hover { background: var(--surface-2); color: var(--text); }
    .sidebar nav a.on { background: var(--surface-2); color: var(--text); font-weight: 600; box-shadow: inset 2px 0 0 var(--text); }
    .me { margin-top: auto; display: flex; gap: 10px; align-items: center; padding: 14px 10px 0; border-top: 1px solid var(--border); }
    .avatar { width: 32px; height: 32px; border-radius: 6px; background: var(--chip); color: var(--text); display: grid; place-items: center; font-weight: 700; font-size: 14px; flex: none; }
    .who { display: grid; font-size: 14px; }
    .link { background: none; border: 0; padding: 0; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
    .link:hover { color: var(--text); }
    .bottom { display: none; }
    main { min-width: 0; }

    @media (max-width: 900px) {
      :host { grid-template-columns: minmax(0, 1fr); padding-top: env(safe-area-inset-top); padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom)); }
      .sidebar { display: none; }
      .bottom { display: grid; grid-template-columns: repeat(5, 1fr); position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; height: calc(var(--nav-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(14px); border-top: 1px solid var(--border); }
      .bottom a, .bottom button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font: inherit; font-size: 11px; font-weight: 500; color: var(--muted); text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .bottom a.on, .bottom button.on { color: var(--text); font-weight: 600; }
      .sheet-backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.35); display: flex; align-items: flex-end; animation: fade .15s ease-out; }
      .sheet { width: 100%; background: var(--surface); border-radius: 14px 14px 0 0; padding: 8px 12px calc(var(--nav-h) + env(safe-area-inset-bottom) + 8px); display: grid; gap: 2px; box-shadow: var(--shadow); animation: up .18s ease-out; }
      .grabber { width: 36px; height: 4px; border-radius: 2px; background: var(--grid); justify-self: center; margin: 2px 0 8px; }
      .sheet-user { display: flex; align-items: center; gap: 10px; padding: 4px 8px 12px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
      .sheet a, .sheet .logout { display: flex; gap: 14px; align-items: center; padding: 14px 8px; border-radius: 8px; color: var(--text); text-decoration: none; font: inherit; font-weight: 500; font-size: 16px; background: none; border: 0; cursor: pointer; text-align: left; }
      .sheet a.on { background: var(--surface-2); font-weight: 600; }
      .chev { margin-left: auto; transform: rotate(180deg); color: var(--muted); }
      .sheet .logout { color: var(--loss); border-top: 1px solid var(--border); border-radius: 0; margin-top: 4px; }
    }
    @keyframes up { from { transform: translateY(24px); opacity: .6; } }
    @keyframes fade { from { opacity: 0; } }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly more = signal(false);

  readonly nav: NavItem[] = [
    { path: '/resumen', label: 'Mi cartera', short: 'Cartera', icon: 'wallet', bar: true },
    { path: '/analizar', label: 'Analizar acción', short: 'Analizar', icon: 'search', bar: true },
    { path: '/oportunidades', label: 'Oportunidades', short: 'Ideas', icon: 'target', bar: true },
    { path: '/asesor', label: 'Asesor', short: 'Asesor', icon: 'chat', bar: true },
    { path: '/renta', label: 'Declaración de la renta', short: 'Renta', icon: 'file', bar: false },
    { path: '/importar', label: 'Importar del bróker', short: 'Importar', icon: 'upload', bar: false },
    { path: '/aprende', label: 'Aprende', short: 'Aprende', icon: 'book', bar: false },
    { path: '/ajustes', label: 'Ajustes', short: 'Ajustes', icon: 'settings', bar: false },
  ];
  readonly barNav = this.nav.filter((n) => n.bar);
  readonly moreNav = this.nav.filter((n) => !n.bar);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** "Más" se marca cuando estás en una de sus páginas. */
  readonly inMore = computed(() => this.moreNav.some((n) => this.url().startsWith(n.path)));

  initial(): string {
    return (this.auth.user()?.displayName ?? '?').charAt(0).toUpperCase();
  }

  logout(): void {
    this.more.set(false);
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
