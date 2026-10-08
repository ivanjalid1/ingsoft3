import { test, expect } from '@playwright/test';
import { credenciales, obtenerToken, listarTodos, cabeceras, unico, API } from './helpers.js';

// Suite END-TO-END (TP7 §3.4): Chromium real contra el entorno desplegado.
// Se maneja la app como un usuario: por etiquetas y roles accesibles
// (getByLabel / getByRole), nunca por clases CSS ni ids. Sin page.route ni
// mocks: cada click pega a la API real y a la base real.
//
// La baja es LÓGICA (activo = 0): "desaparece" = deja de verse en el listado.

test.beforeEach(async ({ page }) => {
  const { email, password } = credenciales();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/productos$/);

  // Se arranca cada prueba con el listado YA cargado desde la API real, para
  // que las aserciones de "no aparece" no pasen contra una tabla vacía.
  const listado = page.waitForResponse((r) =>
    r.url().endsWith('/api/clientes') && r.request().method() === 'GET' && r.ok());
  await page.getByRole('link', { name: 'Clientes' }).click();
  await listado;
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
});

// Red de seguridad: si una prueba falla a mitad de camino (después del alta y
// antes de la baja), el cliente no queda ACTIVO en QA ensuciando el listado.
const creadosEnEstaPrueba = [];

test.afterEach(async ({ request }) => {
  if (creadosEnEstaPrueba.length === 0) return;
  const token = await obtenerToken(request);
  const todos = await listarTodos(request, token);
  for (const email of creadosEnEstaPrueba.splice(0)) {
    const pendiente = todos.find((c) => c.email === email && c.activo);
    if (pendiente) {
      await request.delete(`${API}/api/clientes/${pendiente.id}`, { headers: cabeceras(token) });
    }
  }
});

async function completarYGuardar(page, { nombre, email, telefono = '' }) {
  await page.getByLabel('Nombre').fill(nombre);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Teléfono').fill(telefono);
  await page.getByRole('button', { name: 'Guardar' }).click();
}

function filaDe(page, nombre) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: nombre, exact: true }) });
}

test('crear un cliente: aparece en el listado y al darlo de baja desaparece', async ({ page }) => {
  const datos = { ...unico('E2E Alta'), telefono: '3510000002' };
  creadosEnEstaPrueba.push(datos.email);

  await completarYGuardar(page, datos);

  const fila = filaDe(page, datos.nombre);
  await expect(fila).toBeVisible();
  await expect(fila.getByRole('cell', { name: datos.email, exact: true })).toBeVisible();
  // El formulario vuelve a quedar vacío tras un alta exitosa.
  await expect(page.getByLabel('Nombre')).toHaveValue('');

  await page.getByRole('button', { name: `Dar de baja ${datos.nombre}` }).click();
  await expect(fila).toHaveCount(0);
});

test('datos inválidos: el usuario ve el error y no se crea nada', async ({ page, request }) => {
  const { nombre } = unico('E2E Invalido');

  await completarYGuardar(page, { nombre, email: 'esto-no-es-un-email' });

  await expect(page.getByRole('alert')).toHaveText('El email tiene formato inválido');
  await expect(filaDe(page, nombre)).toHaveCount(0);

  // "No se creó nada" verificado contra el backend real, no solo contra la
  // pantalla: en el listado completo (incluye dados de baja) no hay ninguno.
  const token = await obtenerToken(request);
  const todos = await listarTodos(request, token);
  expect(todos.find((c) => c.nombre === nombre)).toBeUndefined();
});

test('flujo diario: el cliente creado sigue ahí después de recargar la página', async ({ page }) => {
  const datos = unico('E2E Persistencia');
  creadosEnEstaPrueba.push(datos.email);

  await completarYGuardar(page, datos);
  await expect(filaDe(page, datos.nombre)).toBeVisible();

  // Recargar = estado nuevo del navegador: lo que se ve sale de la base, no de
  // la memoria de React. La sesión sobrevive (token en localStorage).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await expect(filaDe(page, datos.nombre)).toBeVisible();

  await page.getByRole('button', { name: `Dar de baja ${datos.nombre}` }).click();
  await expect(filaDe(page, datos.nombre)).toHaveCount(0);

  // Y la baja también persiste: tras otra recarga sigue sin aparecer. Se
  // espera la respuesta real del listado antes de afirmar la ausencia; si no,
  // "0 filas" pasaría trivialmente con la tabla todavía sin cargar.
  const listado = page.waitForResponse((r) =>
    r.url().endsWith('/api/clientes') && r.request().method() === 'GET' && r.ok());
  await page.reload();
  await listado;
  await expect(filaDe(page, datos.nombre)).toHaveCount(0);
});
