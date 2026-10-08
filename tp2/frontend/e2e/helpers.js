// Utilidades compartidas por las dos suites de Playwright (no es una spec:
// Playwright solo levanta archivos *.spec.js como pruebas).

export const API = process.env.API_BASE_URL || 'http://localhost:8080';

// Credenciales del usuario de prueba. En CI salen de vars.QA_E2E_USER y
// secrets.QA_E2E_PASSWORD; ese usuario existe SOLO en la base de QA.
// Si faltan, se corta con un mensaje claro en vez de un 401 confuso.
export function credenciales() {
  const email = process.env.QA_E2E_USER;
  const password = process.env.QA_E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Faltan las variables de entorno QA_E2E_USER y/o QA_E2E_PASSWORD ' +
      '(usuario de prueba con el que las suites hacen login).'
    );
  }
  return { email, password };
}

// Login real contra POST /api/auth/login → token JWT.
export async function obtenerToken(request) {
  const respuesta = await request.post(`${API}/api/auth/login`, { data: credenciales() });
  if (respuesta.status() !== 200) {
    throw new Error(`El login del usuario de prueba devolvió ${respuesta.status()}: ${await respuesta.text()}`);
  }
  const { token } = await respuesta.json();
  return token;
}

export function cabeceras(token) {
  return { Authorization: `Bearer ${token}` };
}

// Listado COMPLETO (activos + dados de baja): la única forma de afirmar que
// "no se creó nada", porque un cliente dado de baja no aparece en el listado normal.
export async function listarTodos(request, token) {
  const respuesta = await request.get(`${API}/api/clientes?incluir_inactivos=true`, {
    headers: cabeceras(token)
  });
  if (respuesta.status() !== 200) {
    throw new Error(`GET /api/clientes devolvió ${respuesta.status()}`);
  }
  return respuesta.json();
}

// Nombre y email únicos por corrida: las pruebas corren contra una base
// compartida y persistente (QA), así que nunca reutilizan datos de otra corrida.
export function unico(prefijo, origen = 'e2e') {
  const marca = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return { nombre: `${prefijo} ${marca}`, email: `${origen}-${marca}@e2e.local` };
}
