import net from 'node:net';

/** True when something accepts connections on the port (IPv4 or IPv6 localhost). */
export async function isPortInUse(port: number): Promise<boolean> {
  const results = await Promise.all(['127.0.0.1', '::1'].map((host) => canConnect(host, port)));
  return results.some(Boolean);
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(800, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** How to find and stop the program that holds a port, for the current platform. */
export function portInUseFix(port: number): string {
  if (process.platform === 'win32') {
    return `Stop the program using port ${port}: run "netstat -ano | findstr :${port}" in a terminal, note the PID in the last column, then "taskkill /PID <pid> /F". Often it is another "ng serve" you left running.`;
  }
  return `Stop the program using port ${port}: run "lsof -i :${port}" to find its PID, then "kill <pid>". Often it is another "ng serve" you left running.`;
}
