import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MunicipalConfigPanel } from './municipal-config-panel';

const { list, save } = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/services/municipal-config.service', () => ({
  municipalConfigService: { list, save },
}));

describe('MunicipalConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue([]);
    save.mockImplementation(async (payload) => payload);
  });

  it('creates a municipality and persists its area catalog', async () => {
    render(<MunicipalConfigPanel />);
    await screen.findByText('No hay municipios configurados.');

    fireEvent.change(screen.getByLabelText('Identificador municipal (slug)'), {
      target: { value: 'funes' },
    });
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Funes' },
    });
    fireEvent.change(screen.getByLabelText('Nueva área'), {
      target: { value: 'Alumbrado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar área' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'funes',
        name: 'Funes',
        areas: [
          expect.objectContaining({
            slug: 'alumbrado',
            name: 'Alumbrado',
            isActive: true,
          }),
        ],
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Configuración municipal guardada.',
    );
  });
});