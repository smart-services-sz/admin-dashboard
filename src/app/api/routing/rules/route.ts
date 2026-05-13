import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function GET(request: Request) {
  return proxyGatewayAuth(request, "/api/routing/rules", "GET");
}

export async function PUT(request: Request) {
  return proxyGatewayAuth(request, "/api/routing/rules", "PUT");
}
