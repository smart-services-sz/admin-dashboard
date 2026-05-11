import { cookies } from "next/headers";

export interface AuthUser {
  userId: string;
  name?: string;
  email: string;
  roles: string[];
  permissions: string[];
  cargo?: string;
  legajo?: string;
  area?: string;
}

const gatewayUrl = process.env.SMARTSERVICE_GATEWAY_URL ?? "http://localhost:3000";

export async function getServerUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (!cookieHeader) {
    return null;
  }

  const response = await fetch(`${gatewayUrl}/api/auth/me`, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AuthUser;
}
