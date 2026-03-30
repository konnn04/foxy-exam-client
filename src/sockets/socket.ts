import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { WEBSOCKET_CONFIG, API_CONFIG, STORAGE_KEYS } from '@/config';

(window as any).Pusher = Pusher;

let echoInstance: any = null;

export const socket = {
  connect: () => {
    if (echoInstance) return echoInstance;
    
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const isTLS = WEBSOCKET_CONFIG.FORCE_TLS;
    const port = parseInt(String(WEBSOCKET_CONFIG.PORT));

    echoInstance = new Echo({
      broadcaster: WEBSOCKET_CONFIG.BROADCASTER,
      key: WEBSOCKET_CONFIG.APP_KEY,
      wsHost: WEBSOCKET_CONFIG.HOST || window.location.hostname,
      wsPort: isTLS ? undefined : port,
      wssPort: isTLS ? port : undefined,
      forceTLS: isTLS,
      enableStats: false,
      cluster: 'mt1',
      enabledTransports: ['ws', 'xhr_streaming', 'xhr_polling'],
      authEndpoint: API_CONFIG.BROADCASTING_AUTH_URL,
      auth: {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    });

    return echoInstance;
  },
  
  disconnect: () => {
    if (echoInstance) {
      echoInstance.disconnect();
      echoInstance = null;
    }
  },
  
  getInstance: () => echoInstance,
};

export function getEcho(): any {
  return socket.connect();
}

export function disconnectEcho(): void {
  socket.disconnect();
}
