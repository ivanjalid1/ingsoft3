import { Router } from 'express';
import * as healthModel from '../models/healthModel.js';

const router = Router();

// Qué commit está corriendo. En el VPS el compose inyecta APP_VERSION con el
// sha desplegado; el smoke test del pipeline lo compara con el sha esperado.
function versionActual() {
  return process.env.APP_VERSION || 'dev';
}

// Liveness: el proceso está vivo. No toca la base a propósito.
router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', version: versionActual() });
});

// Readiness de la base: MySQL responde y el esquema existe. Ante un error
// devuelve 503 SIN el detalle (no se filtran nombres de tablas ni de hosts
// en un endpoint público).
router.get('/db', async (req, res) => {
  try {
    await healthModel.verificarEsquema();
    res.status(200).json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', db: 'error' });
  }
});

export default router;
