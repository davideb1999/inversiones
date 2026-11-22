import { describe, expect, it } from 'vitest';
import { indexEquivalent } from './equivalents';
import { annualized, manualValueAt } from './portfolio.service';
import { extractJson, stripJson } from './ai.service';
import { renderMarkdown } from '../shared/format';
import { Asset, addDays, today } from './models';

function asset(partial: Partial<Asset>): Asset {
  return { id: 'a', name: 'Test', type: 'fondo', currency: 'EUR', movements: [], valuations: [], createdAt: '', ...partial };
}

describe('annualized (TIR)', () => {
  it('devuelve ~10 % si 1000 € pasan a 1100 € en un año', () => {
    const r = annualized([{ date: addDays(today(), -365), amount: -1000 }], 1100);
    expect(r).toBeCloseTo(10, 0);
  });

  it('no calcula nada con menos de 3 meses', () => {
    expect(annualized([{ date: addDays(today(), -30), amount: -1000 }], 1100)).toBeUndefined();
  });

  it('es negativa si se pierde dinero', () => {
    const r = annualized([{ date: addDays(today(), -730), amount: -1000 }], 810);
    expect(r).toBeCloseTo(-10, 0);
  });
});

describe('manualValueAt', () => {
  const a = asset({
    movements: [
      { id: '1', date: '2024-01-01', kind: 'aportacion', amount: 1000 },
      { id: '2', date: '2024-06-01', kind: 'aportacion', amount: 500 },
      { id: '3', date: '2024-09-01', kind: 'retirada', amount: 200 },
    ],
    valuations: [{ date: '2024-05-01', value: 1100 }],
  });

  it('sin valoración usa lo aportado', () => {
    expect(manualValueAt(a, '2024-02-01')).toBe(1000);
  });

  it('suma movimientos posteriores a la última valoración', () => {
    expect(manualValueAt(a, '2024-07-01')).toBe(1600);
    expect(manualValueAt(a, '2024-12-01')).toBe(1400);
  });
});

describe('extractJson', () => {
  it('lee el último bloque json', () => {
    const text = 'Resumen del mercado.\n```json\n{"ideas":[{"symbol":"VOO"}]}\n```';
    expect(extractJson<{ ideas: { symbol: string }[] }>(text).ideas[0].symbol).toBe('VOO');
    expect(stripJson(text)).toBe('Resumen del mercado.');
  });

  it('acepta JSON sin bloque', () => {
    expect(extractJson<{ a: number }>('Aquí va: {"a": 1}').a).toBe(1);
  });

  it('lanza un error claro si no hay JSON', () => {
    expect(() => extractJson('nada')).toThrow(/formato inesperado/);
  });
});

describe('renderMarkdown', () => {
  it('escapa HTML y da formato básico', () => {
    const html = renderMarkdown('### Hola\n- **uno**\n- <script>x</script>');
    expect(html).toContain('<h4>Hola</h4>');
    expect(html).toContain('<strong>uno</strong>');
    expect(html).not.toContain('<script>');
  });
});

describe('indexEquivalent', () => {
  it('reconoce el índice en el nombre del ETF', () => {
    expect(indexEquivalent('Amundi MSCI World Swap UCITS ETF EUR Acc', 'ETF')).toBe('URTH');
    expect(indexEquivalent('MSCI World EUR (Acc)', 'FUND')).toBe('URTH');
    expect(indexEquivalent('iShares Core S&P 500 UCITS ETF', 'ETF')).toBe('VOO');
    expect(indexEquivalent('Vanguard FTSE All-World UCITS ETF', 'ETF')).toBe('VT');
    expect(indexEquivalent('iShares MSCI World Small Cap UCITS ETF', 'ETF')).toBe('VSS');
    expect(indexEquivalent('Xtrackers MSCI Emerging Markets', 'ETF')).toBe('IEMG');
  });

  it('no confunde acciones normales', () => {
    expect(indexEquivalent('Intel Corporation', 'Common Stock')).toBeUndefined();
  });
});
