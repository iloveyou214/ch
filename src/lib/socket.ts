import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 15000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function authenticateSocket(token: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('authenticate', { token });
  } else {
    s.once('connect', () => {
      s.emit('authenticate', { token });
    });
  }
}
