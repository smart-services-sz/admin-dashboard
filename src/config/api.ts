export const API_URL = "/api";

export const endpoints = {
  login: `${API_URL}/auth/login`,
  logout: `${API_URL}/auth/logout`,
  refresh: `${API_URL}/auth/refresh`,
  me: `${API_URL}/auth/me`,
  users: `${API_URL}/auth/users`,
  roles: `${API_URL}/roles`,
  permissions: `${API_URL}/permissions`,
} as const;
