import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyGatewayAuth(request, `/api/auth/users/toggle-status/${id}`, "PATCH");
}
