import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function GET(request: Request) {
  return proxyGatewayAuth(request, "/api/routing/area-plans", "GET");
}

export async function POST(request: Request) {
  return proxyGatewayAuth(request, "/api/routing/area-plans", "POST");
}
