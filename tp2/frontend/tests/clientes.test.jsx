import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Clientes from '../src/pages/Clientes.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CLAVE_TOKEN } from '../src/api/client.js';

function respuestaOk(datos) {
  return { ok: true, status: 200, text: async () => JSON.stringify(datos) };
}

function renderizarClientes() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Clientes />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Pantalla de clientes', () => {
  beforeEach(() => {
    localStorage.setItem(CLAVE_TOKEN, 'token-de-prueba');
    vi.stubGlobal('fetch', vi.fn(async () => respuestaOk([
      { id: 1, nombre: 'Ana Pérez', email: 'ana@mail.com', telefono: '111', activo: true }
    ])));
  });

  it('no envía el formulario con el email vacío o mal formado: muestra el error y no llama a la API', async () => {
    const usuario = userEvent.setup();
    renderizarClientes();

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);

    await usuario.type(screen.getByLabelText(/nombre/i), 'Beto Gómez');
    await usuario.type(screen.getByLabelText(/email/i), 'beto-arroba-mal');
    await usuario.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/email tiene formato inválido/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('no envía el formulario con el nombre vacío: muestra el error y no llama a la API', async () => {
    const usuario = userEvent.setup();
    renderizarClientes();

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);

    await usuario.type(screen.getByLabelText(/email/i), 'beto@mail.com');
    await usuario.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/nombre es obligatorio/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('con datos válidos sí llama a la API', async () => {
    const usuario = userEvent.setup();
    renderizarClientes();

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();

    await usuario.type(screen.getByLabelText(/nombre/i), 'Beto Gómez');
    await usuario.type(screen.getByLabelText(/email/i), 'beto@mail.com');
    await usuario.type(screen.getByLabelText(/teléfono/i), '222');
    await usuario.click(screen.getByRole('button', { name: /guardar/i }));

    // 1 = GET inicial, 2 = POST, 3 = GET de recarga del listado.
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toBe('/api/clientes');
    expect(fetch.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      nombre: 'Beto Gómez', email: 'beto@mail.com', telefono: '222'
    });
  });

  // Regresión TP7 (corrida 37839260057): el listado leía cliente.correo en vez de
  // cliente.email y la celda quedaba vacía. La e2e lo detectó primero; este test
  // lo atrapa también a nivel unitario.
  it('muestra el email de cada cliente listado en su fila', async () => {
    renderizarClientes();

    const celdaNombre = await screen.findByRole('cell', { name: 'Ana Pérez' });
    const fila = celdaNombre.closest('tr');
    expect(within(fila).getByRole('cell', { name: 'ana@mail.com' })).toBeInTheDocument();
  });

  // Accesibilidad (TP7): con varias filas, "Dar de baja" a secas es ambiguo para
  // un lector de pantalla y para un test e2e. Cada botón nombra a SU cliente.
  it('cada fila tiene botones con nombre accesible propio y dar de baja pega al cliente correcto', async () => {
    const usuario = userEvent.setup();
    renderizarClientes();

    expect(await screen.findByRole('button', { name: 'Editar Ana Pérez' })).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Dar de baja Ana Pérez' }));

    // 1 = GET inicial, 2 = DELETE, 3 = GET de recarga del listado.
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toBe('/api/clientes/1');
    expect(fetch.mock.calls[1][1].method).toBe('DELETE');
  });
});
