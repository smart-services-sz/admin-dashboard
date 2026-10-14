import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyGatewayAuth } from "./gateway-auth-proxy";

describe("proxyGatewayAuth", () => {
  const fetchMock = vi.fn();
  const request = () => new Request("https://dashboard.test/api/routing/interventions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "session=test" },
    body: JSON.stringify({ routeId: "route-1", stopId: "stop-2", result: "resuelto" }),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("converts a Cloudflare HTML 502 into an actionable JSON error without retrying", async () => {
    fetchMock.mockResolvedValue(new Response("<h1>Bad gateway</h1>", {
      status: 502, headers: { "content-type": "text/html", "cf-ray": "test-ray-EZE" },
    }));
    const response = await proxyGatewayAuth(request(), "/api/routing/interventions", "POST");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("Actualiza la ruta"), reference: "test-ray-EZE", error: "GatewayUnavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reference: "test-ray-EZE", path: "/api/routing/interventions" }));
  });

  it("preserves JSON business errors and status codes", async () => {
    fetchMock.mockResolvedValue(Response.json({ message: "Debe cerrar los trabajos anteriores en orden", statusCode: 409 }, { status: 409 }));
    const response = await proxyGatewayAuth(request(), "/api/routing/interventions", "POST");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Debe cerrar los trabajos anteriores en orden", statusCode: 409 });
  });

  it("preserves successful responses and forwards the original payload", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "ok" }));
    const response = await proxyGatewayAuth(request(), "/api/routing/interventions", "POST");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/routing/interventions"), expect.objectContaining({
      method: "POST", body: JSON.stringify({ routeId: "route-1", stopId: "stop-2", result: "resuelto" }),
      headers: expect.objectContaining({ cookie: "session=test" }),
    }));
  });

  it("forwards multipart bytes without decoding or changing the boundary", async () => {
    const bytes = new Uint8Array([0, 255, 1, 2, 128]);
    const multipartRequest = new Request(
      "https://dashboard.test/api/routing/interventions/evidence",
      {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=smartservice-test",
        },
        body: bytes,
      },
    );
    fetchMock.mockResolvedValue(Response.json({ status: "ok" }));

    await proxyGatewayAuth(
      multipartRequest,
      "/api/routing/interventions/evidence",
      "POST",
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "content-type": "multipart/form-data; boundary=smartservice-test",
    });
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(init.body as ArrayBuffer))).toEqual([
      0, 255, 1, 2, 128,
    ]);
  });

  it("returns JSON when the connection fails without leaking request data", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const response = await proxyGatewayAuth(request(), "/api/routing/interventions", "POST");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "GatewayUnavailable" });
    expect(console.error).toHaveBeenCalledWith("Gateway connection failed", { path: "/api/routing/interventions", method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});