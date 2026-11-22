import { AssetStats } from './portfolio.service';
import { ASSET_TYPE_LABEL, RiskProfile, today } from './models';

export interface QuizQuestion {
  id: string;
  text: string;
  options: { label: string; points: number }[];
}

export const RISK_QUIZ: QuizQuestion[] = [
  {
    id: 'plazo',
    text: '¿Cuánto tiempo piensas dejar el dinero invertido?',
    options: [
      { label: 'Menos de 1 año', points: 0 },
      { label: 'De 1 a 3 años', points: 1 },
      { label: 'De 3 a 7 años', points: 2 },
      { label: 'Más de 7 años', points: 3 },
    ],
  },
  {
    id: 'caida',
    text: 'Si tu inversión cae un 20 % en un mes, ¿qué harías?',
    options: [
      { label: 'Vendería todo para no perder más', points: 0 },
      { label: 'Vendería una parte', points: 1 },
      { label: 'Esperaría tranquilo', points: 2 },
      { label: 'Aprovecharía para comprar más', points: 3 },
    ],
  },
  {
    id: 'objetivo',
    text: '¿Qué buscas con tu dinero?',
    options: [
      { label: 'Sobre todo no perder', points: 0 },
      { label: 'Ganar algo más que en el banco', points: 1 },
      { label: 'Crecer de forma equilibrada', points: 2 },
      { label: 'El máximo crecimiento posible', points: 3 },
    ],
  },
  {
    id: 'colchon',
    text: '¿Tienes ahorrado un colchón para emergencias (3-6 meses de gastos)?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Algo, pero no suficiente', points: 1 },
      { label: 'Sí', points: 3 },
    ],
  },
  {
    id: 'experiencia',
    text: '¿Cuánta experiencia tienes invirtiendo?',
    options: [
      { label: 'Ninguna', points: 0 },
      { label: 'Poca', points: 1 },
      { label: 'Algo', points: 2 },
      { label: 'Bastante', points: 3 },
    ],
  },
];

export function scoreProfile(answers: Record<string, number>): RiskProfile {
  const score = Object.values(answers).reduce((a, b) => a + b, 0);
  const label: RiskProfile['label'] = score <= 5 ? 'Conservador' : score <= 10 ? 'Moderado' : 'Dinámico';
  return { answers, score, label, updatedAt: new Date().toISOString() };
}

export const PROFILE_TEXT: Record<RiskProfile['label'], string> = {
  Conservador: 'Prefieres dormir tranquilo aunque ganes menos. Encajan mejor fondos monetarios, renta fija y una parte pequeña en ETF globales.',
  Moderado: 'Aceptas algunas subidas y bajadas a cambio de crecer. Encaja una mezcla de ETF globales de acciones y algo de renta fija.',
  Dinámico: 'Aguantas bien las caídas pensando en el largo plazo. Encaja una cartera mayoritariamente en acciones (ETF globales) con algo de riesgo extra.',
};

export const ADVISOR_SYSTEM = `Eres "Asesor IA", un asesor financiero cercano para personas que NO saben de economía.
Reglas:
- Escribe en español de España, con frases cortas y ejemplos cotidianos. Explica cualquier término técnico entre paréntesis.
- Basa tus consejos en la cartera y el perfil del usuario que aparecen abajo. No inventes datos: si necesitas precios o noticias actuales, búscalos en internet.
- Da recomendaciones concretas y accionables (qué haría, cuánto, cuándo), pero explica los riesgos y alternativas.
- Prioriza principios sólidos: diversificar, costes bajos, horizonte largo, aportar de forma periódica, tener colchón de emergencia, no invertir dinero que se vaya a necesitar pronto.
- Si algo depende de su situación fiscal o personal (impuestos en España, hipoteca, etc.), dilo y sugiere consultar a un profesional.
- Sé breve (máximo ~250 palabras) salvo que te pidan detalle. Usa listas cuando ayude.
- Recuerda en una línea final que no es asesoramiento financiero profesional solo cuando des una recomendación de compra o venta.`;

export function portfolioContext(stats: AssetStats[], totals: { value: number; invested: number; gain: number; gainPct: number; annualPct?: number }, profile: RiskProfile | undefined, currency: string): string {
  const lines = stats.map((s) => {
    const a = s.asset;
    const moves = a.movements;
    return `- ${a.name}${a.tracking ? ` [${a.ticker}, valorado con su equivalente ${a.symbol}]` : a.symbol ? ` [${a.symbol}]` : a.ticker ? ` [${a.ticker}, valor manual]` : ''} (${ASSET_TYPE_LABEL[a.type]}): puesto ${s.invested.toFixed(2)} ${currency}, vale ${s.value.toFixed(2)} ${currency} (${s.gainPct.toFixed(1)} %), ${moves.length} movimientos desde ${moves[0]?.date ?? '—'}${s.annualPct !== undefined ? `, TIR ${s.annualPct.toFixed(1)} %/año` : ''}`;
  });
  return `Fecha de hoy: ${today()}
Moneda: ${currency}
Perfil de riesgo: ${profile ? `${profile.label} (puntuación ${profile.score}/15; respuestas: ${JSON.stringify(profile.answers)})` : 'sin completar'}
Totales: valor ${totals.value.toFixed(2)}, puesto ${totals.invested.toFixed(2)}, ganancia ${totals.gain.toFixed(2)} (${totals.gainPct.toFixed(1)} %)${totals.annualPct !== undefined ? `, TIR ${totals.annualPct.toFixed(1)} %/año` : ''}
Inversiones:
${lines.join('\n') || '(ninguna todavía)'}`;
}
