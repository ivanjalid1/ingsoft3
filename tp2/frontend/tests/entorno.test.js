import { describe, it, expect } from 'vitest';
import { entornoDesdeHostname } from '../src/utils/entorno.js';

describe('entornoDesdeHostname', () => {
  it('devuelve "QA" si el hostname empieza con "qa."', () => {
    expect(entornoDesdeHostname('qa.erp.example.com')).toBe('QA');
  });

  it('devuelve "PROD" si el hostname empieza con "prod."', () => {
    expect(entornoDesdeHostname('prod.erp.example.com')).toBe('PROD');
  });

  it('devuelve "LOCAL" para cualquier otro hostname', () => {
    expect(entornoDesdeHostname('localhost')).toBe('LOCAL');
    expect(entornoDesdeHostname('127.0.0.1')).toBe('LOCAL');
    expect(entornoDesdeHostname('qaprod.example.com')).toBe('LOCAL');
  });

  it('no distingue mayúsculas en el prefijo', () => {
    expect(entornoDesdeHostname('QA.erp.example.com')).toBe('QA');
    expect(entornoDesdeHostname('Prod.erp.example.com')).toBe('PROD');
  });

  it('devuelve "LOCAL" si el hostname no es un string útil', () => {
    expect(entornoDesdeHostname(undefined)).toBe('LOCAL');
    expect(entornoDesdeHostname(null)).toBe('LOCAL');
    expect(entornoDesdeHostname('')).toBe('LOCAL');
  });
});
