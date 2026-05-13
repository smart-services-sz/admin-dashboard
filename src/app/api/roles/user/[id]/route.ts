import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyGatewayAuth(request, `/api/roles/user/${id}`, "GET");
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyGatewayAuth(request, `/api/roles/user/${id}`, "PUT");
}
