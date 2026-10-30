import { Injectable, signal } from '@angular/core';

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
