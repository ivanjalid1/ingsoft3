import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as healthModel from '../src/models/healthModel.js';

// La base está mockeada: estos tests prueban el contrato HTTP de los health
// checks (públicos, sin token, sin filtrar detalles del error), no MySQL.
vi.mock('../src/models/healthModel.js', () => ({
  verificarEsquema: vi.fn()
}));

describe('GET /api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('responde 200 sin token e informa la versión desplegada (APP_VERSION)', async () => {
    // Arrange
    vi.stubEnv('APP_VERSION', 'abc123');

    // Act
    const res = await request(app).get('/api/health');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'abc123' });
  });

  it('informa version "dev" cuando APP_VERSION no está definida', async () => {
    // Arrange
    vi.stubEnv('APP_VERSION', '');

    // Act
    const res = await request(app).get('/api/health');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'dev' });
  });

  it('no toca la base de datos (solo prueba que el proceso está vivo)', async () => {
    // Act
    await request(app).get('/api/health');

    // Assert
    expect(healthModel.verificarEsquema).not.toHaveBeenCalled();
  });
});

describe('GET /api/health/db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responde 200 sin token cuando el esquema responde', async () => {
    // Arrange
    healthModel.verificarEsquema.mockResolvedValue(undefined);

    // Act
    const res = await request(app).get('/api/health/db');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    expect(healthModel.verificarEsquema).toHaveBeenCalledTimes(1);
  });

  it('responde 503 sin filtrar el detalle del error cuando la base falla', async () => {
    // Arrange
    healthModel.verificarEsquema.mockRejectedValue(
      new Error("Table 'erp.productos' doesn't exist")
    );

    // Act
    const res = await request(app).get('/api/health/db');

    // Assert
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'error' });
    expect(JSON.stringify(res.body)).not.toContain('productos');
  });
});

describe('GET /health (histórico, fuera de /api)', () => {
  it('sigue respondiendo 200 con status ok', async () => {
    // Act
    const res = await request(app).get('/health');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('rutas protegidas', () => {
  it('el resto de /api sigue pidiendo token', async () => {
    // Act
    const res = await request(app).get('/api/productos');

    // Assert
    expect(res.status).toBe(401);
  });
});
