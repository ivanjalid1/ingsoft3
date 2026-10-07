import { Router } from 'express';
import { verificarToken } from '../middlewares/auth.js';
import authRoutes from './authRoutes.js';
import healthRoutes from './healthRoutes.js';
import clienteRoutes from './clienteRoutes.js';
import productoRoutes from './productoRoutes.js';
import ventaRoutes from './ventaRoutes.js';

const router = Router();

// Públicos: login y health checks son lo único a lo que se llega sin token.
// Los health checks van por /api para que se puedan probar desde afuera a
// través del proxy del frontend (el backend no se publica en el VPS).
router.use('/auth', authRoutes);
router.use('/health', healthRoutes);

// De acá para abajo, todo pide token. El middleware se monta una sola vez:
// cualquier router nuevo que se agregue debajo queda protegido sin hacer nada.
router.use(verificarToken);

router.use('/clientes', clienteRoutes);
router.use('/productos', productoRoutes);
router.use('/ventas', ventaRoutes);

export default router;
