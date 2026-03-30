import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import {
  WEBSOCKET_CONFIG,
  API_CONFIG,
  STORAGE_KEYS,
} from '@/config';

(window as any).Pusher = Pusher;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let echoInstance: any = null;

/**
 * Get or create the Laravel Echo instance.
 * Connects to Laravel Reverb WebSocket server.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEcho(): any {
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
}

/**
 * Disconnect and destroy the Echo instance.
 */
export function disconnectEcho(): void {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
  }
}

/**
 * Update the auth token on the existing Echo instance.
 */
export function updateEchoToken(token: string): void {
  if (echoInstance) {
    (echoInstance.connector as any).pusher.config.auth = {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    };
  }
}
