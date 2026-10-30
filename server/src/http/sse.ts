import type { FastifyReply, FastifyRequest } from 'fastify';

export interface SseStream {
  send(data: unknown, id?: number): void;
  readonly closed: boolean;
  onClose(listener: () => void): void;
}

/** Opens a Server-Sent Events stream on a request and keeps it alive with comments. */
export function openSse(request: FastifyRequest, reply: FastifyReply): SseStream {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  raw.write('retry: 2000\n\n');

  let closed = false;
  const listeners: Array<() => void> = [];
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    for (const listener of listeners) listener();
  };
  const keepAlive = setInterval(() => raw.write(': keep-alive\n\n'), 15_000);
  request.raw.on('close', close);
  raw.on('error', close);

  return {
    send(data: unknown, id?: number) {
      if (closed) return;
      raw.write(`${id !== undefined ? `id: ${id}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
    },
    get closed() {
      return closed;
    },
    onClose(listener: () => void) {
      if (closed) listener();
      else listeners.push(listener);
    },
  };
}
