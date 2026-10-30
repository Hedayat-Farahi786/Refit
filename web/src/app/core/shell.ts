import { Injectable, signal } from '@angular/core';

/** True inside the Brand studio's preview iframe, which shows a page without Refit's shell. */
export function isPreviewPage(): boolean {
  return typeof location !== 'undefined' && location.pathname.startsWith('/preview/');
}

/** UI state the whole shell shares: the "Add app" dialog and the sidebar drawer on small screens. */
@Injectable({ providedIn: 'root' })
export class Shell {
  readonly addAppOpen = signal(false);
  readonly drawerOpen = signal(false);

  openAddApp(): void {
    this.drawerOpen.set(false);
    this.addAppOpen.set(true);
  }
}
