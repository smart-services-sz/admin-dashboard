import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AuditLogsPanel } from './audit-logs-panel';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/services/audit.service', () => ({
  auditService: { list },
}));

const entry = {
  id: 'log-1',
  eventId: 'event-1',
  service: 'ms-auth',
  action: 'USER_UPDATED',
  entity: 'User',
  entityId: 'user-1',
  performedBy: 'admin-1',
  municipalityId: 'funes',
  correlationId: 'correlation-1',
  level: 'INFO' as const,
  createdAt: '2026-10-16T10:00:00.000Z',
  metadata: { changedFields: ['name'] },
};

const response = (currentPage = 1) => ({
  data: [entry],
  meta: { totalItems: 26, itemsPerPage: 25, currentPage, totalPages: 2 },
});

describe('AuditLogsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(response());
  });

  it('loads a page and reveals metadata only when requested', async () => {
    render(<AuditLogsPanel />);
    expect(await screen.findByText('USER_UPDATED')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 25 });
    expect(screen.getByText('admin-1')).toBeInTheDocument();
    expect(screen.getByText('funes')).toBeInTheDocument();
    const details = screen.getByText('Ver detalle').closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Ver detalle'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText(/changedFields/)).toBeInTheDocument();
  });

  it('applies service, level, municipality and date filters then paginates', async () => {
    render(<AuditLogsPanel />);
    await screen.findByText('USER_UPDATED');
    fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 'ms-auth' } });
    fireEvent.change(screen.getByLabelText('Nivel'), { target: { value: 'SECURITY' } });
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: 'funes' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({
      service: 'ms-auth', level: 'SECURITY', municipalityId: 'funes',
      from: '2026-10-15', page: 1, limit: 25,
    }));

    list.mockResolvedValue(response(2));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({
      service: 'ms-auth', level: 'SECURITY', municipalityId: 'funes',
      from: '2026-10-15', page: 2, limit: 25,
    }));
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('shows a recoverable error without displaying payload data', async () => {
    list.mockRejectedValueOnce(new Error('Gateway unavailable'));
    render(<AuditLogsPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gateway unavailable');
    expect(screen.queryByText('USER_UPDATED')).not.toBeInTheDocument();
  });
});