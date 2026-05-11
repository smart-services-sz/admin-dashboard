import { endpoints } from "@/config/api";
import { apiFetch } from "@/lib/api-client";
import type { AuthUser } from "@/lib/auth.server";

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
}

class AuthService {
  login(dto: LoginDto): Promise<LoginResponse> {
    return apiFetch<LoginResponse>(
      endpoints.login,
      {
        method: "POST",
        body: JSON.stringify(dto),
      },
      false,
    );
  }

  logout(): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      endpoints.logout,
      {
        method: "POST",
      },
      false,
    );
  }

  getCurrentUser(): Promise<AuthUser> {
    return apiFetch<AuthUser>(endpoints.me);
  }
}

export const authService = new AuthService();
