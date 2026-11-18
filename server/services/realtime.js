import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let ioInstance = null;

export function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  ioInstance.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      socket.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);
    socket.join('workspace');

    socket.on('task:join', (taskId) => {
      if (typeof taskId === 'string' && taskId.length > 0) {
        socket.join(`task:${taskId}`);
      }
    });

    socket.on('task:leave', (taskId) => {
      if (typeof taskId === 'string' && taskId.length > 0) {
        socket.leave(`task:${taskId}`);
      }
    });
  });

  return ioInstance;
}

export function getIO() {
  return ioInstance;
}

export function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

export function emitToTask(taskId, event, payload) {
  if (!ioInstance || !taskId) return;
  ioInstance.to(`task:${taskId}`).emit(event, payload);
}

export function emitWorkspace(event, payload) {
  if (!ioInstance) return;
  ioInstance.to('workspace').emit(event, payload);
}
