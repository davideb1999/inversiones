import { describe, expect, it } from 'vitest';
import { rescuePlan, salesOf, savingsTax, yearSummary } from './tax';
import { Asset } from './models';

function asset(movements: Asset['movements'], extra: Partial<Asset> = {}): Asset {
  return { id: 'a', name: 'Test', type: 'accion', currency: 'EUR', movements, valuations: [], createdAt: '', ...extra };
}

describe('savingsTax (tramos del ahorro)', () => {
  it('19 % hasta 6.000 €', () => expect(savingsTax(6000)).toBe(1140));
  it('21 % entre 6.000 y 50.000 €', () => expect(savingsTax(10000)).toBe(1140 + 840));
  it('progresivo hasta el 30 %', () => {
    // 6000*.19 + 44000*.21 + 150000*.23 + 100000*.27 + 100000*.30
    expect(savingsTax(400000)).toBe(1140 + 9240 + 34500 + 27000 + 30000);
  });
  it('sin ganancia no hay impuesto', () => expect(savingsTax(-50)).toBe(0));
});

describe('rescuePlan', () => {
  it('repartir el rescate en varios años ahorra impuestos', () => {
    const p = rescuePlan(30000, 5);
    expect(p.perYear).toBe(6000);
    expect(p.spread).toBe(5 * 1140);
    expect(p.saving).toBeGreaterThan(0);
  });
});

describe('salesOf (FIFO)', () => {
  it('vende primero las participaciones más antiguas', () => {
    const s = salesOf(
      asset([
        { id: '1', date: '2025-01-10', kind: 'aportacion', amount: 1000, shares: 10 },
        { id: '2', date: '2025-06-10', kind: 'aportacion', amount: 2000, shares: 10 },
        { id: '3', date: '2026-03-10', kind: 'retirada', amount: 1800, shares: 15 },
      ]),
    );
    // coste = 1000 (10 primeras) + 1000 (5 de 2000/10)
    expect(s[0]).toMatchObject({ cost: 2000, gain: -200, washSale: false, missingData: false });
  });

  it('detecta pérdidas con recompra en 2 meses', () => {
    const s = salesOf(
      asset([
        { id: '1', date: '2025-01-10', kind: 'aportacion', amount: 1000, shares: 10 },
        { id: '2', date: '2026-03-10', kind: 'retirada', amount: 800, shares: 10 },
        { id: '3', date: '2026-04-01', kind: 'aportacion', amount: 800, shares: 10 },
      ]),
    );
    expect(s[0].washSale).toBe(true);
  });

  it('en activos con equivalente usa las participaciones reales del bróker', () => {
    const s = salesOf(
      asset(
        [
          { id: '1', date: '2025-01-10', kind: 'aportacion', amount: 1000, shares: 3, realShares: 10 },
          { id: '2', date: '2026-03-10', kind: 'retirada', amount: 600, shares: 1.5, realShares: 5 },
        ],
        { tracking: { name: 'VT', how: 'tabla' } },
      ),
    );
    expect(s[0]).toMatchObject({ cost: 500, gain: 100 });
  });

  it('no aplaza la pérdida si vendes justo lo que compraste (sin recompra)', () => {
    const s = salesOf(
      asset([
        { id: '1', date: '2026-05-08', kind: 'aportacion', amount: 200.96, shares: 1.8716 },
        { id: '2', date: '2026-05-28', kind: 'retirada', amount: 192.67, shares: 1.8716 },
      ]),
    );
    expect(s[0]).toMatchObject({ gain: -8.29, washSale: false });
  });

  it('aplaza la pérdida si conservas participaciones compradas en los 2 meses anteriores', () => {
    const s = salesOf(
      asset([
        { id: '1', date: '2025-01-10', kind: 'aportacion', amount: 1000, shares: 10 },
        { id: '2', date: '2026-02-20', kind: 'aportacion', amount: 500, shares: 10 },
        { id: '3', date: '2026-03-10', kind: 'retirada', amount: 600, shares: 10 },
      ]),
    );
    expect(s[0]).toMatchObject({ gain: -400, washSale: true });
  });

  it('marca las ventas sin participaciones', () => {
    const s = salesOf(asset([{ id: '1', date: '2025-01-10', kind: 'aportacion', amount: 1000 }, { id: '2', date: '2026-01-10', kind: 'retirada', amount: 500 }]));
    expect(s[0].missingData).toBe(true);
  });
});

describe('yearSummary', () => {
  it('compensa pérdidas con hasta el 25 % de los dividendos', () => {
    const a = asset([
      { id: '1', date: '2025-01-10', kind: 'aportacion', amount: 1000, shares: 10 },
      { id: '2', date: '2026-05-10', kind: 'retirada', amount: 600, shares: 10 },
    ]);
    const y = yearSummary(2026, [a], [{ id: 'd', date: '2026-06-01', isin: 'X', name: 'X', gross: 400, withheld: 0, currency: 'EUR' }]);
    expect(y.netGains).toBe(-400);
    expect(y.base).toBe(300); // 400 - 25 % de 400
    expect(y.lossesToCarry).toBe(300);
    expect(y.tax).toBe(57);
  });
});
