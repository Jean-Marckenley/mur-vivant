import { io } from 'socket.io-client';

const serverUrl =
    import.meta.env.VITE_SERVER_URL ??
    `http://${window.location.hostname}:3001`;

export const socket = io(serverUrl);