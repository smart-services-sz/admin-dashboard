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
  const contentType = request.headers.get("content-type") ?? "application/json";
  const isMultipart = contentType.toLowerCase().startsWith("multipart/form-data");
  const body =
    method === "GET"
      ? undefined
      : isMultipart
        ? await request.arrayBuffer()
        : await request.text();

  let upstream: Response;
  let text: string;
  try {
    upstream = await fetch(`${gatewayUrl}${path}`, {
      method,
      headers: {
        "content-type": contentType,
        cookie: buildCookieHeader(request),
        "user-agent": request.headers.get("user-agent") ?? "admin-dashboard",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "127.0.0.1",
        "x-real-ip": request.headers.get("x-real-ip") ?? "127.0.0.1",
      },
      body,
      cache: "no-store",
    });
    text = await upstream.text();
  } catch {
    console.error("Gateway connection failed", { path, method });
    return Response.json({
      message: "No se pudo conectar con el servicio. Actualiza la ruta para comprobar el estado antes de volver a intentar.",
      error: "GatewayUnavailable",
      statusCode: 502,
    }, { status: 502 });
  }

  if (upstream.status >= 500 && !upstream.headers.get("content-type")?.includes("application/json")) {
    const reference = upstream.headers.get("cf-ray") ?? undefined;
    console.error("Gateway returned a non-JSON server error", { path, method, status: upstream.status, reference });
    const response = Response.json({
      message: `El servicio no esta disponible (HTTP ${upstream.status}). Actualiza la ruta para comprobar el estado antes de volver a intentar.${reference ? ` Referencia: ${reference}.` : ""}`,
      error: "GatewayUnavailable",
      statusCode: upstream.status,
      reference,
    }, { status: upstream.status });
    return withForwardedCookies(response, upstream);
  }

  const response = new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });

  return withForwardedCookies(response, upstream);
}
