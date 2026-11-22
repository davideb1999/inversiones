/**
 * Modelos de valoración ("valor razonable") sencillos y conocidos, a partir de datos públicos.
 * Cada uno es una estimación distinta; la media da una idea de si el precio parece caro o barato.
 */

export interface ValuationInput {
  price: number;
  eps?: number; // beneficio por acción (12 meses)
  bookValue?: number; // valor contable por acción
  pe?: number;
  peg?: number;
}

export interface ValuationModel {
  key: string;
  name: string;
  value: number;
  upside: number; // %
  explain: string;
}

export interface Valuation {
  models: ValuationModel[];
  fairValue?: number;
  upside?: number;
  verdict?: 'infravalorada' | 'justa' | 'sobrevalorada';
  growth?: number; // % anual usado
  note?: string;
}

/** Rentabilidad que se exige a una acción (coste de oportunidad) y crecimiento a perpetuidad. */
const DISCOUNT = 0.09;
const TERMINAL_GROWTH = 0.025;
const MARKET_PE = 20;

export function valuate(i: ValuationInput): Valuation {
  const models: ValuationModel[] = [];
  const add = (key: string, name: string, value: number, explain: string) => {
    if (!isFinite(value) || value <= 0) return;
    models.push({ key, name, value: round2(value), upside: (value / i.price - 1) * 100, explain });
  };

  if (!i.eps || i.eps <= 0) {
    return {
      models: [],
      note: 'La empresa no tiene beneficios ahora mismo, así que los modelos basados en beneficios no sirven para valorarla.',
    };
  }

  // Crecimiento esperado por los analistas: PER / PEG (el PEG es el PER dividido entre el crecimiento).
  const growth = i.pe && i.peg && i.peg > 0 ? clamp(i.pe / i.peg, 0, 20) : 5;

  if (i.bookValue && i.bookValue > 0) {
    add(
      'graham',
      'Número de Graham',
      Math.sqrt(22.5 * i.eps * i.bookValue),
      'Precio máximo que pagaría un inversor prudente según Benjamin Graham, combinando beneficios y lo que vale la empresa en libros.',
    );
  }
  add(
    'graham-growth',
    'Fórmula de crecimiento de Graham',
    i.eps * (8.5 + 2 * growth),
    `Beneficios actuales multiplicados por un PER que depende de cuánto se espera que crezcan (${growth.toFixed(1)} % al año).`,
  );
  add('dcf', 'Descuento de beneficios (10 años)', earningsDcf(i.eps, growth / 100), `Suma lo que ganará en los próximos 10 años (creciendo ${growth.toFixed(1)} % y luego menos) traído a dinero de hoy con un 9 % de rentabilidad exigida.`);
  add('market-pe', 'PER medio del mercado', i.eps * MARKET_PE, `Lo que valdría si cotizara al PER medio histórico del S&P 500 (unas ${MARKET_PE} veces sus beneficios).`);

  if (!models.length) return { models };
  // Mediana: un modelo extremo no tira demasiado del resultado.
  const sorted = models.map((m) => m.value).sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const fairValue = round2(sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2);
  const upside = (fairValue / i.price - 1) * 100;
  return {
    models,
    fairValue,
    upside,
    growth,
    verdict: upside > 15 ? 'infravalorada' : upside < -15 ? 'sobrevalorada' : 'justa',
  };
}

/** DCF de beneficios: 5 años al crecimiento esperado, 5 años a la mitad, y valor terminal. */
export function earningsDcf(eps: number, g: number): number {
  let value = 0;
  let e = eps;
  for (let t = 1; t <= 10; t++) {
    e *= 1 + (t <= 5 ? g : g / 2);
    value += e / Math.pow(1 + DISCOUNT, t);
  }
  const terminal = (e * (1 + TERMINAL_GROWTH)) / (DISCOUNT - TERMINAL_GROWTH);
  return value + terminal / Math.pow(1 + DISCOUNT, 10);
}

export interface TargetStats {
  low: number;
  high: number;
  mean: number;
  median?: number;
  p25?: number;
  p75?: number;
  count?: number;
  upside: number; // % de la media sobre el precio
  spread: number; // máximo − mínimo
  spreadPct: number; // spread sobre la media
  uncertainty: 'Baja' | 'Media' | 'Alta';
}

/** Estadísticas del rango de precios objetivo de los analistas. */
export function targetStats(price: number, t: { low: number; high: number; mean: number; median?: number }, individual: number[] = []): TargetStats {
  const sorted = [...individual].filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p: number) => {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
  };
  const hasQuartiles = sorted.length >= 4;
  const spread = t.high - t.low;
  const spreadPct = (spread / t.mean) * 100;
  return {
    ...t,
    p25: hasQuartiles ? round2(q(0.25)) : undefined,
    p75: hasQuartiles ? round2(q(0.75)) : undefined,
    count: sorted.length || undefined,
    upside: (t.mean / price - 1) * 100,
    spread: round2(spread),
    spreadPct,
    uncertainty: spreadPct < 35 ? 'Baja' : spreadPct < 70 ? 'Media' : 'Alta',
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
