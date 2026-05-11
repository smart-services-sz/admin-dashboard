import { endpoints } from "@/config/api";

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  try {
    const response = await fetch(endpoints.refresh, {
      method: "POST",
      credentials: "include",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
  retryOn401: boolean = true,
): Promise<T> {
  let response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401 && retryOn401 && typeof window !== "undefined") {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshToken().finally(() => {
        isRefreshing = false;
      });
    }

    const refreshed = await refreshPromise;

    if (refreshed) {
      response = await fetch(input, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    } else {
      window.location.href = "/login";
      throw new Error("La sesion expiro");
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || error?.error || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
