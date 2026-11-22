import { describe, expect, it } from 'vitest';
import { align, backtest, rank, UNIVERSE, BENCHMARK } from './quant';
import { PricePoint } from './market-data.service';

/** Serie sintética: crecimiento diario constante con algo de ruido determinista. */
function series(days: number, daily: number, noise = 0.01): PricePoint[] {
  const out: PricePoint[] = [];
  let p = 100;
  const t0 = new Date('2023-01-02T00:00:00').getTime();
  for (let i = 0; i < days; i++) {
    p *= 1 + daily + noise * Math.sin(i * 1.7);
    out.push({ t: t0 + i * 86_400_000, close: p });
  }
  return out;
}

describe('modelo de tendencia', () => {
  const s: Record<string, PricePoint[]> = { [BENCHMARK]: series(700, 0.0003) };
  UNIVERSE.forEach((u, k) => (s[u.symbol] = series(700, k === 0 ? 0.002 : k === 1 ? -0.001 : 0.0002)));
  const a = align(s);

  it('pone primero al que sube de forma sostenida y último al que baja', () => {
    const r = rank(a, a.dates.length - 1, 'anual');
    expect(r[0].symbol).toBe(UNIVERSE[0].symbol);
    expect(r.at(-1)!.symbol).toBe(UNIVERSE[1].symbol);
  });

  it('no mira el futuro: el ranking en una fecha no cambia si se añaden días después', () => {
    const i = 400;
    const cut: Record<string, PricePoint[]> = {};
    for (const [k, v] of Object.entries(s)) cut[k] = v.slice(0, i + 1);
    const full = rank(a, i, 'mensual').map((p) => p.symbol);
    const past = rank(align(cut), i, 'mensual').map((p) => p.symbol);
    expect(past).toEqual(full);
  });

  it('simula el último año y compara con el mercado', () => {
    const b = backtest(a, 'mensual')!;
    expect(b.periods.length).toBeGreaterThan(10);
    expect(b.totalReturn).toBeGreaterThan(b.marketReturn);
    expect(backtest(a, 'anual')!.periods.length).toBe(1);
  });
});
