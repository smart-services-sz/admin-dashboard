import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AccessManagementPanel } from "./access-management-panel";

const service = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getRoles: vi.fn(),
  getPermissions: vi.fn(),
  getUsersByRole: vi.fn(),
  getUserRoles: vi.fn(),
  getUserPermissions: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/services/access-control.service", () => ({
  accessControlService: service,
}));

const administrator = {
  id: "admin-1",
  name: "Administrador",
  email: "admin@demo.com",
  isActive: true,
  cargo: null,
  legajo: null,
  area: null,
  municipalityId: null,
  areaId: null,
};

describe("AccessManagementPanel user editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getUsers.mockResolvedValue({ data: [administrator] });
    service.getRoles.mockResolvedValue({ data: [] });
    service.getPermissions.mockResolvedValue({ data: [] });
    service.getUsersByRole.mockResolvedValue({ data: [] });
    service.getUserRoles.mockResolvedValue([]);
    service.getUserPermissions.mockResolvedValue([]);
    service.updateUser.mockImplementation(async (_id, payload) => ({
      ...administrator,
      ...payload,
    }));
  });

  it("submits the municipality for an existing administrator without employment details", async () => {
    render(<AccessManagementPanel section="users" />);
    await screen.findByText(administrator.email);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const municipality = screen.getByLabelText("Municipio");
    fireEvent.change(municipality, { target: { value: "funes" } });

    const form = municipality.closest("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(true);
    for (const label of ["Cargo", "Legajo", "Area"]) {
      expect(screen.getByLabelText(label, { exact: true })).not.toBeRequired();
    }
    fireEvent.click(screen.getByRole("button", { name: "Actualizar usuario" }));

    await waitFor(() => expect(service.updateUser).toHaveBeenCalledWith(
      administrator.id,
      expect.objectContaining({
        municipalityId: "funes", cargo: "", legajo: "", area: "",
      }),
    ));
    expect(service.updateUser.mock.calls[0][1]).not.toHaveProperty("password");
  });

  it("keeps employment details required when creating a new user", async () => {
    render(<AccessManagementPanel section="users" />);
    await screen.findByText(administrator.email);
    for (const label of ["Cargo", "Legajo", "Area"]) {
      expect(screen.getByLabelText(label, { exact: true })).toBeRequired();
    }
  });
});