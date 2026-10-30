import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

function listen(server: http.Server, port: number): Promise<MockServer> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

const REQUESTS = [
  { id: 1, title: 'Laptop for new hire', requester: 'ada@example.com', priority: 'high', status: 'open', description: 'Starts Monday.', createdAt: '2026-10-01' },
  { id: 2, title: 'VPN access', requester: 'grace@example.com', priority: 'normal', status: 'in-progress', description: '', createdAt: '2026-10-03' },
  { id: 3, title: 'Monitor arm', requester: 'alan@example.com', priority: 'low', status: 'done', description: '', createdAt: '2026-10-05' },
];

/** The tiny backend the fixture apps call (port 4799 by default, CORS open). */
export function startMockApi(port = 4799): Promise<MockServer> {
  const server = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    const json = (body: unknown, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const detail = /^\/api\/requests\/(\d+)$/.exec(url.pathname);
    if (url.pathname === '/api/requests' && request.method === 'GET') return json(REQUESTS);
    if (url.pathname === '/api/requests' && request.method === 'POST') return json({ ...REQUESTS[0], id: 99 }, 201);
    if (detail) return json(REQUESTS.find((item) => item.id === Number(detail[1])) ?? {}, detail[1] === '1' || detail[1] === '2' || detail[1] === '3' ? 200 : 404);
    if (url.pathname === '/api/stats') return json({ open: 1, inProgress: 1, done: 1 });
    if (url.pathname === '/api/products') return json([{ id: 1, name: 'Coating', category: 'Surface', price: 120 }]);
    if (/^\/api\/users\/\d+$/.test(url.pathname)) return json({ id: 1, name: 'Ada Example', email: 'ada@example.com', role: 'editor' });
    return json({ error: 'not found' }, 404);
  });
  return listen(server, port);
}

/**
 * A fake identity provider on its own origin. /authorize returns a token to the opener right away
 * when the "session" cookie is set (like MSAL's silent popup) and shows a sign-in form otherwise.
 */
export function startMockIdp(port = 0): Promise<MockServer> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const signedIn = (request.headers.cookie ?? '').includes('mock_session=ok');
    const page = (body: string, headers: Record<string, string> = {}) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      response.end(`<!doctype html><meta charset="utf-8"><title>Mock sign-in</title><body>${body}</body>`);
    };
    const returnToken = `<script>
      (window.opener || window.parent).postMessage({ type: 'mock-token', token: 'token-for-test-user' }, '*');
      setTimeout(() => window.close(), 50);
    </script><p>Signed in.</p>`;
    if (url.pathname === '/authorize') {
      if (signedIn) return page(returnToken);
      // ?autologin=persistent|session submits the form by itself, standing in for a person in tests.
      const auto = url.searchParams.get('autologin');
      const action = auto === 'session' ? '/login-session' : '/login';
      return page(
        `<h1>Sign in</h1><form method="post" action="${action}"><label>User <input name="user" value="test.user"></label><button type="submit">Sign in</button></form>` +
          (auto ? '<script>document.forms[0].submit()</script>' : ''),
      );
    }
    if (url.pathname === '/login' && request.method === 'POST') {
      return page(returnToken, { 'Set-Cookie': 'mock_session=ok; Path=/; HttpOnly; Max-Age=86400' });
    }
    if (url.pathname === '/login-session' && request.method === 'POST') {
      // Same as /login, but the cookie only lives for the browser session (like Entra's ESTSAUTH).
      return page(returnToken, { 'Set-Cookie': 'mock_session=ok; Path=/; HttpOnly' });
    }
    response.writeHead(404).end();
  });
  return listen(server, port);
}

/** Serves fixed HTML pages for browser tests: path -> HTML. */
export function startStaticSite(pages: Record<string, string>, port = 0): Promise<MockServer> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const html = pages[url.pathname];
    if (html !== undefined) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404).end('not found');
  });
  return listen(server, port);
}
