import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { Theme } from '../core/theme';

@Component({
  selector: 'app-top-bar',
  imports: [RouterLink, RouterLinkActive, Button, Tooltip],
  template: `
    <header class="bar">
      <a class="wordmark" routerLink="/apps" aria-label="Refit home">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="24" height="24">
            <rect width="32" height="32" rx="8" fill="currentColor" />
            <path d="M9 22V10h7.2a4.4 4.4 0 0 1 1.3 8.6L22 22h-3.6l-3.9-3.2H12V22zm3-5.9h4a1.9 1.9 0 0 0 0-3.8h-4z" fill="var(--p-primary-contrast-color, #fff)" />
          </svg>
        </span>
        <span class="name">Refit</span>
      </a>
      <nav class="nav" aria-label="Main">
        <a routerLink="/apps" routerLinkActive="active" ariaCurrentWhenActive="page">Apps</a>
        <a routerLink="/settings" routerLinkActive="active" ariaCurrentWhenActive="page">Settings</a>
      </nav>
      <span class="spacer"></span>
      <p-button
        [icon]="theme.dark() ? 'pi pi-sun' : 'pi pi-moon'"
        [text]="true"
        severity="secondary"
        [rounded]="true"
        [pTooltip]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
        tooltipPosition="bottom"
        [ariaLabel]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
        (onClick)="theme.toggle()"
      />
    </header>
  `,
  styles: `
    .bar {
      position: sticky;
      top: 0;
      z-index: 50;
      height: var(--refit-topbar-height);
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 0 16px 0 20px;
      background: color-mix(in srgb, var(--refit-panel) 88%, transparent);
      backdrop-filter: saturate(1.4) blur(10px);
      border-bottom: 1px solid var(--refit-border);
    }
    .wordmark {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--refit-text);
    }
    .mark {
      display: grid;
      color: var(--p-primary-color);
    }
    .name {
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
    }
    .nav {
      display: flex;
      gap: 4px;
    }
    .nav a {
      padding: 6px 12px;
      border-radius: var(--refit-radius);
      color: var(--refit-text-soft);
      text-decoration: none;
      font-weight: 500;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .nav a:hover {
      background: var(--refit-hover);
      color: var(--refit-text);
    }
    .nav a.active {
      background: var(--refit-accent-soft);
      color: var(--refit-accent-text);
    }
    @media (max-width: 560px) {
      .bar {
        gap: 12px;
        padding: 0 8px 0 12px;
      }
      .name {
        display: none;
      }
    }
  `,
})
export class TopBar {
  protected readonly theme = inject(Theme);
}
