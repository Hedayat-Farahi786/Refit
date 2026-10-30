import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { ReportsComponent } from './pages/reports.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Home' },
  { path: 'reports', component: ReportsComponent, title: 'Reports' },
  { path: '**', redirectTo: '' },
];
