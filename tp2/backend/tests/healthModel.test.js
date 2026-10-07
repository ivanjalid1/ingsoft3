import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mockeamos el pool de conexión (config/db.js) para no necesitar MySQL real.
vi.mock('../src/config/db.js', () => ({
  pool: {
    query: vi.fn(),
    execute: vi.fn()
  }
}));

const { pool } = await import('../src/config/db.js');
const healthModel = await import('../src/models/healthModel.js');

describe('healthModel.verificarEsquema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consulta una tabla real del esquema (no un simple SELECT 1)', async () => {
    // Arrange
    pool.query.mockResolvedValue([[{ n: 3 }]]);

    // Act
    await healthModel.verificarEsquema();

    // Assert
    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/FROM productos/));
  });

  it('propaga el error si la base o la tabla no existen', async () => {
    // Arrange
    pool.query.mockRejectedValue(new Error('ER_NO_SUCH_TABLE'));

    // Act + Assert
    await expect(healthModel.verificarEsquema()).rejects.toThrow('ER_NO_SUCH_TABLE');
  });
});
