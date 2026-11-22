import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService, extractJson, stripJson } from './ai.service';
import { MarketDataService, parseDate } from './market-data.service';
import { StoreService } from './store.service';
import { HORIZON_DAYS, Horizon, OpportunityBatch, Recommendation, addDays, today, uid } from './models';
import { msg } from './portfolio.service';
import { HORIZON_RULES, Pick, explainPick } from './quant';

const BENCHMARK = 'SPY';

const HORIZON_TEXT: Record<Horizon, string> = {
  diario: 'para la próxima sesión de bolsa (1 día)',
  semanal: 'para los próximos 7 días',
  mensual: 'para los próximos 30 días',
  anual: 'para los próximos 12 meses',
};

interface AiIdea {
  symbol: string;
  name: string;
  type: 'accion' | 'etf';
  direction: 'sube' | 'baja';
  expectedPct: number;
  confidence: number;
  risk: 'bajo' | 'medio' | 'alto';
  reason: string;
  risks: string;
}

export interface HorizonStats {
  horizon: Horizon;
  evaluated: number;
  hits: number;
  hitRate: number;
  avgResult: number;
  beatBenchmark: number;
  pending: number;
}

@Injectable({ providedIn: 'root' })
export class OpportunitiesService {
  private readonly store = inject(StoreService);
  private readonly ai = inject(AiService);
  private readonly market = inject(MarketDataService);

  readonly evaluating = signal(false);

  readonly stats = computed<HorizonStats[]>(() => {
    const recs = this.store.recommendations();
    return (Object.keys(HORIZON_DAYS) as Horizon[]).map((h) => {
      const mine = recs.filter((r) => r.horizon === h);
      const done = mine.filter((r) => r.status === 'acierto' || r.status === 'fallo');
      const hits = done.filter((r) => r.status === 'acierto').length;
      const adj = done.map((r) => directional(r));
      const beat = done.filter((r) => r.benchmarkPct !== undefined && directional(r) > (r.benchmarkPct ?? 0)).length;
      return {
        horizon: h,
        evaluated: done.length,
        hits,
        hitRate: done.length ? (hits / done.length) * 100 : 0,
        avgResult: adj.length ? adj.reduce((a, b) => a + b, 0) / adj.length : 0,
        beatBenchmark: beat,
        pending: mine.filter((r) => r.status === 'pendiente').length,
      };
    });
  });

