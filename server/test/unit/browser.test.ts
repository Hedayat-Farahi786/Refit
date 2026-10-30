import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { apiChanged, diffApiCalls, isSignInUrl, newConsoleErrors, normalizeApiCall } from '../../src/browser/api-calls.js';
import { pageUrl } from '../../src/browser/page-url.js';
import { isPortInUse, portInUseFix } from '../../src/browser/port.js';

const app = 'http://localhost:4200';

describe('normalizeApiCall', () => {
  it.each([
    ['GET', 'http://localhost:4799/api/requests?page=2', 'GET localhost:4799/api/requests'],
    ['get', 'http://localhost:4799/api/requests/42', 'GET localhost:4799/api/requests/:id'],
    ['PUT', 'https://api.example.com/v1/users/3f2504e0-4f89-11d3-9a0c-0305e82c3301/roles', 'PUT api.example.com/v1/users/:id/roles'],
    ['GET', 'https://api.example.com/items/507f1f77bcf86cd799439011', 'GET api.example.com/items/:id'],
    ['POST', '/api/requests', 'POST localhost:4200/api/requests'],
    ['GET', 'http://localhost:4200/api/config.json', 'GET localhost:4200/api/config.json'],
    ['GET', 'https://graph.microsoft.com/v1.0/me', 'GET graph.microsoft.com/v1.0/me'],
  ])('%s %s -> %s', (method, url, expected) => {
    expect(normalizeApiCall(method, url, app)).toBe(expected);
  });

  it.each([
    ['GET', 'http://localhost:4200/main-ABC.js'],
    ['GET', 'http://localhost:4200/assets/i18n/en.json'],
    ['GET', 'http://localhost:4200/settings.json'],
    ['GET', 'http://localhost:4200/ng-cli-ws'],
    ['GET', 'http://localhost:4200/@vite/client'],
    ['GET', 'http://localhost:4200/main.hot-update.js'],
    ['POST', 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token'],
    ['GET', 'https://aadcdn.msftauth.net/shared/1.0/content/js/x.js'],
    ['POST', 'https://dc.services.visualstudio.com/v2/track'],
    ['POST', 'https://westeurope-5.in.applicationinsights.azure.com/v2/track'],
    ['GET', 'https://cdn.example.com/fonts/inter.woff2'],
    ['GET', 'data:text/plain,hello'],
  ])('ignores %s %s', (method, url) => {
    expect(normalizeApiCall(method, url, app)).toBeNull();
  });

  it('accepts extra sign-in hosts', () => {
    expect(normalizeApiCall('GET', 'http://127.0.0.1:5555/authorize', app, ['127.0.0.1:5555'])).toBeNull();
    expect(isSignInUrl('http://127.0.0.1:5555/authorize', ['127.0.0.1:5555'])).toBe(true);
    expect(isSignInUrl('https://login.microsoftonline.com/common/oauth2')).toBe(true);
    expect(isSignInUrl('https://mylogin.example.com/')).toBe(false);
    expect(isSignInUrl('not a url')).toBe(false);
  });
});

describe('diffApiCalls', () => {
  it('compares as sets so polling does not count', () => {
    const before = ['GET a/api/x', 'GET a/api/x', 'GET a/api/y'];
    const diff = diffApiCalls(before, ['GET a/api/y', 'GET a/api/x', 'GET a/api/y']);
    expect(diff).toEqual({ added: [], removed: [], unchanged: 2 });
    expect(apiChanged(diff)).toBe(false);
  });

  it('reports new and missing endpoints', () => {
    const diff = diffApiCalls(['GET a/api/x', 'GET a/api/y'], ['GET a/api/x', 'POST a/api/z']);
    expect(diff).toEqual({ added: ['POST a/api/z'], removed: ['GET a/api/y'], unchanged: 1 });
    expect(apiChanged(diff)).toBe(true);
  });

  it('reports only console errors that are new, ignoring line numbers and URLs', () => {
    const before = ['TypeError: x is undefined at http://localhost:4200/main.js:10:5'];
    const after = ['TypeError: x is undefined at http://localhost:4200/main.js:12:9', 'NG0100: Expression has changed'];
    expect(newConsoleErrors(before, after)).toEqual(['NG0100: Expression has changed']);
  });
});

describe('pageUrl', () => {
  it('fills parameters and handles hash routing and base href', () => {
    expect(pageUrl({ port: 4200, route: '/', params: {}, hashRouting: false })).toBe('http://localhost:4200/');
    expect(pageUrl({ port: 4200, route: '/requests/:id', params: { id: '42' }, hashRouting: false })).toBe('http://localhost:4200/requests/42');
    expect(pageUrl({ port: 4300, route: '/requests/:id', params: { id: 'a b' }, hashRouting: true })).toBe('http://localhost:4300/#/requests/a%20b');
    expect(pageUrl({ port: 4200, route: '/', params: {}, hashRouting: true })).toBe('http://localhost:4200/#/');
    expect(pageUrl({ port: 4200, route: '/reports', params: {}, hashRouting: false, baseHref: '/portal/' })).toBe('http://localhost:4200/portal/reports');
  });
});

describe('ports', () => {
  it('detects a port in use and explains how to free it', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    expect(await isPortInUse(port)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortInUse(port)).toBe(false);
    expect(portInUseFix(4200)).toContain('4200');
  });
});
