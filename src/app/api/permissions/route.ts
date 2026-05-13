import { proxyGatewayAuth } from "@/lib/gateway-auth-proxy";

export async function GET(request: Request) {
  return proxyGatewayAuth(request, `/api/permissions${new URL(request.url).search}`, "GET");
}

export async function POST(request: Request) {
  return proxyGatewayAuth(request, "/api/permissions", "POST");
}
