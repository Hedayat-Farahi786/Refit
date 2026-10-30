import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'apps' },
  {
    path: 'apps',
    loadComponent: () => import('./features/apps/apps-layout').then((m) => m.AppsLayout),
    children: [
      { path: '', loadComponent: () => import('./features/apps/apps-home').then((m) => m.AppsHome), title: 'Apps · Refit' },
      {
        path: ':appId',
        loadComponent: () => import('./features/apps/app-detail').then((m) => m.AppDetail),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          { path: 'overview', loadComponent: () => import('./features/apps/overview/overview').then((m) => m.Overview), title: 'Overview · Refit' },
        ],
      },
    ],
  },
  { path: 'settings', loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage), title: 'Settings · Refit' },
  { path: '**', redirectTo: 'apps' },
];
