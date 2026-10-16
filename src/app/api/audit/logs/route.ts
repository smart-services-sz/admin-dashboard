import { proxyGatewayAuth } from '@/lib/gateway-auth-proxy';

export async function GET(request: Request) {
  return proxyGatewayAuth(
    request,
    `/api/audit/logs${new URL(request.url).search}`,
    'GET',
  );
}