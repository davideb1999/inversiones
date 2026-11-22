/**
 * Convierte los datos de los analistas en un veredicto sencillo: comprar, mantener o vender,
 * cuánto podría subir según ellos y durante cuánto tiempo tiene sentido mantener.
 */

export interface AnalystInput {
  price: number;
  targetPrice?: number;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  beta?: number;
  pe?: number;
  isEtf: boolean;
}

export type Verdict = 'comprar' | 'mantener' | 'vender' | 'sin-datos';

export interface AnalystResult {
  verdict: Verdict;
  title: string;
  /** Lo que podría subir (o bajar) hasta el precio objetivo, en %. */
  upside?: number;
  analysts: number;
  buyPct: number;
  holdPct: number;
  sellPct: number;
  /** -2 (venta fuerte) a +2 (compra fuerte). */
  consensus: number;
  consensusLabel: string;
  horizon: string;
  points: string[];
}

export function analyze(i: AnalystInput): AnalystResult {
  const analysts = i.strongBuy + i.buy + i.hold + i.sell + i.strongSell;
  const pct = (n: number) => (analysts ? (n / analysts) * 100 : 0);
  const buyPct = pct(i.strongBuy + i.buy);
  const holdPct = pct(i.hold);
  const sellPct = pct(i.sell + i.strongSell);
  const consensus = analysts ? (2 * i.strongBuy + i.buy - i.sell - 2 * i.strongSell) / analysts : 0;
  const upside = i.targetPrice && i.price ? (i.targetPrice / i.price - 1) * 100 : undefined;
  const points: string[] = [];

  if (i.isEtf && !analysts) {
    return {
      verdict: 'mantener',
      title: 'Mantener a largo plazo',
      analysts: 0,
      buyPct: 0,
      holdPct: 0,
      sellPct: 0,
      consensus: 0,
      consensusLabel: 'Los analistas no valoran ETF',
      horizon: '5 años o más',
      points: [
        'Un ETF es una cesta de muchas empresas: los analistas no le ponen precio objetivo.',
        'Su valor depende del índice que sigue. Funciona mejor comprando poco a poco y manteniendo muchos años.',
      ],
    };
  }

  if (!analysts && upside === undefined) {
    return {
      verdict: 'sin-datos',
      title: 'Sin datos de analistas',
      analysts: 0,
      buyPct: 0,
      holdPct: 0,
      sellPct: 0,
      consensus: 0,
      consensusLabel: 'Sin opiniones',
      horizon: '—',
      points: ['No hay analistas que sigan este valor, o el plan gratuito no da sus datos.'],
    };
  }

  const consensusLabel =
    consensus >= 1.3 ? 'Compra fuerte' : consensus >= 0.5 ? 'Comprar' : consensus > -0.3 ? 'Mantener' : consensus > -1 ? 'Vender' : 'Venta fuerte';

  let verdict: Verdict;
  if ((upside !== undefined && upside <= -8) || consensus <= -0.3) verdict = 'vender';
  else if (consensus >= 0.6 && (upside === undefined || upside >= 8)) verdict = 'comprar';
  else verdict = 'mantener';

  const title = {
    comprar: 'Los analistas la ven para comprar',
    mantener: 'Los analistas recomiendan mantener',
    vender: 'Los analistas son pesimistas',
    'sin-datos': '',
  }[verdict];

  if (analysts) {
    points.push(
      `De ${analysts} analistas, ${Math.round(buyPct)} % dicen comprar, ${Math.round(holdPct)} % mantener y ${Math.round(sellPct)} % vender.`,
    );
  }
  if (upside !== undefined) {
    points.push(
      upside >= 0
        ? `Su precio objetivo medio (${i.targetPrice!.toFixed(2)}) está un ${upside.toFixed(1)} % por encima del precio actual: creen que puede subir hasta ahí en unos 12 meses.`
        : `Su precio objetivo medio (${i.targetPrice!.toFixed(2)}) está un ${Math.abs(upside).toFixed(1)} % por debajo del precio actual: creen que hoy está cara.`,
    );
    if (upside >= 0 && upside < 5 && verdict !== 'vender') points.push('Está ya muy cerca del precio objetivo: queda poco recorrido según los analistas.');
  }
  if (i.beta !== undefined) {
    if (i.beta > 1.4) points.push(`Es una acción nerviosa (beta ${i.beta.toFixed(2)}): suele moverse bastante más que el mercado, para arriba y para abajo.`);
    else if (i.beta < 0.8) points.push(`Es una acción tranquila (beta ${i.beta.toFixed(2)}): suele moverse menos que el mercado.`);
  }
  if (i.pe !== undefined && i.pe > 45) points.push(`Cotiza a un PER de ${i.pe.toFixed(0)}: el mercado espera mucho crecimiento, y si decepciona puede caer fuerte.`);

  const horizon =
    verdict === 'vender'
      ? 'Revisar: los analistas no ven recorrido'
      : verdict === 'comprar'
        ? i.beta !== undefined && i.beta > 1.4
          ? '12 meses como mínimo (mejor 3-5 años, por los altibajos)'
          : '12 meses como mínimo (mejor 3-5 años)'
        : 'Si ya la tienes, mantener y revisar en 6-12 meses';

  return { verdict, title, upside, analysts, buyPct, holdPct, sellPct, consensus, consensusLabel, horizon, points };
}
