const gatewayUrl = process.env.SMARTSERVICE_GATEWAY_URL ?? "http://localhost:3000";

function buildCookieHeader(request: Request) {
  return request.headers.get("cookie") ?? "";
}

function withForwardedCookies(response: Response, upstream: Response) {
  const setCookies = upstream.headers.getSetCookie?.() ?? [];

  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}

export async function proxyGatewayAuth(
  request: Request,
  path: string,
  method: string,
) {
  const body = method === "GET" ? undefined : await request.text();

  const upstream = await fetch(`${gatewayUrl}${path}`, {
    method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      cookie: buildCookieHeader(request),
      "user-agent": request.headers.get("user-agent") ?? "admin-dashboard",
      "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "127.0.0.1",
      "x-real-ip": request.headers.get("x-real-ip") ?? "127.0.0.1",
    },
    body,
    cache: "no-store",
  });

  const text = await upstream.text();
  const response = new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });

  return withForwardedCookies(response, upstream);
}
