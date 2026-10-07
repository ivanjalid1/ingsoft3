import { useEffect, useState } from 'react';
import { get } from '../api/client.js';

const VERSION_DESCONOCIDA = 'dev';

// Recorta el sha completo que inyecta el pipeline (APP_VERSION) a los 7
// caracteres de siempre de git. Si no vino nada útil, queda 'dev'.
function versionCorta(datos) {
  const version = datos?.version;
  if (typeof version !== 'string' || version.trim() === '') {
    return VERSION_DESCONOCIDA;
  }
  return version.trim().slice(0, 7);
}

// Pie visible en TODAS las pantallas (login incluido) que dice qué build está
// corriendo. Sirve para la demo del TP6: después de aprobar el deploy a PROD,
// se recarga la página y el sha cambia frente a los ojos del que aprueba.
// /api/health es público, así que se puede pedir sin sesión.
export default function PieVersion() {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    let activo = true;
    get('/health')
      .then((datos) => {
        if (activo) setVersion(versionCorta(datos));
      })
      .catch(() => {
        if (activo) setVersion(VERSION_DESCONOCIDA);
      });
    return () => {
      activo = false;
    };
  }, []);

  return (
    <footer className="pie-version">
      <span>ERP · TP6 · entorno de entrega continua</span>
      <span className="pie-version__sha mono" title="Versión desplegada (GET /api/health)">
        {version}
      </span>
    </footer>
  );
}
