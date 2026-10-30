import { describe, expect, it } from 'vitest';
import { extractRoutes, joinRoute, nameFromClass, routeParams } from '../../src/stacks/angular/routes.js';
import { makeRepo } from '../helpers/repos.js';

const component = (name: string, extra = "templateUrl: './x.component.html'") =>
  `import { Component } from '@angular/core';\n@Component({ selector: 'x', ${extra} })\nexport class ${name} {}\n`;

describe('extractRoutes: standalone apps', () => {
  it('follows provideRouter, imported routes, children, loadComponent and loadChildren', async () => {
    const repo = await makeRepo({
      'src/main.ts': "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nbootstrapApplication(App, appConfig);",
      'src/app/app.config.ts': "import { provideRouter } from '@angular/router';\nimport { routes } from './app.routes';\nexport const appConfig = { providers: [provideRouter(routes)] };",
      'src/app/app.routes.ts': `import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { ShellComponent } from './shell/shell.component';
export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Start' },
  { path: 'settings', component: ShellComponent, children: [
    { path: '', loadComponent: () => import('./settings/general.component').then(m => m.GeneralSettingsComponent) },
    { path: 'profile/:userId', loadComponent: () => import('./settings/profile.component') },
  ] },
  { path: 'reports', loadChildren: () => import('./reports/reports.routes').then(m => m.REPORT_ROUTES) },
  { path: 'help', loadChildren: () => import('./help/help.routes') },
  { path: 'old', redirectTo: 'reports' },
  { path: '**', redirectTo: '' },
];`,
      'src/app/home/home.component.ts': component('HomeComponent', "templateUrl: './home.component.html', styleUrl: './home.component.scss'"),
      'src/app/shell/shell.component.ts': component('ShellComponent', "template: '<router-outlet />'"),
      'src/app/settings/general.component.ts': component('GeneralSettingsComponent', "templateUrl: './general.component.html', styleUrls: ['./general.component.css', './shared.css']"),
      'src/app/settings/profile.component.ts': `import { Component } from '@angular/core';\n@Component({ selector: 'p', template: '<p>x</p>' })\nexport default class ProfilePageComponent {}`,
      'src/app/reports/reports.routes.ts': `import { Routes } from '@angular/router';
import { ReportListComponent } from './report-list.component';
export const REPORT_ROUTES: Routes = [{ path: '', component: ReportListComponent }, { path: ':reportId/edit', component: ReportListComponent }];`,
      'src/app/reports/report-list.component.ts': component('ReportListComponent'),
      'src/app/help/help.routes.ts': `import { HelpComponent } from './help.component';
export default [{ path: '', component: HelpComponent, data: { title: 'Help center' } }] satisfies Routes;`,
      'src/app/help/help.component.ts': component('HelpComponent'),
    });

    const result = await extractRoutes(repo, 'src');
    const byRoute = Object.fromEntries(result.pages.map((page) => [page.route, page]));

    expect(Object.keys(byRoute).sort()).toEqual(['/', '/help', '/reports', '/reports/:reportId/edit', '/settings', '/settings/profile/:userId']);
    expect(byRoute['/']).toMatchObject({
      id: 'home',
      name: 'Start',
      componentClass: 'HomeComponent',
      componentFile: 'src/app/home/home.component.ts',
      templateFile: 'src/app/home/home.component.html',
      styleFiles: ['src/app/home/home.component.scss'],
      lazy: false,
    });
    // The empty-path child wins over its layout parent at the same URL.
    expect(byRoute['/settings']).toMatchObject({
      name: 'General settings',
      componentFile: 'src/app/settings/general.component.ts',
      styleFiles: ['src/app/settings/general.component.css', 'src/app/settings/shared.css'],
      lazy: true,
    });
    expect(byRoute['/settings/profile/:userId']).toMatchObject({
      componentClass: 'ProfilePageComponent',
      templateFile: 'src/app/settings/profile.component.ts',
      params: ['userId'],
    });
    expect(byRoute['/reports/:reportId/edit']?.params).toEqual(['reportId']);
    expect(byRoute['/help']?.name).toBe('Help center');
    expect(result.routeFiles).toContain('src/app/app.routes.ts');
    expect(result.warnings).toEqual([]);
  });

  it('resolves tsconfig path aliases and barrel re-exports', async () => {
    const repo = await makeRepo({
      'tsconfig.json': '{ // comment\n "compilerOptions": { "baseUrl": "./", "paths": { "@app/*": ["src/app/*"] } }, }',
      'src/app/app.config.ts': "import { provideRouter } from '@angular/router';\nimport { routes } from '@app/app.routes';\nexport const c = provideRouter(routes);",
      'src/app/app.routes.ts': "import { DashboardComponent } from '@app/features';\nexport const routes = [{ path: 'dashboard', component: DashboardComponent }];",
      'src/app/features/index.ts': "export * from './dashboard/dashboard.component';",
      'src/app/features/dashboard/dashboard.component.ts': component('DashboardComponent'),
    });
    const result = await extractRoutes(repo, 'src');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({ route: '/dashboard', componentFile: 'src/app/features/dashboard/dashboard.component.ts', name: 'Dashboard' });
  });

  it('handles spreads and routes declared in the same call', async () => {
    const repo = await makeRepo({
      'src/main.ts': `import { provideRouter, withHashLocation } from '@angular/router';
import { A } from './a.component';
const extra = [{ path: 'b', component: A }];
bootstrapApplication(X, { providers: [provideRouter([{ path: 'a', component: A }, ...extra], withHashLocation())] });`,
      'src/a.component.ts': component('A'),
    });
    const result = await extractRoutes(repo, 'src');
    expect(result.pages.map((page) => page.route)).toEqual(['/a', '/b']);
    expect(result.hashRouting).toBe(true);
  });

  it('warns about routes built by a function call', async () => {
    const repo = await makeRepo({
      'src/app.config.ts': "import { provideRouter } from '@angular/router';\nexport const c = provideRouter(buildRoutes());",
    });
    const result = await extractRoutes(repo, 'src');
    expect(result.pages).toEqual([]);
    expect(result.warnings[0]).toMatch(/built by a function call/);
  });
});

