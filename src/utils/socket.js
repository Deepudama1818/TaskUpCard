import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socketInstance = null;

export function connectSocket() {
  const token = getToken();
  if (!token) return null;

  if (socketInstance) {
    if (!socketInstance.connected) {
      socketInstance.auth = { token };
      socketInstance.connect();
    }
    return socketInstance;
  }

  socketInstance = io({
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
  });

  return socketInstance;
}

export function getSocket() {
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
