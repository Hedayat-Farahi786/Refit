import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'apps' },
  { path: 'apps', loadComponent: () => import('./features/apps/apps-home').then((m) => m.AppsHome), title: 'Apps · Refit' },
  {
    path: 'apps/:appId',
    loadComponent: () => import('./features/apps/app-detail').then((m) => m.AppDetail),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', loadComponent: () => import('./features/apps/overview/overview').then((m) => m.Overview), title: 'Overview · Refit' },
      { path: 'review', loadComponent: () => import('./features/apps/review/review').then((m) => m.Review), title: 'Agent review · Refit' },
      { path: 'modernize', loadComponent: () => import('./features/apps/modernize/modernize').then((m) => m.Modernize), title: 'Modernize · Refit' },
      { path: 'history', loadComponent: () => import('./features/apps/history/history').then((m) => m.History), title: 'History · Refit' },
      { path: 'runs/:runId', loadComponent: () => import('./features/run/run-page').then((m) => m.RunPage), title: 'Run · Refit' },
    ],
  },
  { path: 'brands', loadComponent: () => import('./features/brands/brands-page').then((m) => m.BrandsPage), title: 'Brands · Refit' },
  { path: 'brands/:brandId', loadComponent: () => import('./features/brands/brand-editor').then((m) => m.BrandEditor), title: 'Brand · Refit' },
  // Shown inside the Brand studio's iframe, without Refit's shell.
  { path: 'preview/brand', loadComponent: () => import('./features/brands/brand-preview').then((m) => m.BrandPreview), title: 'Brand preview' },
  { path: 'settings', loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage), title: 'Settings · Refit' },
  { path: '**', redirectTo: 'apps' },
];
