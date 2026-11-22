import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon, Logo } from '../shared/icon';

interface NavItem {
  path: string;
  label: string;
  short: string;
  icon: string;
  mobile: boolean;
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

    <header class="topbar">
      <a routerLink="/resumen" class="brand"><app-logo [size]="24" /></a>
      <button class="icon-btn" aria-label="Más opciones" (click)="more.set(!more())"><app-icon name="menu" /></button>
    </header>

    @if (more()) {
      <div class="more-backdrop" (click)="more.set(false)">
        <div class="more" (click)="$event.stopPropagation()">
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="on" (click)="more.set(false)"><app-icon [name]="item.icon" [size]="18" />{{ item.label }}</a>
          }
          <button class="logout" (click)="logout()"><app-icon name="logout" [size]="18" />Cerrar sesión ({{ auth.user()?.displayName }})</button>
        </div>
      </div>
    }

    <main>
      <router-outlet />
    </main>

    <nav class="bottom" aria-label="Navegación principal">
      @for (item of mobileNav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="on"><app-icon [name]="item.icon" [size]="20" /><span>{{ item.short }}</span></a>
      }
    </nav>
  `,
  styles: `
    :host { display: grid; grid-template-columns: 232px 1fr; min-height: 100dvh; }
    .sidebar { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; gap: 24px; padding: 22px 12px; background: var(--surface); border-right: 1px solid var(--border); }
    .brand { text-decoration: none; padding: 0 10px; display: inline-flex; }
    .sidebar nav { display: grid; gap: 1px; }
    .sidebar nav a { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 6px; color: var(--text-2); text-decoration: none; font-weight: 500; font-size: 14px; }
    .sidebar nav a:hover { background: var(--surface-2); color: var(--text); }
    .sidebar nav a.on { background: var(--surface-2); color: var(--text); font-weight: 600; box-shadow: inset 2px 0 0 var(--text); }
    .me { margin-top: auto; display: flex; gap: 10px; align-items: center; padding: 14px 10px 0; border-top: 1px solid var(--border); }
    .avatar { width: 32px; height: 32px; border-radius: 6px; background: var(--chip); color: var(--text); display: grid; place-items: center; font-weight: 700; font-size: 14px; }
    .who { display: grid; font-size: 14px; }
    .link { background: none; border: 0; padding: 0; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
    .link:hover { color: var(--text); }
    .topbar, .bottom { display: none; }
    main { min-width: 0; }

    @media (max-width: 900px) {
      :host { grid-template-columns: 1fr; padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom)); }
      .sidebar { display: none; }
      .topbar { display: flex; position: sticky; top: 0; z-index: 40; justify-content: space-between; align-items: center; padding: 10px 12px 10px 6px; padding-top: calc(10px + env(safe-area-inset-top)); background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
      .icon-btn { background: none; border: 0; color: var(--text); padding: 8px; cursor: pointer; display: grid; }
      .bottom { display: grid; grid-template-columns: repeat(5, 1fr); position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; height: calc(var(--nav-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); background: var(--surface); border-top: 1px solid var(--border); }
      .bottom a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 11px; font-weight: 500; color: var(--muted); text-decoration: none; }
      .bottom a.on { color: var(--text); font-weight: 600; }
      .more-backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.35); }
      .more { position: absolute; top: calc(56px + env(safe-area-inset-top)); right: 10px; left: 10px; background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); padding: 6px; display: grid; gap: 1px; box-shadow: var(--shadow); }
      .more a, .more .logout { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 6px; color: var(--text); text-decoration: none; font-weight: 500; background: none; border: 0; font: inherit; cursor: pointer; text-align: left; }
      .more a.on { background: var(--surface-2); font-weight: 600; }
      .more .logout { color: var(--loss); border-top: 1px solid var(--border); border-radius: 0; margin-top: 4px; }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly more = signal(false);

  readonly nav: NavItem[] = [
    { path: '/resumen', label: 'Mi cartera', short: 'Cartera', icon: 'wallet', mobile: true },
    { path: '/analizar', label: 'Analizar acción', short: 'Analizar', icon: 'search', mobile: true },
    { path: '/oportunidades', label: 'Oportunidades', short: 'Ideas', icon: 'target', mobile: true },
    { path: '/asesor', label: 'Asesor', short: 'Asesor', icon: 'chat', mobile: true },
    { path: '/renta', label: 'Declaración de la renta', short: 'Renta', icon: 'file', mobile: false },
    { path: '/importar', label: 'Importar del bróker', short: 'Importar', icon: 'upload', mobile: false },
    { path: '/aprende', label: 'Aprende', short: 'Aprende', icon: 'book', mobile: false },
    { path: '/ajustes', label: 'Ajustes', short: 'Ajustes', icon: 'settings', mobile: true },
  ];
  readonly mobileNav = this.nav.filter((n) => n.mobile);

  initial(): string {
    return (this.auth.user()?.displayName ?? '?').charAt(0).toUpperCase();
  }

  logout(): void {
    this.more.set(false);
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
