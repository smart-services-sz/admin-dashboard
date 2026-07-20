import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyGatewayAuth(request, `/api/routing/plans/${id}`, "GET");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyGatewayAuth(request, `/api/routing/plans/${id}`, "DELETE");
}
