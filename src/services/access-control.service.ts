import { endpoints } from "@/config/api";
import { apiFetch } from "@/lib/api-client";

export interface PaginationMeta {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ManagedUser {
  id: string;
  name?: string | null;
  email: string;
  whatsappNumber?: string | null;
  isActive: boolean;
  cargo?: string | null;
  legajo?: string | null;
  area?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  createdAt?: string;
}

export interface PermissionRecord {
  id: string;
  name: string;
  createdAt?: string;
}

export interface UserFormPayload {
  name: string;
  email: string;
  password?: string;
  isActive: boolean;
  cargo: string;
  legajo: string;
  area: string;
  whatsappNumber?: string;
}

export interface NamePayload {
  name: string;
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) {
      query.set(key, value.trim());
    }
  });

  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function withSearch(path: string, search?: string) {
  if (!search?.trim()) {
    return withQuery(path, { page: "1", limit: "100" });
  }

  return withQuery(path, {
    page: "1",
    limit: "100",
    search,
  });
}

class AccessControlService {
  getUsers(search?: string) {
    return apiFetch<PaginatedResponse<ManagedUser>>(withSearch(endpoints.users, search));
  }

  getActiveUsersByRole(roleName: string) {
    return apiFetch<PaginatedResponse<ManagedUser>>(
      withQuery(endpoints.users, {
        page: "1",
        limit: "100",
        role: roleName,
        isActive: "true",
      }),
    );
  }

  createUser(payload: UserFormPayload) {
    return apiFetch<ManagedUser>(endpoints.users, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateUser(userId: string, payload: UserFormPayload) {
    return apiFetch<ManagedUser>(`${endpoints.users}/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  deleteUser(userId: string) {
    return apiFetch<{ success: boolean }>(`${endpoints.users}/${userId}`, {
      method: "DELETE",
    });
  }

  toggleUserStatus(userId: string) {
    return apiFetch<ManagedUser>(`${endpoints.users}/toggle-status/${userId}`, {
      method: "PATCH",
    });
  }

  getRoles(search?: string) {
    return apiFetch<PaginatedResponse<RoleRecord>>(withSearch(endpoints.roles, search));
  }

  createRole(payload: NamePayload) {
    return apiFetch<RoleRecord>(endpoints.roles, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateRole(roleId: string, payload: NamePayload) {
    return apiFetch<RoleRecord>(`${endpoints.roles}/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  deleteRole(roleId: string) {
    return apiFetch<{ success: boolean }>(`${endpoints.roles}/${roleId}`, {
      method: "DELETE",
    });
  }

  getUserRoles(userId: string) {
    return apiFetch<RoleRecord[]>(`${endpoints.roles}/user/${userId}`);
  }

  setUserRoles(userId: string, rolesIds: string[]) {
    return apiFetch<RoleRecord[]>(`${endpoints.roles}/user/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ rolesIds }),
    });
  }

  getRolePermissions(roleId: string) {
    return apiFetch<PermissionRecord[]>(`${endpoints.roles}/${roleId}/permissions`);
  }

  setRolePermissions(roleId: string, permissionIds: string[]) {
    return apiFetch<PermissionRecord[]>(`${endpoints.roles}/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissionIds }),
    });
  }

  getPermissions(search?: string) {
    return apiFetch<PaginatedResponse<PermissionRecord>>(withSearch(endpoints.permissions, search));
  }

  createPermission(payload: NamePayload) {
    return apiFetch<PermissionRecord>(endpoints.permissions, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updatePermission(permissionId: string, payload: NamePayload) {
    return apiFetch<PermissionRecord>(`${endpoints.permissions}/${permissionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  deletePermission(permissionId: string) {
    return apiFetch<{ success: boolean }>(`${endpoints.permissions}/${permissionId}`, {
      method: "DELETE",
    });
  }

  getUserPermissions(userId: string) {
    return apiFetch<PermissionRecord[]>(`${endpoints.permissions}/user/${userId}`);
  }

  setUserPermissions(userId: string, permissionIds: string[]) {
    return apiFetch<PermissionRecord[]>(`${endpoints.permissions}/user/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ permissionIds }),
    });
  }
}

export const accessControlService = new AccessControlService();
