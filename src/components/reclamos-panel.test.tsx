import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ReclamosPanel } from "./reclamos-panel";

const { getReclamos, getReclamoById } = vi.hoisted(() => ({
  getReclamos: vi.fn(),
  getReclamoById: vi.fn(),
}));

vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasRole: () => true,
  }),
}));

vi.mock("@/services/reclamos.service", () => ({
  reclamosService: { getReclamos, getReclamoById },
  ESTADO_LABELS: { pendiente: "Pendiente", en_proceso: "En proceso", resuelto: "Resuelto", rechazado: "Rechazado", cerrado: "Cerrado" },
  CATEGORIA_LABELS: { alumbrado: "Alumbrado" },
  PRIORIDAD_LABELS: { media: "Media" },
}));

describe("ReclamosPanel evidence details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReclamos.mockResolvedValue({
      items: [
        {
          id: "claim-1",
          codigoSeguimiento: "REC-ABC123",
          correlationId: "correlation-1",
          contactKey: "web:email:citizen@example.com",
          canal: "web",
          problema: "Luminaria apagada",
          direccion: "San Martin 123, Funes",
          lat: -32.91,
          lng: -60.81,
          categoria: "alumbrado",
          prioridad: "media",
          estado: "pendiente",
          creadoEn: "2026-10-14T12:00:00.000Z",
          actualizadoEn: "2026-10-14T12:00:00.000Z",
        },
      ],
      pagination: { totalItems: 1, totalPages: 1 },
    });
    getReclamoById.mockResolvedValue({
      id: "claim-1",
      codigoSeguimiento: "REC-ABC123",
      problema: "Luminaria apagada",
      direccion: "San Martin 123, Funes",
      evidencias: [
        {
          nombreArchivo: "foto.jpg",
          contentType: "image/jpeg",
          size: 1024,
          uploadedAt: "2026-10-14T12:00:00.000Z",
          url: "https://private-storage.example/signed-object",
        },
      ],
    });
  });

  it("loads the authenticated detail and displays the temporary evidence link", async () => {
    render(<ReclamosPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Detalle" }));

    expect(getReclamoById).toHaveBeenCalledWith("claim-1");
    const download = await screen.findByRole("link", { name: "Descargar" });
    expect(download).toHaveAttribute(
      "href",
      "https://private-storage.example/signed-object",
    );
    expect(download).toHaveAttribute("rel", "noreferrer");
  });
});