import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { AppState } from './core/app-state';
import { RefitPreset } from './core/refit-theme';
import { isPreviewPage } from './core/shell';
import { Theme } from './core/theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Child tabs receive the parent's :appId as an input too.
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    providePrimeNG({
      theme: {
        preset: RefitPreset,
        options: { darkModeSelector: '.app-dark', cssLayer: { name: 'primeng', order: 'reset, primeng, refit' } },
      },
    }),
    MessageService,
    ConfirmationService,
    // Load the state before the first screen renders. The brand preview (an iframe) needs none of it.
    provideAppInitializer(async () => {
      if (isPreviewPage()) return;
      const state = inject(AppState);
      inject(Theme);
      await state.load();
      state.connect();
    }),
  ],
};
