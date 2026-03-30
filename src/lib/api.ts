import axios from "axios";
import {
  API_CONFIG,
  HTTP_STATUS,
  STORAGE_KEYS,
} from "@/config";
import { isOfflineModeActive } from "@/lib/offline-mode";
import { socket } from "@/sockets/socket";

const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (isOfflineModeActive()) {
    return Promise.reject({
      code: "OFFLINE_MODE",
      message: "Offline mode is active. API requests are disabled.",
      config,
    });
  }

  const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Attach Echo socket ID so broadcast()->toOthers() can exclude the sender
  const echo = socket.getInstance();
  const socketId = echo?.socketId?.();
  if (socketId) {
    config.headers["X-Socket-ID"] = socketId;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.code === "OFFLINE_MODE") {
      return Promise.reject(error);
    }

    const isNetworkError = !error.response && (error.code === "ERR_NETWORK" || !navigator.onLine);

    if (isNetworkError) {
      window.dispatchEvent(new CustomEvent("app:network-error"));
    }

    if (error.response?.status === HTTP_STATUS.UNAUTHORIZED) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
