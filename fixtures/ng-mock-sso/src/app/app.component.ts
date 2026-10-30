import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="header">
      <strong>Reports portal</strong>
      <nav><a routerLink="/">Home</a> | <a routerLink="/reports">Reports</a></nav>
      <span class="user">{{ auth.user() ?? 'Signing in…' }}</span>
    </header>
    @if (auth.user()) {
      <router-outlet />
    } @else {
      <p class="waiting">Signing in with your company account…</p>
    }
  `,
  styles: `
    .header {
      display: flex;
      gap: 20px;
      padding: 10px;
      background: #444;
      color: white;
    }
    .header a {
      color: #9cf;
    }
    .user {
      margin-left: auto;
    }
    .waiting {
      padding: 20px;
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
