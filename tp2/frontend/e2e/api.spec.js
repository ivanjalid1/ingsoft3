import { test, expect } from '@playwright/test';
import { API, obtenerToken, cabeceras, listarTodos, unico } from './helpers.js';

// Suite de INTEGRACIÓN (TP7 §3.3): HTTP directo contra la API desplegada.
// Sin navegador y sin mocks: cada request atraviesa nginx → Express → MySQL de
// verdad. Lo que se verifica acá es lo que los tests unitarios (con la base
// simulada) no pueden ver: que el contrato HTTP y la base real coinciden.
//
// Semántica real del DELETE: es una BAJA LÓGICA (clienteModel.desactivar hace
// UPDATE clientes SET activo = 0; no hay DELETE físico en toda la app). Por eso
// "ya no lo encuentra" significa: no aparece en el listado de activos
// (GET /api/clientes) y GET /api/clientes/:id lo devuelve con activo: false.
// La fila queda en la base de QA como inactiva; los emails son únicos por
// corrida (Date.now()) así que no chocan entre ejecuciones.

let token;

test.beforeAll(async ({ request }) => {
  token = await obtenerToken(request);
});

function crearCliente(request, datos) {
  return request.post(`${API}/api/clientes`, { headers: cabeceras(token), data: datos });
}

function darDeBaja(request, id) {
  return request.delete(`${API}/api/clientes/${id}`, { headers: cabeceras(token) });
}

async function listarActivos(request) {
  const respuesta = await request.get(`${API}/api/clientes`, { headers: cabeceras(token) });
  expect(respuesta.status()).toBe(200);
  return respuesta.json();
}

test('alta de cliente: se crea, se lista, se da de baja y deja de listarse', async ({ request }) => {
  const datos = { ...unico('API Alta', 'api'), telefono: '3510000001' };

  const alta = await crearCliente(request, datos);
  expect(alta.status()).toBe(201);
  const creado = await alta.json();
  expect(creado).toMatchObject({ nombre: datos.nombre, email: datos.email, telefono: datos.telefono, activo: true });
  expect(Number.isInteger(creado.id)).toBe(true);

  // Persistió de verdad: un GET nuevo (otra request, otra query) lo encuentra.
  const activos = await listarActivos(request);
  expect(activos.find((c) => c.id === creado.id)).toMatchObject({ email: datos.email, activo: true });

  const baja = await darDeBaja(request, creado.id);
  expect(baja.status()).toBe(200);
  expect(await baja.json()).toEqual({ id: creado.id, activo: false });

  // Baja lógica: ya no está entre los activos...
  const activosDespues = await listarActivos(request);
  expect(activosDespues.find((c) => c.id === creado.id)).toBeUndefined();

  // ...y el detalle confirma que quedó inactivo (no borrado físicamente).
  const detalle = await request.get(`${API}/api/clientes/${creado.id}`, { headers: cabeceras(token) });
  expect(detalle.status()).toBe(200);
  expect((await detalle.json()).activo).toBe(false);
});

test('alta inválida: 400 DATOS_INVALIDOS y la base no cambia', async ({ request }) => {
  const antes = await listarTodos(request, token);
  const { nombre, email } = unico('API Invalido', 'api');

  // Nombre vacío con email válido: lo rechaza la validación del service.
  const sinNombre = await crearCliente(request, { nombre: '', email });
  expect(sinNombre.status()).toBe(400);
  expect((await sinNombre.json()).error).toMatchObject({
    code: 'DATOS_INVALIDOS', message: 'El nombre es obligatorio'
  });

  // Email mal formado con nombre válido.
  const emailMalo = await crearCliente(request, { nombre, email: 'no-es-un-email' });
  expect(emailMalo.status()).toBe(400);
  expect((await emailMalo.json()).error).toMatchObject({
    code: 'DATOS_INVALIDOS', message: 'El email tiene formato inválido'
  });

  // Contra el listado COMPLETO (incluye inactivos): no se insertó ninguna fila.
  const despues = await listarTodos(request, token);
  expect(despues.length).toBe(antes.length);
  expect(despues.find((c) => c.email === email || c.nombre === nombre)).toBeUndefined();
});

// Tercer caso (elección propia): EMAIL DUPLICADO.
// Por qué este: es la única regla que garantiza la BASE y no el código. El
// service hace una consulta previa para dar un 409 prolijo, pero la garantía
// real es el UNIQUE de clientes.email (y el service traduce ER_DUP_ENTRY a 409
// si dos altas entran a la vez). En los tests unitarios la base es un mock: ahí
// el UNIQUE no existe y este comportamiento no se puede probar. Solo contra
// MySQL real se ve que (1) la API responde 409 y no 500, y (2) queda UNA sola fila.
test('alta con email duplicado: 409 EMAIL_DUPLICADO y queda un solo cliente con ese email', async ({ request }) => {
  const datos = unico('API Duplicado', 'api');

  const primera = await crearCliente(request, datos);
  expect(primera.status()).toBe(201);
  const creado = await primera.json();

  try {
    const segunda = await crearCliente(request, { nombre: `${datos.nombre} (otro)`, email: datos.email });
    expect(segunda.status()).toBe(409);
    expect((await segunda.json()).error.code).toBe('EMAIL_DUPLICADO');

    const conEseEmail = (await listarTodos(request, token)).filter((c) => c.email === datos.email);
    expect(conEseEmail).toHaveLength(1);
    expect(conEseEmail[0]).toMatchObject({ id: creado.id, nombre: datos.nombre });
  } finally {
    // Limpieza aunque falle una aserción del medio: el cliente no queda activo en QA.
    const baja = await darDeBaja(request, creado.id);
    expect(baja.status()).toBe(200);
  }

  const activos = await listarActivos(request);
  expect(activos.find((c) => c.id === creado.id)).toBeUndefined();
});
