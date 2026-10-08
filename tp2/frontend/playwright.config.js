import { defineConfig, devices } from '@playwright/test';

// Playwright (TP7): dos suites contra un entorno REAL (QA en el pipeline, el
// compose local en la máquina de desarrollo). Nada de mocks: si la base, el
// proxy de nginx o el backend fallan, estas pruebas lo ven.
//
//   e2e/api.spec.js       → integración: HTTP directo contra la API, sin navegador.
//   e2e/clientes.spec.js  → end-to-end: Chromium manejado como un usuario.
//
// Host único: el backend no se publica aparte, se llega a la API por el mismo
// host del front en /api (nginx hace de proxy). Por eso API_BASE_URL y
// E2E_BASE_URL valen lo mismo (https://qa.testingwebapp.site en CI y
// http://localhost:8080 con el docker compose local).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Un solo worker: todas las pruebas comparten la MISMA base real, y la de
  // "alta inválida" compara cantidades del listado. En paralelo, un alta de
  // otra prueba podría cambiar ese conteo en el medio (falso rojo).
  workers: 1,
  // Reintentos como guarda a nivel de RED (corrida 37833222579: el page.goto
  // del runner a QA quedó colgado 60s sin que ningún request llegara al VPS;
  // al re-correr pasó). No es por arranque en frío: en el VPS los contenedores
  // están siempre prendidos. Ojo: una prueba que pasa solo en el reintento
  // aparece como "flaky" en el reporte, y eso hay que mirarlo, no ignorarlo.
  retries: process.env.CI ? 2 : 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    // Una navegación colgada falla en 20s en vez de comerse los 60s del test:
    // así el reintento entra dentro del timeout y no se pierde todo el intento.
    navigationTimeout: 20_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
