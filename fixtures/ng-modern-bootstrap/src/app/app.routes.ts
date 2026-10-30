import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { RequestDetailComponent } from './pages/request-detail/request-detail.component';
import { RequestFormComponent } from './pages/request-form/request-form.component';
import { RequestListComponent } from './pages/request-list/request-list.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent, title: 'Dashboard' },
  { path: 'requests', component: RequestListComponent, title: 'Requests' },
  { path: 'requests/new', component: RequestFormComponent, title: 'New request' },
  { path: 'requests/:id', component: RequestDetailComponent, title: 'Request details' },
  { path: '**', redirectTo: '' },
];