  async generate(horizon: Horizon, onText?: (t: string) => void, onStatus?: (s: string) => void): Promise<OpportunityBatch> {
    const profile = this.store.profile();
    const track = this.store
      .recommendations()
      .filter((r) => r.horizon === horizon && r.status !== 'pendiente' && r.status !== 'sin-datos')
      .slice(0, 12)
      .map((r) => `${r.symbol} (${r.direction}, esperado ${r.expectedPct}%): resultado ${r.resultPct?.toFixed(1)}% → ${r.status}`)
      .join('\n');

    const system = `Eres un analista de mercados que escribe para personas SIN conocimientos de economía.
Usa frases cortas, sin jerga; si usas un término técnico, explícalo entre paréntesis.
Sé honesto: los pronósticos a corto plazo son muy inciertos y lo debes decir.
Escribe siempre en español de España.`;

    // Sin búsqueda en internet (p. ej. Gemini gratis), la IA recibe los datos del día de Finnhub.
    const briefing = this.ai.canSearch() ? '' : await this.market.briefing([], true);
    const source = this.ai.canSearch()
      ? 'Busca en internet la situación actual del mercado (noticias, resultados empresariales, datos macro, tendencias)'
      : `Analiza la situación actual del mercado con estos datos reales de hoy (no puedes buscar en internet; no inventes cifras):\n\n${briefing || '(no hay datos de mercado disponibles: basa tu análisis en lo que sepas y avisa de que puede estar desactualizado)'}\n\nCon ello`;
    const user = `Hoy es ${today()}. ${source} propón 5 oportunidades de inversión en acciones o ETF ${HORIZON_TEXT[horizon]}.
Requisitos:${briefing ? '\n- Elige preferentemente entre los valores de la lista de cotizaciones.' : ''}
- Solo valores que coticen en bolsas de EE. UU., con su ticker exacto (p. ej. AAPL, MSFT, VOO, QQQ), para poder comprobar el precio automáticamente.
- Mezcla tipos: al menos 1 ETF.
- "direction" es "sube" si esperas que suba o "baja" si esperas que baje.
- "expectedPct" es el movimiento que esperas en ese plazo, en % (número, sin signo).
- "confidence" de 1 (poca) a 5 (mucha). Sé prudente.
- "reason": 2-3 frases sencillas de por qué. "risks": 1-2 frases de qué podría salir mal.
${profile ? `- El usuario tiene perfil ${profile.label}; tenlo en cuenta en el riesgo.` : ''}
${track ? `Tu historial reciente en este plazo (aprende de los fallos):\n${track}` : ''}

Primero escribe un resumen del mercado de 3 a 5 frases. Después termina con un único bloque \`\`\`json con este formato exacto:
{"ideas":[{"symbol":"VOO","name":"Vanguard S&P 500 ETF","type":"etf","direction":"sube","expectedPct":1.5,"confidence":3,"risk":"bajo","reason":"...","risks":"..."}]}`;

    const res = await this.ai.ask({
      system,
      messages: [{ role: 'user', content: user }],
      webSearch: true,
      maxSearches: 8,
      effort: 'medium',
      onText: onText ? (t) => onText(stripJson(t.split('```')[0])) : undefined,
      onStatus,
    });

    const parsed = extractJson<{ ideas: AiIdea[] }>(res.text);
    const createdAt = new Date().toISOString();
    const batch: OpportunityBatch = {
      id: uid(),
      horizon,
      createdAt,
      marketSummary: stripJson(res.text),
      source: 'ia',
      sources: res.sources,
    };
    const evaluateOn = addDays(today(), HORIZON_DAYS[horizon]);
    const benchmarkEntry = await this.market.quote(BENCHMARK).then((q) => q.price).catch(() => undefined);
    const recs = await Promise.all(
      (parsed.ideas ?? []).slice(0, 8).map(async (idea): Promise<Recommendation> => {
        const symbol = String(idea.symbol).toUpperCase().trim();
        const entryPrice = await this.market.quote(symbol).then((q) => q.price).catch(() => undefined);
        return {
          id: uid(),
          batchId: batch.id,
          source: 'ia',
          horizon,
          createdAt,
          evaluateOn,
          symbol,
          name: idea.name,
          type: idea.type === 'etf' ? 'etf' : 'accion',
          direction: idea.direction === 'baja' ? 'baja' : 'sube',
          expectedPct: Math.abs(Number(idea.expectedPct) || 0),
          confidence: Math.min(5, Math.max(1, Math.round(Number(idea.confidence) || 1))),
          risk: idea.risk ?? 'medio',
          reason: idea.reason,
          risks: idea.risks,
          entryPrice,
          benchmarkEntry,
          status: 'pendiente',
        };
      }),
    );
    this.store.addBatch(batch, recs);
    return batch;
  }

