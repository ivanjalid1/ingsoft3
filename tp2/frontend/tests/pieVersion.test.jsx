import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PieVersion from '../src/components/PieVersion.jsx';

function respuesta(status, cuerpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo))
  };
}

describe('PieVersion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('muestra el texto fijo del entorno de entrega continua', async () => {
    fetch.mockResolvedValue(respuesta(200, { status: 'ok', version: 'dev' }));
    render(<PieVersion />);

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'ERP · TP6 · entorno de entrega continua'
    );
    expect(await screen.findByText('dev')).toBeInTheDocument();
  });

  it('pide la versión a /api/health y muestra los primeros 7 caracteres del sha', async () => {
    fetch.mockResolvedValue(
      respuesta(200, { status: 'ok', version: '9fc7c88a1b2c3d4e5f60718293a4b5c6d7e8f901' })
    );
    render(<PieVersion />);

    expect(await screen.findByText('9fc7c88')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/health');
  });

  it('muestra "dev" si el fetch falla (backend caído)', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<PieVersion />);

    expect(await screen.findByText('dev')).toBeInTheDocument();
  });

  it('muestra "dev" si el backend responde con error', async () => {
    fetch.mockResolvedValue(respuesta(502));
    render(<PieVersion />);

    expect(await screen.findByText('dev')).toBeInTheDocument();
  });

  it('muestra "dev" si la respuesta no trae versión', async () => {
    fetch.mockResolvedValue(respuesta(200, { status: 'ok' }));
    render(<PieVersion />);

    expect(await screen.findByText('dev')).toBeInTheDocument();
  });
});
