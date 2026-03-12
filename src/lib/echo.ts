import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Make Pusher globally available for Laravel Echo
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

  const token = localStorage.getItem('auth_token');

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'exam-key-local',
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname || 'localhost',
    wsPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
    wssPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
    forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/broadcasting/auth` : 'http://localhost:8000/broadcasting/auth',
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
