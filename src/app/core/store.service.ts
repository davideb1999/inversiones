import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { AuthService } from './auth.service';
import {
  Asset,
  ChatMessage,
  Dividend,
  DEFAULT_SETTINGS,
  GuruReport,
  Movement,
  OpportunityBatch,
  Recommendation,
  RiskProfile,
  Settings,
  UserData,
  Valuation,
  emptyUserData,
  uid,
} from './models';

/** Datos del usuario conectado, guardados en localStorage bajo su id. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly auth = inject(AuthService);
  // Se recarga de forma síncrona al cambiar de usuario, antes de cualquier escritura.
  private readonly data = linkedSignal<UserData>(() => {
    const user = this.auth.user();
    return user ? this.load(user.id) : emptyUserData();
  });

  readonly assets = computed(() => this.data().assets);
  readonly settings = computed(() => this.data().settings);
  readonly profile = computed(() => this.data().profile);
  readonly chat = computed(() => this.data().chat);
  readonly recommendations = computed(() => this.data().recommendations);
  readonly batches = computed(() => this.data().batches);
  readonly guruReport = computed(() => this.data().guruReport);
  readonly dividends = computed(() => this.data().dividends ?? []);
  readonly portfolioReview = computed(() => this.data().portfolioReview);

  private key(): string | null {
    const user = this.auth.user();
    return user ? `inv.data.${user.id}` : null;
  }

  private load(userId: string): UserData {
    try {
      const raw = localStorage.getItem(`inv.data.${userId}`);
      if (!raw) return emptyUserData();
      const parsed = JSON.parse(raw) as UserData;
      return { ...emptyUserData(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
    } catch {
      return emptyUserData();
    }
  }

  private update(fn: (d: UserData) => UserData): void {
    const next = fn(this.data());
    this.data.set(next);
    const key = this.key();
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (e) {
        console.error('No se pudo guardar', e);
      }
    }
  }

  asset(id: string): Asset | undefined {
    return this.assets().find((a) => a.id === id);
  }

  addAsset(asset: Omit<Asset, 'id' | 'createdAt' | 'movements' | 'valuations'>): Asset {
    const created: Asset = { ...asset, id: uid(), createdAt: new Date().toISOString(), movements: [], valuations: [] };
    this.update((d) => ({ ...d, assets: [...d.assets, created] }));
    return created;
  }

  updateAsset(id: string, patch: Partial<Asset>): void {
    this.update((d) => ({ ...d, assets: d.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }

  /** Deja de pedir su precio automático: pasa a valorarse a mano. */
  convertToManual(id: string): void {
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) =>
        a.id === id && a.symbol ? { ...a, ticker: a.ticker ?? a.symbol, symbol: undefined, tracking: undefined } : a,
      ),
    }));
  }

  /** Sigue el precio de un equivalente de EE. UU. en lugar del valor original. */
  useEquivalent(id: string, eq: { symbol: string; name: string; currency: string; exchange: string; how: string; note?: string }): void {
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) =>
        a.id === id
          ? {
              ...a,
              ticker: a.ticker ?? a.symbol,
              symbol: eq.symbol,
              currency: eq.currency,
              exchange: eq.exchange,
              tracking: { name: eq.name, how: eq.how, note: eq.note },
            }
          : a,
      ),
    }));
  }

  removeAsset(id: string): void {
    this.update((d) => ({ ...d, assets: d.assets.filter((a) => a.id !== id) }));
  }

  /** Añade muchos movimientos de una vez (importaciones), saltándose los ya importados. */
  addMovements(assetId: string, movements: Movement[]): number {
    let added = 0;
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) => {
        if (a.id !== assetId) return a;
        const known = new Set(a.movements.map((m) => m.externalId).filter(Boolean));
        const fresh = movements.filter((m) => !m.externalId || !known.has(m.externalId));
        added = fresh.length;
        // A los ya importados se les completan las participaciones reales (importaciones antiguas no las guardaban).
        const byId = new Map(movements.filter((m) => m.externalId).map((m) => [m.externalId!, m]));
        const patched = a.movements.map((m) => (m.externalId && !m.realShares && byId.get(m.externalId)?.realShares ? { ...m, realShares: byId.get(m.externalId)!.realShares } : m));
        return { ...a, movements: [...patched, ...fresh].sort((x, y) => x.date.localeCompare(y.date)) };
      }),
    }));
    return added;
  }

  /** Guarda dividendos importados sin duplicarlos. */
  addDividends(list: Dividend[]): void {
    this.update((d) => {
      const known = new Set((d.dividends ?? []).map((x) => x.id));
      return { ...d, dividends: [...(d.dividends ?? []), ...list.filter((x) => !known.has(x.id))].sort((a, b) => a.date.localeCompare(b.date)) };
    });
  }

  saveMovement(assetId: string, movement: Movement): void {
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) => {
        if (a.id !== assetId) return a;
        const rest = a.movements.filter((m) => m.id !== movement.id);
        return { ...a, movements: [...rest, movement].sort((x, y) => x.date.localeCompare(y.date)) };
      }),
    }));
  }

  removeMovement(assetId: string, movementId: string): void {
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) =>
        a.id === assetId ? { ...a, movements: a.movements.filter((m) => m.id !== movementId) } : a,
      ),
    }));
  }

  saveValuation(assetId: string, valuation: Valuation): void {
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) => {
        if (a.id !== assetId) return a;
        const rest = a.valuations.filter((v) => v.date !== valuation.date);
        return { ...a, valuations: [...rest, valuation].sort((x, y) => x.date.localeCompare(y.date)) };
      }),
    }));
  }

  removeValuation(assetId: string, date: string): void {
    this.update((d) => ({
      ...d,
      assets: d.assets.map((a) =>
        a.id === assetId ? { ...a, valuations: a.valuations.filter((v) => v.date !== date) } : a,
      ),
    }));
  }

  updateSettings(patch: Partial<Settings>): void {
    this.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }

  setProfile(profile: RiskProfile): void {
    this.update((d) => ({ ...d, profile }));
  }

  addChat(message: ChatMessage): void {
    this.update((d) => ({ ...d, chat: [...d.chat, message].slice(-60) }));
  }

  clearChat(): void {
    this.update((d) => ({ ...d, chat: [] }));
  }

  setPortfolioReview(text: string): void {
    this.update((d) => ({ ...d, portfolioReview: { text, at: new Date().toISOString() } }));
  }

  addBatch(batch: OpportunityBatch, recs: Recommendation[]): void {
    this.update((d) => ({ ...d, batches: [batch, ...d.batches], recommendations: [...recs, ...d.recommendations] }));
  }

  updateRecommendation(id: string, patch: Partial<Recommendation>): void {
    this.update((d) => ({
      ...d,
      recommendations: d.recommendations.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  removeRecommendation(id: string): void {
    this.update((d) => ({ ...d, recommendations: d.recommendations.filter((r) => r.id !== id) }));
  }

  setGuruReport(report: GuruReport): void {
    this.update((d) => ({ ...d, guruReport: report }));
  }

  /** Copia de seguridad (sin las claves de API). */
  exportJson(includeKeys: boolean): string {
    const d = this.data();
    const settings = includeKeys ? d.settings : { ...d.settings, anthropicKey: '', geminiKey: '', finnhubKey: '', twelveDataKey: '', alphaVantageKey: '', fmpKey: '' };
    return JSON.stringify({ ...d, settings }, null, 2);
  }

  importJson(json: string): void {
    const parsed = JSON.parse(json) as UserData;
    if (!Array.isArray(parsed.assets)) throw new Error('El archivo no parece una copia de esta app.');
    const current = this.data().settings;
    const settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    // No pisar claves existentes con claves vacías de una copia exportada sin ellas.
    for (const k of ['anthropicKey', 'geminiKey', 'finnhubKey', 'twelveDataKey', 'alphaVantageKey', 'fmpKey'] as const) {
      if (!settings[k]) settings[k] = current[k];
    }
    this.update(() => ({ ...emptyUserData(), ...parsed, settings }));
  }
}
