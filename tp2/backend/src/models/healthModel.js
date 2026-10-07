import { pool } from '../config/db.js';

// Consulta una tabla REAL del esquema (no un "SELECT 1"): así el health check
// prueba que MySQL responde, que la base existe y que init.sql corrió.
// Si algo de eso falla, la promesa se rechaza y quien llama decide qué mostrar.
export async function verificarEsquema() {
  await pool.query('SELECT COUNT(*) AS n FROM productos');
}
