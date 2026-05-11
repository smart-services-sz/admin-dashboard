export const API_URL = "/api";

export const endpoints = {
  login: `${API_URL}/auth/login`,
  logout: `${API_URL}/auth/logout`,
  refresh: `${API_URL}/auth/refresh`,
  me: `${API_URL}/auth/me`,
} as const;
