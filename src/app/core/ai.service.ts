import { Injectable, inject } from '@angular/core';
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
  MessageCreateParamsStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { StoreService } from './store.service';
import { Source } from './models';

export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskOptions {
  system: string;
  messages: AiTurn[];
  /** Permite buscar en internet (si el proveedor y el plan lo permiten). */
  webSearch?: boolean;
  maxSearches?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh';
  onText?: (snapshot: string) => void;
  /** Avisos de progreso (reintentos, cambio de modelo). */
  onStatus?: (status: string) => void;
  /** Pide la respuesta directamente en JSON (Gemini). */
  json?: boolean;
  signal?: AbortSignal;
}

export interface AskResult {
  text: string;
  sources: Source[];
}

export class AiError extends Error {}

class TimeoutError extends Error {}

/** Modelos de Gemini a probar si el elegido está saturado (de mejor a más ligero). */
const GEMINI_FALLBACKS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

function retryable(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  if (e instanceof ApiError) return e.status >= 500 || e.status === 404;
  return e instanceof TypeError; // fallo de red
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Llama a la IA (Gemini o Claude) directamente desde el navegador con la clave guardada en Ajustes. */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly store = inject(StoreService);

  isConfigured(): boolean {
    const s = this.store.settings();
    return s.aiProvider === 'gemini' ? !!s.geminiKey : !!s.anthropicKey;
  }

  /** ¿Puede la IA buscar en internet por sí misma? Si no, hay que pasarle los datos de mercado. */
  canSearch(): boolean {
    const s = this.store.settings();
    return s.aiProvider === 'claude' || s.geminiSearch;
  }

  providerName(): string {
    return this.store.settings().aiProvider === 'gemini' ? 'Gemini' : 'Claude';
  }

  ask(opts: AskOptions): Promise<AskResult> {
    return this.store.settings().aiProvider === 'gemini' ? this.askGemini(opts) : this.askClaude(opts);
  }

  // ---------- Gemini ----------

  /**
   * Gemini gratis a veces responde 503 (saturado) o se queda colgado. Se reintenta con espera,
   * se pasa a modelos más ligeros y se corta si no llega nada en un tiempo razonable.
   */
  private async askGemini(opts: AskOptions): Promise<AskResult> {
    const { geminiKey, geminiModel } = this.store.settings();
    if (!geminiKey) throw new AiError('Añade tu clave de Gemini en Ajustes para usar la IA.');
    // Sin los reintentos internos del SDK (hasta 5, con esperas de hasta 60 s): los gestionamos aquí, más rápido.
    const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { retryOptions: { attempts: 1 } } });
    const models = [...new Set([geminiModel || GEMINI_FALLBACKS[0], ...GEMINI_FALLBACKS])];
    let lastError: unknown;
    for (const [mi, model] of models.entries()) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (opts.signal?.aborted) throw new AiError('Consulta cancelada.');
        if (mi > 0 || attempt > 0) opts.onStatus?.(mi > 0 ? `Gemini está saturado; probando con ${model}...` : 'Gemini está saturado; reintentando...');
        try {
          return await this.geminiOnce(ai, model, opts, true);
        } catch (e) {
          // Algunos modelos no aceptan el nivel de razonamiento: se repite sin él.
          if (e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message)) {
            try {
              return await this.geminiOnce(ai, model, opts, false);
            } catch (e2) {
              e = e2;
            }
          }
          lastError = e;
          if (!retryable(e)) throw this.friendlyGemini(e);
          if (e instanceof ApiError && e.status === 404) break; // ese modelo no existe: siguiente
          await sleep(attempt === 0 ? 1500 : 4000);
        }
      }
    }
    throw this.friendlyGemini(lastError);
  }

  private async geminiOnce(ai: GoogleGenAI, model: string, opts: AskOptions, withThinking: boolean): Promise<AskResult> {
    const { geminiSearch } = this.store.settings();
    const search = opts.webSearch && geminiSearch;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    // Si en 45 s no llega nada (o en 150 s no termina), se corta y se prueba de nuevo.
    let timedOut = false;
    const arm = (ms: number) =>
      setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, ms);
    let firstTimer = arm(45_000);
    const totalTimer = arm(150_000);
    const sources = new Map<string, Source>();
    let text = '';
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: opts.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: {
          systemInstruction: opts.system,
          ...(search ? { tools: [{ googleSearch: {} }] } : {}),
          ...(opts.json && !search ? { responseMimeType: 'application/json' } : {}),
          // Pensar menos = responder mucho antes. Solo la revisión completa piensa más.
          ...(withThinking ? { thinkingConfig: { thinkingLevel: opts.effort === 'high' || opts.effort === 'xhigh' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW } } : {}),
          abortSignal: ctrl.signal,
        },
      });
      for await (const chunk of stream) {
        clearTimeout(firstTimer);
        firstTimer = arm(60_000); // entre trozos, como mucho 60 s
        const cand = chunk.candidates?.[0];
        if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') {
          throw new AiError('La IA no ha podido responder a esta petición. Prueba a reformularla.');
        }
        text += chunk.text ?? '';
        opts.onText?.(text);
        for (const g of cand?.groundingMetadata?.groundingChunks ?? []) {
          if (g.web?.uri && !sources.has(g.web.uri)) sources.set(g.web.uri, { url: g.web.uri, title: g.web.title ?? g.web.uri });
        }
      }
    } catch (e) {
      if (timedOut && !opts.signal?.aborted) throw new TimeoutError();
      throw e;
    } finally {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (!text.trim()) throw new TimeoutError();
    return { text: text.trim(), sources: [...sources.values()].slice(0, 12) };
  }

  private friendlyGemini(e: unknown): Error {
    if (e instanceof TimeoutError) return new AiError('Gemini está tardando demasiado (suele pasar cuando está saturado). Inténtalo en unos minutos.');
    if (e instanceof AiError) return e;
    if (e instanceof Error && e.name === 'AbortError') return new AiError('Consulta cancelada.');
    if (e instanceof ApiError) {
      const m = e.message.toLowerCase();
      if (e.status === 400 && m.includes('api key')) return new AiError('La clave de Gemini no es válida. Revísala en Ajustes.');
      if (e.status === 400 && (m.includes('search') || m.includes('grounding')))
        return new AiError('Tu plan de Gemini no permite la búsqueda en Google. Desactívala en Ajustes.');
      if (e.status === 404) return new AiError('Ese modelo de Gemini no existe o ya no está disponible. Cambia el modelo en Ajustes.');
      if (e.status === 403) return new AiError('Tu clave de Gemini no tiene permiso para este modelo.');
      if (e.status === 429)
        return new AiError('Has llegado al límite gratuito de Gemini por ahora. Espera un rato (o hasta mañana) y vuelve a probar.');
      if (e.status >= 500) return new AiError('Gemini está saturado. Inténtalo en unos minutos.');
      return new AiError(e.message);
    }
    if (e instanceof TypeError) return new AiError('No hay conexión con el servicio de IA.');
    return e instanceof Error ? e : new Error(String(e));
  }

  // ---------- Claude ----------

  private async askClaude(opts: AskOptions): Promise<AskResult> {
    const { anthropicKey, model } = this.store.settings();
    if (!anthropicKey) throw new AiError('Añade tu clave de Anthropic en Ajustes para usar la IA.');
    const client = new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true });

    const tools: BetaToolUnion[] = [];
    if (opts.webSearch) {
      // Haiku usa la variante básica de la búsqueda web.
      tools.push(
        model === 'claude-haiku-5-5'
          ? { type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxSearches ?? 6 }
          : { type: 'web_search_20260209', name: 'web_search', max_uses: opts.maxSearches ?? 6 },
      );
    }
    // Si un filtro de seguridad rechaza la petición, la API la reintenta con otro modelo.
    const fallback = model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

    const messages: BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    let text = '';
    let prefix = '';
    const blocks: BetaContentBlock[] = [];

    try {
      // La búsqueda web puede pausar el turno (pause_turn): se reenvía para que continúe.
      for (let round = 0; round < 4; round++) {
        const params: MessageCreateParamsStreaming = {
          model,
          max_tokens: 32000,
          stream: true,
          thinking: { type: 'adaptive' },
          output_config: { effort: opts.effort ?? 'medium' },
          system: opts.system,
          messages,
          ...(tools.length ? { tools } : {}),
          ...fallback,
        };
        const stream = client.beta.messages.stream(params, { signal: opts.signal });
        stream.on('text', (_delta, snapshot) => opts.onText?.(prefix + snapshot));
        const message = await stream.finalMessage();
        blocks.push(...message.content);
        const roundText = message.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');
        text = prefix + roundText;
        if (message.stop_reason === 'refusal') {
          throw new AiError('La IA no ha podido responder a esta petición. Prueba a reformularla.');
        }
        if (message.stop_reason !== 'pause_turn') break;
        prefix = text;
        messages.push({ role: 'assistant', content: message.content });
      }
    } catch (e) {
      throw this.friendlyClaude(e);
    }
    return { text: text.trim(), sources: extractClaudeSources(blocks) };
  }

  private friendlyClaude(e: unknown): Error {
    if (e instanceof AiError) return e;
    if (e instanceof Anthropic.AuthenticationError) return new AiError('La clave de Anthropic no es válida. Revísala en Ajustes.');
    if (e instanceof Anthropic.PermissionDeniedError) return new AiError('Tu clave no tiene permiso para este modelo o herramienta.');
    if (e instanceof Anthropic.RateLimitError) return new AiError('Has hecho muchas consultas seguidas. Espera un minuto y vuelve a probar.');
    if (e instanceof Anthropic.APIUserAbortError) return new AiError('Consulta cancelada.');
    if (e instanceof Anthropic.BadRequestError) {
      const m = e.message.toLowerCase();
      if (m.includes('credit') || m.includes('billing')) return new AiError('Tu cuenta de Anthropic no tiene saldo. Recárgala en console.anthropic.com.');
      return new AiError('Petición no válida: ' + e.message);
    }
    if (e instanceof Anthropic.InternalServerError) return new AiError('El servicio de IA está saturado. Inténtalo en unos minutos.');
    if (e instanceof Anthropic.APIConnectionError) return new AiError('No hay conexión con el servicio de IA.');
    if (e instanceof Anthropic.APIError) return new AiError(e.message);
    return e instanceof Error ? e : new Error(String(e));
  }
}

function extractClaudeSources(blocks: BetaContentBlock[]): Source[] {
  const seen = new Map<string, Source>();
  for (const b of blocks) {
    if (b.type === 'text') {
      for (const c of b.citations ?? []) {
        if (c.type === 'web_search_result_location' && !seen.has(c.url)) seen.set(c.url, { url: c.url, title: c.title ?? c.url });
      }
    }
  }
  if (!seen.size) {
    for (const b of blocks) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content.slice(0, 3)) if (!seen.has(r.url)) seen.set(r.url, { url: r.url, title: r.title });
      }
    }
  }
  return [...seen.values()].slice(0, 12);
}

/** Saca el último bloque ```json ... ``` de una respuesta (o el primer objeto/array JSON). */
export function extractJson<T>(text: string): T {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length ? fenced.reverse() : [text.slice(text.search(/[[{]/))];
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim()) as T;
    } catch {
      // probar el siguiente
    }
  }
  throw new AiError('La IA respondió en un formato inesperado. Vuelve a intentarlo.');
}

/** Quita el bloque JSON del texto para mostrar solo la explicación. */
export function stripJson(text: string): string {
  return text.replace(/```(?:json)?[\s\S]*?```/g, '').trim();
}
