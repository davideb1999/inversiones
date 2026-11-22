import { describe, expect, it } from 'vitest';
import { earningsDcf, targetStats, valuate } from './valuation';

describe('valuate', () => {
  it('calcula el número de Graham', () => {
    const v = valuate({ price: 100, eps: 5, bookValue: 20, pe: 20, peg: 2 });
    expect(v.models.find((m) => m.key === 'graham')!.value).toBeCloseTo(Math.sqrt(22.5 * 5 * 20), 1);
    // crecimiento = PER / PEG = 10 %
    expect(v.growth).toBe(10);
    expect(v.models.find((m) => m.key === 'graham-growth')!.value).toBe(5 * (8.5 + 20));
    expect(v.fairValue).toBeGreaterThan(0);
  });

  it('no valora empresas sin beneficios', () => {
    const v = valuate({ price: 100, eps: -1 });
    expect(v.models.length).toBe(0);
    expect(v.note).toBeTruthy();
  });

  it('veredicto según la distancia al valor razonable', () => {
    expect(valuate({ price: 10, eps: 5, pe: 2, peg: 0.5 }).verdict).toBe('infravalorada');
    expect(valuate({ price: 1000, eps: 1, pe: 1000, peg: 100 }).verdict).toBe('sobrevalorada');
  });

  it('el DCF crece con el crecimiento esperado', () => {
    expect(earningsDcf(5, 0.1)).toBeGreaterThan(earningsDcf(5, 0.02));
  });
});

describe('targetStats', () => {
  it('cuartiles con objetivos individuales e incertidumbre', () => {
    const s = targetStats(100, { low: 80, high: 160, mean: 120, median: 118 }, [80, 100, 110, 120, 130, 140, 160]);
    expect(s.p25).toBe(105);
    expect(s.p75).toBe(135);
    expect(s.upside).toBeCloseTo(20);
    expect(s.spread).toBe(80);
    expect(s.uncertainty).toBe('Media');
  });

  it('sin objetivos individuales no inventa cuartiles', () => {
    const s = targetStats(100, { low: 95, high: 110, mean: 104 });
    expect(s.p25).toBeUndefined();
    expect(s.uncertainty).toBe('Baja');
  });
});
