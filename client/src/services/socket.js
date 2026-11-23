import { io } from 'socket.io-client';

let socket = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      withCredentials: true // staff session cookie decides which live updates this screen gets
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected, ID:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
    });
  }
  return socket;
};

export const joinRoom = (room) => {
  if (socket) {
    socket.emit('join', room);
  }
};

export const getSocket = () => socket;