describe('extractRoutes: NgModule apps', () => {
  it('follows forRoot, lazy modules with routing modules, and eager feature modules', async () => {
    const repo = await makeRepo({
      'src/app/app-routing.module.ts': `import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) },
  { path: 'legacy', loadChildren: './legacy/legacy.module#LegacyModule' },
  { path: 'reports', loadChildren: 'app/reports/reports.module#ReportsModule' },
];
@NgModule({ imports: [RouterModule.forRoot(routes, { useHash: true })], exports: [RouterModule] })
export class AppRoutingModule {}`,
      'src/app/home/home.component.ts': component('HomeComponent'),
      'src/app/admin/admin.module.ts': "import { AdminRoutingModule } from './admin-routing.module';\n@NgModule({ imports: [AdminRoutingModule] })\nexport class AdminModule {}",
      'src/app/admin/admin-routing.module.ts': `import { UsersComponent } from './users.component';
const routes: Routes = [{ path: '', redirectTo: 'users', pathMatch: 'full' }, { path: 'users', component: UsersComponent }, { path: 'users/:id', component: UsersComponent }];
@NgModule({ imports: [RouterModule.forChild(routes)] })
export class AdminRoutingModule {}`,
      'src/app/admin/users.component.ts': component('UsersComponent'),
      'src/app/legacy/legacy.module.ts': `import { LegacyPageComponent } from './legacy-page.component';
@NgModule({ imports: [RouterModule.forChild([{ path: '', component: LegacyPageComponent }])] })
export class LegacyModule {}`,
      'src/app/legacy/legacy-page.component.ts': component('LegacyPageComponent'),
      'src/app/reports/reports.module.ts': `import { ReportsComponent } from './reports.component';
@NgModule({ imports: [RouterModule.forChild([{ path: 'monthly', component: ReportsComponent }])] })
export class ReportsModule {}`,
      'src/app/reports/reports.component.ts': component('ReportsComponent'),
      'src/app/contact/contact-routing.module.ts': `import { ContactComponent } from './contact.component';
@NgModule({ imports: [RouterModule.forChild([{ path: 'contact', component: ContactComponent }])] })
export class ContactRoutingModule {}`,
      'src/app/contact/contact.component.ts': component('ContactComponent'),
    });

    const result = await extractRoutes(repo, 'src');
    expect(result.pages.map((page) => page.route).sort()).toEqual([
      '/',
      '/admin/users',
      '/admin/users/:id',
      '/contact',
      '/legacy',
      '/reports/monthly',
    ]);
    expect(result.pages.find((page) => page.route === '/legacy')?.name).toBe('Legacy page');
    expect(result.hashRouting).toBe(true);
    expect(result.routeFiles).toEqual(
      expect.arrayContaining(['src/app/app-routing.module.ts', 'src/app/admin/admin-routing.module.ts', 'src/app/legacy/legacy.module.ts']),
    );
  });

  it('gives every page a unique id', async () => {
    const repo = await makeRepo({
      'src/app/r.ts': "import { A } from './a';\nRouterModule.forRoot([{ path: 'a-b', component: A }, { path: 'a/b', component: A }]);",
      'src/app/a.ts': component('A'),
    });
    const result = await extractRoutes(repo, 'src');
    expect(result.pages.map((page) => page.id).sort()).toEqual(['a-b', 'a-b-2']);
  });
});

describe('route helpers', () => {
  it('joins routes', () => {
    expect(joinRoute('', '')).toBe('/');
    expect(joinRoute('', 'requests')).toBe('/requests');
    expect(joinRoute('/admin', '')).toBe('/admin');
    expect(joinRoute('/admin/', '/users/')).toBe('/admin/users');
  });

  it('reads parameters', () => {
    expect(routeParams('/requests/:id/items/:itemId?')).toEqual(['id', 'itemId']);
  });

  it('names pages after their component class', () => {
    expect(nameFromClass('RequestListComponent')).toBe('Request list');
    expect(nameFromClass('HTMLEditorPage')).toBe('HTML editor');
    expect(nameFromClass('Component')).toBeNull();
  });
});
