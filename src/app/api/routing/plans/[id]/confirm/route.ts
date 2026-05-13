import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyGatewayAuth(request, `/api/routing/plans/${id}/confirm`, "POST");
}
