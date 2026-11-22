import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth.service';

const authGuard: CanActivateFn = () =>
  inject(AuthService).isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);

const guestGuard: CanActivateFn = () =>
  inject(AuthService).isLoggedIn() ? inject(Router).createUrlTree(['/resumen']) : true;

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      { path: 'resumen', title: 'Resumen', loadComponent: () => import('./pages/dashboard').then((m) => m.DashboardPage) },
      { path: 'importar', title: 'Importar', loadComponent: () => import('./pages/import').then((m) => m.ImportPage) },
      { path: 'nuevo', title: 'Nueva inversión', loadComponent: () => import('./pages/asset-new').then((m) => m.AssetNewPage) },
      { path: 'activo/:id', title: 'Inversión', loadComponent: () => import('./pages/asset-detail').then((m) => m.AssetDetailPage) },
      { path: 'mercado/:symbol', title: 'Valor', loadComponent: () => import('./pages/market-symbol').then((m) => m.MarketSymbolPage) },
      { path: 'analizar', title: 'Analizar', loadComponent: () => import('./pages/analyze').then((m) => m.AnalyzePage) },
      { path: 'asesor', title: 'Asesor', loadComponent: () => import('./pages/advisor').then((m) => m.AdvisorPage) },
      { path: 'oportunidades', title: 'Oportunidades', loadComponent: () => import('./pages/opportunities').then((m) => m.OpportunitiesPage) },
      { path: 'grandes-inversores', redirectTo: '/oportunidades?seccion=inversores' },
      { path: 'renta', title: 'Renta', loadComponent: () => import('./pages/tax-return').then((m) => m.TaxReturnPage) },
      { path: 'aprende', title: 'Aprende', loadComponent: () => import('./pages/learn').then((m) => m.LearnPage) },
      { path: 'ajustes', title: 'Ajustes', loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
