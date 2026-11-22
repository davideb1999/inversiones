import { describe, expect, it } from 'vitest';
import { analyze } from './analyst';

const base = { price: 100, strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0, isEtf: false };

describe('analyze', () => {
  it('recomienda comprar con consenso alcista y recorrido', () => {
    const r = analyze({ ...base, targetPrice: 125, strongBuy: 10, buy: 8, hold: 3 });
    expect(r.verdict).toBe('comprar');
    expect(r.upside).toBeCloseTo(25);
    expect(r.analysts).toBe(21);
  });

  it('mantener si ya está cerca del objetivo', () => {
    expect(analyze({ ...base, targetPrice: 103, strongBuy: 5, buy: 10, hold: 5 }).verdict).toBe('mantener');
  });

  it('vender si el objetivo está muy por debajo', () => {
    expect(analyze({ ...base, targetPrice: 85, buy: 3, hold: 10, sell: 2 }).verdict).toBe('vender');
  });

  it('los ETF sin analistas se mantienen a largo plazo', () => {
    expect(analyze({ ...base, isEtf: true }).horizon).toBe('5 años o más');
  });

  it('sin datos no inventa veredicto', () => {
    expect(analyze(base).verdict).toBe('sin-datos');
  });
});
