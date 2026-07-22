"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  accessControlService,
  type ManagedUser,
  type PermissionRecord,
  type RoleRecord,
  type UserFormPayload,
} from "@/services/access-control.service";
import styles from "./admin-dashboard.module.css";

export type AccessSection = "users" | "roles" | "permissions";

type Notice = {
  tone: "success" | "error";
  message: string;
} | null;

type ToastMessage = {
  id: string;
  kind: "success" | "error" | "info";
  text: string;
};

type UserFormState = {
  name: string;
  email: string;
  password: string;
  isActive: boolean;
  cargo: string;
  legajo: string;
  area: string;
  whatsappNumber: string;
};

type AccessManagementPanelProps = {
  section: AccessSection;
};

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  isActive: true,
  cargo: "",
  legajo: "",
  area: "",
  whatsappNumber: "",
};

const sectionCopy: Record<AccessSection, { title: string; description: string }> = {
  users: {
    title: "CRUD de usuarios",
    description: "Altas, bajas, edición y activación de usuarios administrativos.",
  },
  roles: {
    title: "CRUD de roles",
    description: "Administra roles y asígnalos a usuarios concretos.",
  },
  permissions: {
    title: "CRUD de permisos",
    description: "Administra permisos y asígnalos a usuarios o a roles.",
  },
};

function toUserPayload(form: UserFormState, includePassword: boolean): UserFormPayload {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    ...(includePassword ? { password: form.password } : {}),
    isActive: form.isActive,
    cargo: form.cargo.trim(),
    legajo: form.legajo.trim(),
    area: form.area.trim(),
    whatsappNumber: form.whatsappNumber.trim() || undefined,
  };
}

