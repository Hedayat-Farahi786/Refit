import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Signs in like MSAL's popup flow: opens the identity provider in a popup on another origin and
 * waits for it to post a token back. With a remembered session the popup closes by itself.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<string | null>(sessionStorage.getItem('mock-user'));

  signIn(): Promise<void> {
    if (this.user()) return Promise.resolve();
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type !== 'mock-token') return;
        window.removeEventListener('message', onMessage);
        sessionStorage.setItem('mock-user', 'test.user');
        this.user.set('test.user');
        resolve();
      };
      window.addEventListener('message', onMessage);
      window.open(`${environment.idpUrl}/authorize`, 'mock-sign-in', 'width=440,height=560');
    });
  }
}
