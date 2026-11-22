export type AssetType = 'accion' | 'etf' | 'fondo' | 'cripto' | 'otro';

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  accion: 'Acción',
  etf: 'ETF',
  fondo: 'Fondo',
  cripto: 'Cripto',
  otro: 'Otro',
};

/** Una aportación (dinero que metes) o una retirada (dinero que sacas). */
export interface Movement {
  id: string;
  date: string; // YYYY-MM-DD
  kind: 'aportacion' | 'retirada';
  /** Importe en la moneda base del usuario (p. ej. EUR), siempre positivo. */
  amount: number;
  /** Participaciones/acciones compradas o vendidas (positivo). Opcional en activos manuales. */
  shares?: number;
  /** Precio por participación en la moneda del activo, si se conoce. */
  price?: number;
  note?: string;
  /** Id de la operación en el bróker, para no importarla dos veces. */
  externalId?: string;
  /** Participaciones reales según el bróker (para Hacienda), aunque el activo siga a un equivalente. */
  realShares?: number;
}

/** Valor que el usuario anota a mano (para fondos o activos sin cotización automática). */
export interface Valuation {
  date: string;
  value: number;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  /** Ticker para cotización automática (p. ej. AAPL, VOO, BTC/USD). Vacío = activo manual. */
  symbol?: string;
  /** Ticker de referencia de un activo que se valora a mano (p. ej. un ETF europeo sin precio gratuito). */
  ticker?: string;
  isin?: string;
  /**
   * Si existe, `symbol` no es el valor real sino su equivalente en EE. UU. (p. ej. VT para VWCE),
   * porque el plan gratuito de datos no da el precio del original. Las participaciones son "del equivalente".
   */
  tracking?: { name: string; how: string; note?: string };
  exchange?: string;
  /** Moneda en la que cotiza el activo. */
  currency: string;
  movements: Movement[];
  valuations: Valuation[];
  color?: string;
  createdAt: string;
}

export interface RiskProfile {
  answers: Record<string, number>;
  score: number;
  label: 'Conservador' | 'Moderado' | 'Dinámico';
  updatedAt: string;
}

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

export type AiProvider = 'gemini' | 'claude';

export interface Settings {
  aiProvider: AiProvider;
  geminiKey: string;
  geminiModel: string;
  /** La búsqueda en Google de Gemini no entra en el plan gratuito. */
  geminiSearch: boolean;
  anthropicKey: string;
  finnhubKey: string;
  alphaVantageKey: string;
  fmpKey: string;
  twelveDataKey: string;
  model: AiModel;
  baseCurrency: string;
  theme: 'system' | 'light' | 'dark';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  at: string;
}

export interface Source {
  title: string;
  url: string;
}

export type Horizon = 'diario' | 'semanal' | 'mensual' | 'anual';

export const HORIZON_DAYS: Record<Horizon, number> = {
  diario: 1,
  semanal: 7,
  mensual: 30,
  anual: 365,
};

export interface Recommendation {
  id: string;
  batchId: string;
  /** Quién la propuso: el modelo de tendencia o la IA. */
  source?: 'modelo' | 'ia';
  horizon: Horizon;
  createdAt: string; // ISO
  evaluateOn: string; // YYYY-MM-DD
  symbol: string;
  name: string;
  type: 'accion' | 'etf';
  direction: 'sube' | 'baja';
  expectedPct: number;
  confidence: number; // 1-5
  risk: 'bajo' | 'medio' | 'alto';
  reason: string;
  risks: string;
  entryPrice?: number;
  benchmarkEntry?: number;
  /** Rellenado al evaluar. */
  exitPrice?: number;
  benchmarkExit?: number;
  resultPct?: number;
  benchmarkPct?: number;
  status: 'pendiente' | 'acierto' | 'fallo' | 'sin-datos';
  evaluatedAt?: string;
}

export interface OpportunityBatch {
  id: string;
  horizon: Horizon;
  createdAt: string;
  marketSummary: string;
  sources: Source[];
  source?: 'modelo' | 'ia';
}

export interface GuruReport {
  createdAt: string;
  investors: GuruInvestor[];
  consensus: { symbol: string; name: string; investors: string[]; note: string }[];
  sources: Source[];
}

export interface GuruInvestor {
  name: string;
  fund: string;
  period: string;
  summary: string;
  topHoldings: { symbol: string; name: string; weightPct: number }[];
  buys: { symbol: string; name: string; note: string }[];
  sells: { symbol: string; name: string; note: string }[];
}

/** Dividendo cobrado (para la declaración de la renta). */
export interface Dividend {
  id: string;
  date: string;
  isin: string;
  name: string;
  gross: number;
  /** Retenido en origen (p. ej. 15 % en EE. UU.). */
  withheld: number;
  currency: string;
  /** Dividendo de una acción/ETF o intereses de la cuenta. */
  kind?: 'dividendo' | 'interes';
}

export interface UserData {
  version: 1;
  assets: Asset[];
  settings: Settings;
  profile?: RiskProfile;
  chat: ChatMessage[];
  recommendations: Recommendation[];
  batches: OpportunityBatch[];
  dividends?: Dividend[];
  guruReport?: GuruReport;
  portfolioReview?: { text: string; at: string };
}

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-3.8-flash',
  geminiSearch: false,
  anthropicKey: '',
  finnhubKey: '',
  alphaVantageKey: '',
  fmpKey: '',
  twelveDataKey: '',
  model: 'claude-opus-5-5',
  baseCurrency: 'EUR',
  theme: 'system',
};

export function emptyUserData(): UserData {
  return {
    version: 1,
    assets: [],
    settings: { ...DEFAULT_SETTINGS },
    chat: [],
    recommendations: [],
    batches: [],
  };
}

export function uid(): string {
  return crypto.randomUUID();
}

export function today(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
