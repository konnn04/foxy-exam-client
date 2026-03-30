import api from "@/lib/api";
import { API_ENDPOINTS, API_CONFIG, OAUTH_CONFIG } from "@/config";

export const authService = {
  login: async (email: string, password: string) => {
    return api.post(
      API_ENDPOINTS.OAUTH_TOKEN,
      {
        grant_type: OAUTH_CONFIG.GRANT_TYPE,
        client_id: OAUTH_CONFIG.CLIENT_ID,
        client_secret: OAUTH_CONFIG.CLIENT_SECRET,
        username: email,
        password: password,
        scope: OAUTH_CONFIG.SCOPE,
      },
      { baseURL: API_CONFIG.OAUTH_BASE_URL }
    );
  },

  logout: async () => {
    return api.post(API_ENDPOINTS.AUTH_LOGOUT);
  },

  fetchMe: async (token?: string) => {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
    return api.get(API_ENDPOINTS.AUTH_ME, config);
  },
};