  /**
   * Guarda en el registro las ideas del modelo de tendencia (una vez al día por plazo),
   * para poder comprobar después si acertó.
   */
  saveModelPicks(horizon: Horizon, picks: Pick[], benchmarkPrice?: number): void {
    const t = today();
    const exists = this.store.batches().some((b) => b.source === 'modelo' && b.horizon === horizon && b.createdAt.slice(0, 10) === t);
    if (exists || !picks.length) return;
    const createdAt = new Date().toISOString();
    const batch: OpportunityBatch = {
      id: uid(),
      horizon,
      createdAt,
      marketSummary: `Modelo de tendencia: las ${picks.length} acciones y ETF con la subida más sostenida en ${HORIZON_RULES[horizon].label}.`,
      sources: [],
      source: 'modelo',
    };
    const recs: Recommendation[] = picks.map((p, idx) => {
      const ex = explainPick(p, horizon);
      return {
        id: uid(),
        batchId: batch.id,
        source: 'modelo',
        horizon,
        createdAt,
        evaluateOn: addDays(t, HORIZON_DAYS[horizon]),
        symbol: p.symbol,
        name: p.name,
        type: p.type,
        direction: 'sube',
        expectedPct: expectedMove(p, horizon),
        confidence: Math.max(1, 5 - idx),
        risk: ex.risk,
        reason: ex.reason,
        risks: ex.risks,
        entryPrice: p.price,
        benchmarkEntry: benchmarkPrice,
        status: 'pendiente',
      };
    });
    this.store.addBatch(batch, recs);
  }

  /** Comprueba las recomendaciones cuyo plazo ya ha vencido. */
  async evaluatePending(): Promise<string[]> {
    if (this.evaluating() || !this.market.hasTwelveData()) return [];
    const due = this.store.recommendations().filter((r) => r.status === 'pendiente' && r.evaluateOn < today());
    if (!due.length) return [];
    this.evaluating.set(true);
    const errors: string[] = [];
    try {
      for (const r of due) {
        try {
          const created = r.createdAt.slice(0, 10);
          const series = await this.market.daily(r.symbol, addDays(created, -5));
          const exitPoint = this.closedPointOnOrAfter(series.points, r.evaluateOn);
          if (!exitPoint) continue; // aún no hay cierre de ese día
          const entry = r.entryPrice ?? this.closedPointOnOrAfter(series.points, created)?.close;
          if (!entry) {
            this.store.updateRecommendation(r.id, { status: 'sin-datos', evaluatedAt: new Date().toISOString() });
            continue;
          }
          const resultPct = ((exitPoint.close - entry) / entry) * 100;
          let benchmarkExit: number | undefined;
          let benchmarkPct: number | undefined;
          try {
            const b = await this.market.daily(BENCHMARK, addDays(created, -5));
            benchmarkExit = this.closedPointOnOrAfter(b.points, r.evaluateOn)?.close;
            const bEntry = r.benchmarkEntry ?? this.closedPointOnOrAfter(b.points, created)?.close;
            if (benchmarkExit && bEntry) benchmarkPct = ((benchmarkExit - bEntry) / bEntry) * 100;
          } catch {
            // el índice de referencia es opcional
          }
          const hit = r.direction === 'sube' ? resultPct > 0 : resultPct < 0;
          this.store.updateRecommendation(r.id, {
            entryPrice: entry,
            exitPrice: exitPoint.close,
            resultPct,
            benchmarkExit,
            benchmarkPct,
            status: hit ? 'acierto' : 'fallo',
            evaluatedAt: new Date().toISOString(),
          });
        } catch (e) {
          errors.push(`${r.symbol}: ${msg(e)}`);
        }
      }
    } finally {
      this.evaluating.set(false);
    }
    return errors;
  }

  private closedPointOnOrAfter(points: { t: number; close: number }[], date: string) {
    const t = parseDate(date);
    const todayT = parseDate(today());
    return points.find((p) => p.t >= t && p.t < todayT);
  }
}

/**
 * Movimiento orientativo para el plazo: la tendencia reciente prorrateada y recortada a la mitad
 * (las tendencias se frenan), con un mínimo y un máximo razonables.
 */
export function expectedMove(p: Pick, horizon: Horizon): number {
  const { hold, lookback } = HORIZON_RULES[horizon];
  const v = (p.momentum * hold) / lookback / 2;
  return Math.round(Math.min(Math.max(v, 0.2), 30) * 10) / 10;
}

/** Resultado "a favor" de la predicción: positivo si acertó la dirección. */
export function directional(r: Recommendation): number {
  const v = r.resultPct ?? 0;
  return r.direction === 'sube' ? v : -v;
}