export function AccessManagementPanel({ section }: AccessManagementPanelProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [agentUserIds, setAgentUserIds] = useState<string[]>([]);
  const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>([]);
  const [assignedPermissionIds, setAssignedPermissionIds] = useState<string[]>([]);
  const [assignedRolePermissionIds, setAssignedRolePermissionIds] = useState<string[]>([]);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [roleName, setRoleName] = useState("");
  const [permissionName, setPermissionName] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingPermissionId, setEditingPermissionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const lastNoticeToastRef = useRef<string | null>(null);

  const pushToast = (kind: ToastMessage["kind"], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, kind, text }].slice(-4));
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  };

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );
  const agentRole = useMemo(
    () => roles.find((role) => role.name.trim().toUpperCase() === "AGENT") ?? null,
    [roles],
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  async function loadCoreData(searchValue = search) {
    setBusyAction("load");
    setNotice(null);

    try {
      const [usersResponse, rolesResponse, permissionsResponse, agentUsersResponse] = await Promise.all([
        accessControlService.getUsers(searchValue),
        accessControlService.getRoles(),
        accessControlService.getPermissions(),
        accessControlService.getUsersByRole("AGENT"),
      ]);

      setUsers(usersResponse.data);
      setRoles(rolesResponse.data);
      setPermissions(permissionsResponse.data);
      setAgentUserIds(agentUsersResponse.data.map((user) => user.id));

      const nextUserId = usersResponse.data.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : (usersResponse.data[0]?.id ?? "");
      const nextRoleId = rolesResponse.data.some((role) => role.id === selectedRoleId)
        ? selectedRoleId
        : (rolesResponse.data[0]?.id ?? "");

      setSelectedUserId(nextUserId);
      setSelectedRoleId(nextRoleId);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo cargar la configuración de accesos.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function loadUserAssignments(userId: string) {
    if (!userId) {
      setAssignedRoleIds([]);
      setAssignedPermissionIds([]);
      return;
    }

    try {
      const [userRoles, userPermissions] = await Promise.all([
        accessControlService.getUserRoles(userId),
        accessControlService.getUserPermissions(userId),
      ]);

      setAssignedRoleIds(userRoles.map((role) => role.id));
      setAssignedPermissionIds(userPermissions.map((permission) => permission.id));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudieron cargar las asignaciones del usuario.",
      });
    }
  }

  async function loadRolePermissionAssignments(roleId: string) {
    if (!roleId) {
      setAssignedRolePermissionIds([]);
      return;
    }

    try {
      const rolePermissions = await accessControlService.getRolePermissions(roleId);
      setAssignedRolePermissionIds(rolePermissions.map((permission) => permission.id));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudieron cargar los permisos del rol.",
      });
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCoreData();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUserAssignments(selectedUserId);
  }, [selectedUserId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRolePermissionAssignments(selectedRoleId);
  }, [selectedRoleId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const signature = `${notice.tone}:${notice.message}`;
    if (lastNoticeToastRef.current === signature) {
      return;
    }

    lastNoticeToastRef.current = signature;
    pushToast(notice.tone === "success" ? "success" : "error", notice.message);
  }, [notice]);

  function resetUserForm() {
    setEditingUserId(null);
    setUserForm(emptyUserForm);
  }

  function handleEditUser(user: ManagedUser) {
    setEditingUserId(user.id);
    setSelectedUserId(user.id);
    setUserForm({
      name: user.name ?? "",
      email: user.email,
      password: "",
      isActive: user.isActive,
      cargo: user.cargo ?? "",
      legajo: user.legajo ?? "",
      area: user.area ?? "",
      whatsappNumber: user.whatsappNumber ?? "",
    });
  }

  async function handleSubmitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-user");
    setNotice(null);

    try {
      const includePassword = editingUserId === null || userForm.password.trim().length > 0;
      if (editingUserId === null && !includePassword) {
        throw new Error("La contraseña es obligatoria para crear un usuario.");
      }

      const payload = toUserPayload(userForm, includePassword);
      const savedUser = editingUserId
        ? await accessControlService.updateUser(editingUserId, payload)
        : await accessControlService.createUser(payload);

      await loadCoreData();
      setSelectedUserId(savedUser.id);
      resetUserForm();
      setNotice({
        tone: "success",
        message: editingUserId ? "Usuario actualizado." : "Usuario creado.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar el usuario.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleUser(user: ManagedUser) {
    const actionKey = `toggle-${user.id}`;
    setBusyAction(actionKey);
    setNotice(null);

    try {
      await accessControlService.toggleUserStatus(user.id);
      await loadCoreData();
      setNotice({
        tone: "success",
        message: `Usuario ${user.isActive ? "desactivado" : "activado"}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo cambiar el estado del usuario.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteUser(user: ManagedUser) {
    if (!window.confirm(`Eliminar al usuario ${user.email}?`)) {
      return;
    }

    const actionKey = `delete-user-${user.id}`;
    setBusyAction(actionKey);
    setNotice(null);

    try {
      await accessControlService.deleteUser(user.id);
      await loadCoreData();
      if (selectedUserId === user.id) {
        setSelectedUserId("");
      }
      if (editingUserId === user.id) {
        resetUserForm();
      }
      setNotice({ tone: "success", message: "Usuario eliminado." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar el usuario.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleName("");
  }

  async function handleSubmitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-role");
    setNotice(null);

    try {
      if (editingRoleId) {
        await accessControlService.updateRole(editingRoleId, { name: roleName.trim() });
      } else {
        await accessControlService.createRole({ name: roleName.trim() });
      }

      await loadCoreData();
      resetRoleForm();
      setNotice({
        tone: "success",
        message: editingRoleId ? "Rol actualizado." : "Rol creado.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar el rol.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteRole(role: RoleRecord) {
    if (!window.confirm(`Eliminar el rol ${role.name}?`)) {
      return;
    }

    setBusyAction(`delete-role-${role.id}`);
    setNotice(null);

    try {
      await accessControlService.deleteRole(role.id);
      await loadCoreData();
      if (editingRoleId === role.id) {
        resetRoleForm();
      }
      if (selectedRoleId === role.id) {
        setSelectedRoleId("");
      }
      setNotice({ tone: "success", message: "Rol eliminado." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar el rol.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function resetPermissionForm() {
    setEditingPermissionId(null);
    setPermissionName("");
  }

  async function handleSubmitPermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-permission");
    setNotice(null);

    try {
      if (editingPermissionId) {
        await accessControlService.updatePermission(editingPermissionId, { name: permissionName.trim() });
      } else {
        await accessControlService.createPermission({ name: permissionName.trim() });
      }

      await loadCoreData();
      resetPermissionForm();
      setNotice({
        tone: "success",
        message: editingPermissionId ? "Permiso actualizado." : "Permiso creado.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar el permiso.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeletePermission(permission: PermissionRecord) {
    if (!window.confirm(`Eliminar el permiso ${permission.name}?`)) {
      return;
    }

    setBusyAction(`delete-permission-${permission.id}`);
    setNotice(null);

    try {
      await accessControlService.deletePermission(permission.id);
      await loadCoreData();
      if (editingPermissionId === permission.id) {
        resetPermissionForm();
      }
      setNotice({ tone: "success", message: "Permiso eliminado." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar el permiso.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function toggleAssignedRole(roleId: string) {
    setAssignedRoleIds((current) =>
      current.includes(roleId)
        ? current.filter((item) => item !== roleId)
        : [...current, roleId],
    );
  }

  function toggleAssignedUserPermission(permissionId: string) {
    setAssignedPermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((item) => item !== permissionId)
        : [...current, permissionId],
    );
  }

  function toggleAssignedRolePermission(permissionId: string) {
    setAssignedRolePermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((item) => item !== permissionId)
        : [...current, permissionId],
    );
  }

  async function saveUserRoles() {
    if (!selectedUserId) {
      return;
    }

    setBusyAction("assign-roles");
    setNotice(null);

    try {
      await accessControlService.setUserRoles(selectedUserId, assignedRoleIds);
      await loadUserAssignments(selectedUserId);
      setNotice({ tone: "success", message: "Roles del usuario actualizados." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudieron guardar los roles del usuario.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleAgentRole(user: ManagedUser) {
    if (!agentRole) {
      setNotice({
        tone: "error",
        message: "No existe el rol AGENT en la base de accesos.",
      });
      return;
    }

    const actionKey = `toggle-agent-${user.id}`;
    setBusyAction(actionKey);
    setNotice(null);

    try {
      const currentRoles = await accessControlService.getUserRoles(user.id);
      const hasAgent = currentRoles.some((role) => role.id === agentRole.id);
      const nextRoleIds = hasAgent
        ? currentRoles.filter((role) => role.id !== agentRole.id).map((role) => role.id)
        : [...currentRoles.map((role) => role.id), agentRole.id];

      await accessControlService.setUserRoles(user.id, nextRoleIds);
      await loadCoreData();

      if (selectedUserId === user.id) {
        await loadUserAssignments(user.id);
      }

      setNotice({
        tone: "success",
        message: hasAgent
          ? `Rol AGENT removido de ${user.email}.`
          : `Rol AGENT asignado a ${user.email}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo actualizar el rol AGENT del usuario.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveUserPermissions() {
    if (!selectedUserId) {
      return;
    }

    setBusyAction("assign-user-permissions");
    setNotice(null);

    try {
      await accessControlService.setUserPermissions(selectedUserId, assignedPermissionIds);
      await loadUserAssignments(selectedUserId);
      setNotice({ tone: "success", message: "Permisos directos del usuario actualizados." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudieron guardar los permisos del usuario.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveRolePermissions() {
    if (!selectedRoleId) {
      return;
    }

    setBusyAction("assign-role-permissions");
    setNotice(null);

    try {
      await accessControlService.setRolePermissions(selectedRoleId, assignedRolePermissionIds);
      await loadRolePermissionAssignments(selectedRoleId);
      setNotice({ tone: "success", message: "Permisos del rol actualizados." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudieron guardar los permisos del rol.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function renderUsersSection() {
    return (
      <section className={styles.managementGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2>Usuarios</h2>
            <span>{users.length} cargados</span>
          </header>

          <form
            className={styles.inlineSearch}
            onSubmit={(event) => {
              event.preventDefault();
              void loadCoreData(search);
            }}
          >
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por email, nombre o WhatsApp"
            />
            <button className={styles.secondaryAction} type="submit">
              Buscar
            </button>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Area</th>
                  <th>AGENT</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <button type="button" className={styles.linkButton} onClick={() => handleEditUser(user)}>
                        <strong>{user.name || user.email}</strong>
                        <span>{user.email}</span>
                      </button>
                    </td>
                    <td>{user.area || "-"}</td>
                    <td>
                      <span
                        className={styles.badge}
                        data-tone={agentUserIds.includes(user.id) ? "success" : "muted"}
                      >
                        {agentUserIds.includes(user.id) ? "Si" : "No"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.badge} data-tone={user.isActive ? "success" : "muted"}>
                        {user.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" onClick={() => handleEditUser(user)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleAgentRole(user)}
                          disabled={busyAction === `toggle-agent-${user.id}` || !agentRole}
                        >
                          {busyAction === `toggle-agent-${user.id}` ? "Guardando..." : "Asignar/Quitar AGENT"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleUser(user)}
                          disabled={busyAction === `toggle-${user.id}`}
                        >
                          {user.isActive ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => void handleDeleteUser(user)}
                          disabled={busyAction === `delete-user-${user.id}`}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panel}>
          <form className={styles.form} onSubmit={handleSubmitUser}>
            <header className={styles.subsectionHeader}>
              <h3>{editingUserId ? "Editar usuario" : "Nuevo usuario"}</h3>
              {editingUserId ? (
                <button type="button" className={styles.cancelInlineButton} onClick={resetUserForm}>
                  Cancelar
                </button>
              ) : null}
            </header>

            <div className={styles.formGrid}>
              <label>
                Nombre
                <input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                Email
                <input type="email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} required />
              </label>
              <label>
                Contraseña
                <input type="password" value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} placeholder={editingUserId ? "Dejar vacío para mantener" : "Debe cumplir política fuerte"} required={editingUserId === null} />
              </label>
              <label>
                Cargo
                <input value={userForm.cargo} onChange={(event) => setUserForm((current) => ({ ...current, cargo: event.target.value }))} required />
              </label>
              <label>
                Legajo
                <input value={userForm.legajo} onChange={(event) => setUserForm((current) => ({ ...current, legajo: event.target.value }))} required />
              </label>
              <label>
                Area
                <input value={userForm.area} onChange={(event) => setUserForm((current) => ({ ...current, area: event.target.value }))} required />
              </label>
              <label>
                WhatsApp
                <input value={userForm.whatsappNumber} onChange={(event) => setUserForm((current) => ({ ...current, whatsappNumber: event.target.value }))} />
              </label>
              <label className={styles.checkboxField}>
                <input type="checkbox" checked={userForm.isActive} onChange={(event) => setUserForm((current) => ({ ...current, isActive: event.target.checked }))} />
                Usuario activo
              </label>
            </div>

            <button className={styles.submitButton} type="submit" disabled={busyAction === "save-user"}>
              {busyAction === "save-user" ? "Guardando..." : editingUserId ? "Actualizar usuario" : "Crear usuario"}
            </button>
          </form>
        </article>
      </section>
    );
  }

  function renderRolesSection() {
    return (
      <section className={styles.managementGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2>Roles</h2>
            <span>{roles.length} disponibles</span>
          </header>

          <div className={styles.tagList}>
            {roles.map((role) => (
              <div key={role.id} className={styles.tagCard}>
                <strong>{role.name}</strong>
                <div className={styles.rowActions}>
                  <button type="button" onClick={() => { setEditingRoleId(role.id); setRoleName(role.name); setSelectedRoleId(role.id); }}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void handleDeleteRole(role)}
                    disabled={busyAction === `delete-role-${role.id}`}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form className={styles.form} onSubmit={handleSubmitRole}>
            <header className={styles.subsectionHeader}>
              <h3>{editingRoleId ? "Editar rol" : "Nuevo rol"}</h3>
              {editingRoleId ? (
                <button type="button" className={styles.cancelInlineButton} onClick={resetRoleForm}>
                  Cancelar
                </button>
              ) : null}
            </header>
            <label>
              Nombre del rol
              <input value={roleName} onChange={(event) => setRoleName(event.target.value)} required />
            </label>
            <button className={styles.submitButton} type="submit" disabled={busyAction === "save-role"}>
              {busyAction === "save-role" ? "Guardando..." : editingRoleId ? "Actualizar rol" : "Crear rol"}
            </button>
          </form>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2>Asignación de roles a usuarios</h2>
            <span>{selectedUser ? selectedUser.email : "Selecciona un usuario"}</span>
          </header>

          <label className={styles.selectField}>
            Usuario objetivo
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
              <option value="">Selecciona un usuario</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          </label>

          {!selectedUser ? (
            <p className={styles.helperText}>Selecciona un usuario para administrar sus roles.</p>
          ) : (
            <>
              <div className={styles.selectionGrid}>
                {roles.map((role) => (
                  <label key={role.id} className={styles.selectionItem}>
                    <input
                      type="checkbox"
                      checked={assignedRoleIds.includes(role.id)}
                      onChange={() => toggleAssignedRole(role.id)}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
              <button className={styles.submitButton} type="button" onClick={() => void saveUserRoles()} disabled={busyAction === "assign-roles"}>
                {busyAction === "assign-roles" ? "Guardando..." : "Guardar roles del usuario"}
              </button>
            </>
          )}
        </article>
      </section>
    );
  }

  function renderPermissionsSection() {
    return (
      <section className={styles.managementGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2>Permisos</h2>
            <span>{permissions.length} disponibles</span>
          </header>

          <div className={styles.tagList}>
            {permissions.map((permission) => (
              <div key={permission.id} className={styles.tagCard}>
                <strong>{permission.name}</strong>
                <div className={styles.rowActions}>
                  <button type="button" onClick={() => { setEditingPermissionId(permission.id); setPermissionName(permission.name); }}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void handleDeletePermission(permission)}
                    disabled={busyAction === `delete-permission-${permission.id}`}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form className={styles.form} onSubmit={handleSubmitPermission}>
            <header className={styles.subsectionHeader}>
              <h3>{editingPermissionId ? "Editar permiso" : "Nuevo permiso"}</h3>
              {editingPermissionId ? (
                <button type="button" className={styles.cancelInlineButton} onClick={resetPermissionForm}>
                  Cancelar
                </button>
              ) : null}
            </header>
            <label>
              Nombre del permiso
              <input value={permissionName} onChange={(event) => setPermissionName(event.target.value)} required />
            </label>
            <button className={styles.submitButton} type="submit" disabled={busyAction === "save-permission"}>
              {busyAction === "save-permission" ? "Guardando..." : editingPermissionId ? "Actualizar permiso" : "Crear permiso"}
            </button>
          </form>
        </article>

        <article className={styles.panel}>
          <div className={styles.assignmentStack}>
            <section>
              <header className={styles.subsectionHeader}>
                <h3>Permisos directos por usuario</h3>
                <span>{selectedUser ? selectedUser.email : "Selecciona un usuario"}</span>
              </header>
              <label className={styles.selectField}>
                Usuario objetivo
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Selecciona un usuario</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </label>
              {selectedUser ? (
                <>
                  <div className={styles.selectionGrid}>
                    {permissions.map((permission) => (
                      <label key={permission.id} className={styles.selectionItem}>
                        <input
                          type="checkbox"
                          checked={assignedPermissionIds.includes(permission.id)}
                          onChange={() => toggleAssignedUserPermission(permission.id)}
                        />
                        <span>{permission.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className={styles.submitButton} type="button" onClick={() => void saveUserPermissions()} disabled={busyAction === "assign-user-permissions"}>
                    {busyAction === "assign-user-permissions" ? "Guardando..." : "Guardar permisos del usuario"}
                  </button>
                </>
              ) : (
                <p className={styles.helperText}>Selecciona un usuario para administrar sus permisos directos.</p>
              )}
            </section>

            <section>
              <header className={styles.subsectionHeader}>
                <h3>Permisos por rol</h3>
                <span>{selectedRole ? selectedRole.name : "Selecciona un rol"}</span>
              </header>
              <label className={styles.selectField}>
                Rol objetivo
                <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                  <option value="">Selecciona un rol</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedRole ? (
                <>
                  <div className={styles.selectionGrid}>
                    {permissions.map((permission) => (
                      <label key={permission.id} className={styles.selectionItem}>
                        <input
                          type="checkbox"
                          checked={assignedRolePermissionIds.includes(permission.id)}
                          onChange={() => toggleAssignedRolePermission(permission.id)}
                        />
                        <span>{permission.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className={styles.submitButton} type="button" onClick={() => void saveRolePermissions()} disabled={busyAction === "assign-role-permissions"}>
                    {busyAction === "assign-role-permissions" ? "Guardando..." : "Guardar permisos del rol"}
                  </button>
                </>
              ) : (
                <p className={styles.helperText}>Selecciona un rol para administrar sus permisos heredados.</p>
              )}
            </section>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className={styles.managementStack}>
      <div className={styles.toastViewport} aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast} data-kind={toast.kind}>
            {toast.text}
          </div>
        ))}
      </div>

      <header className={styles.managementHeader}>
        <div>
          <h2>{sectionCopy[section].title}</h2>
          <p>{sectionCopy[section].description}</p>
        </div>
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => void loadCoreData()}
          disabled={busyAction === "load"}
        >
          {busyAction === "load" ? "Actualizando..." : "Recargar"}
        </button>
      </header>

      {section === "users" && renderUsersSection()}
      {section === "roles" && renderRolesSection()}
      {section === "permissions" && renderPermissionsSection()}
    </section>
  );
}
