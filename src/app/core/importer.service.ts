import { Injectable, inject } from '@angular/core';
import { Equivalent, EquivalentsService } from './equivalents';
import { MarketDataService, SymbolResult } from './market-data.service';
import { Asset, AssetType, Movement, uid } from './models';
import { PortfolioService } from './portfolio.service';
import { StoreService } from './store.service';
import { ImportedTrade } from './trade-republic';

export type PricingMode = 'directo' | 'equivalente' | 'manual';

export interface ImportGroup {
  isin: string;
  name: string;
  type: AssetType;
  trades: ImportedTrade[];
  contributed: number;
  withdrawn: number;
  /** Operaciones que ya estaban importadas. */
  alreadyImported: number;
  resolving: boolean;
  /** Cotización directa con el plan gratuito. */
  direct?: SymbolResult;
  /** Listado europeo del valor (aunque no tenga precio gratuito). */
  listing?: SymbolResult;
  equivalent?: Equivalent | null;
  mode: PricingMode;
  /** Id de una inversión existente a la que añadir, o '' para crear una nueva. */
  target: string;
  include: boolean;
}

/** Importa operaciones de un bróker: agrupa por ISIN, encuentra cómo valorar cada valor y crea los movimientos. */
@Injectable({ providedIn: 'root' })
export class ImporterService {
  private readonly store = inject(StoreService);
  private readonly market = inject(MarketDataService);
  private readonly equivalents = inject(EquivalentsService);
  private readonly portfolio = inject(PortfolioService);

  group(trades: ImportedTrade[]): ImportGroup[] {
    const map = new Map<string, ImportedTrade[]>();
    for (const t of trades) map.set(t.isin, [...(map.get(t.isin) ?? []), t]);
    return [...map.entries()].map(([isin, ts]) => {
      const existing = this.findExisting(isin, ts[0].name);
      // Se busca en TODAS las inversiones: una operación ya importada nunca se repite, vaya donde vaya.
      const known = this.importedIds();
      return {
        isin,
        name: ts[0].name,
        type: typeOf(ts[0].assetClass, ''),
        trades: ts,
        contributed: round2(ts.filter((t) => t.kind === 'aportacion').reduce((a, t) => a + t.amount, 0)),
        withdrawn: round2(ts.filter((t) => t.kind === 'retirada').reduce((a, t) => a + t.amount, 0)),
        alreadyImported: ts.filter((t) => known.has(t.id)).length,
        resolving: true,
        mode: 'manual',
        target: existing?.id ?? '',
        include: true,
      };
    });
  }

  private importedIds(): Set<string | undefined> {
    return new Set(this.store.assets().flatMap((a) => a.movements.map((m) => m.externalId)).filter(Boolean));
  }

  private findExisting(isin: string, name: string): Asset | undefined {
    const assets = this.store.assets();
    return assets.find((a) => a.isin === isin) ?? assets.find((a) => a.name.toLowerCase() === name.toLowerCase());
  }

  /** Busca el ISIN: precio directo si el plan gratuito lo cubre; si no, su equivalente en EE. UU. */
  async resolve(g: ImportGroup): Promise<ImportGroup> {
    const crypto = g.type === 'cripto';
    let results: SymbolResult[] = [];
    try {
      results = await this.market.search(crypto ? `${g.isin}/USD` : g.isin);
    } catch {
      // sin conexión: se queda como manual
    }
    const direct = crypto
      ? results.find((r) => r.symbol === `${g.isin}/USD` && r.free)
      : results.find((r) => r.free && r.country === 'United States');
    const listing = results.find((r) => r.exchange === 'XETR') ?? results[0];
    const type = typeOf(g.trades[0].assetClass, (direct ?? listing)?.type ?? '');
    if (direct) return { ...g, type, direct, listing, resolving: false, mode: 'directo', name: g.name || direct.name };
    let equivalent: Equivalent | null = null;
    if (listing) {
      equivalent = await this.equivalents.find({ symbol: listing.symbol, name: listing.name || g.name, type: listing.type }).catch(() => null);
    }
    return { ...g, type, listing, equivalent, resolving: false, mode: equivalent ? 'equivalente' : 'manual' };
  }

  /** Crea o completa las inversiones. Devuelve cuántos movimientos se han añadido. */
  async apply(groups: ImportGroup[], onProgress?: (done: number, total: number) => void): Promise<number> {
    const selected = groups.filter((g) => g.include);
    let added = 0;
    for (const [i, g] of selected.entries()) {
      onProgress?.(i, selected.length);
      const known = this.importedIds();
      // Las ya importadas solo se completan (participaciones reales) en la inversión donde están; nunca se copian.
      for (const a of this.store.assets()) {
        const mine = new Set(a.movements.map((m) => m.externalId));
        const patches = g.trades
          .filter((t) => mine.has(t.id))
          .map((t): Movement => ({ id: uid(), externalId: t.id, date: t.date, kind: t.kind, amount: t.amount, realShares: t.shares }));
        if (patches.length) this.store.addMovements(a.id, patches);
      }
      const pending = g.trades.filter((t) => !known.has(t.id));
      if (!pending.length) continue;
      const asset = this.ensureAsset(g);
      const movements: Movement[] = [];
      for (const t of pending) {
        const m: Movement = {
          id: uid(),
          externalId: t.id,
          date: t.date,
          kind: t.kind,
          amount: t.amount,
          realShares: t.shares,
          note: noteFor(t),
        };
        if (asset.symbol && !asset.tracking) {
          // Participaciones reales del bróker; el precio del bróker está en su moneda, no en la del activo.
          m.shares = t.shares;
          if (t.currency === asset.currency && t.shares) m.price = round4(t.amount / t.shares);
        } else if (asset.tracking) {
          try {
            const est = await this.portfolio.estimateShares(asset, t.date, t.amount);
            m.shares = est.shares;
            m.price = est.price;
          } catch {
            // Sin precio ese día: queda solo el importe.
          }
        }
        movements.push(m);
      }
      added += this.store.addMovements(asset.id, movements);
    }
    onProgress?.(selected.length, selected.length);
    void this.portfolio.refresh();
    return added;
  }

  private ensureAsset(g: ImportGroup): Asset {
    const existing = g.target ? this.store.asset(g.target) : undefined;
    if (existing) {
      if (!existing.isin) this.store.updateAsset(existing.id, { isin: g.isin });
      return this.store.asset(existing.id)!;
    }
    const base = { name: g.name, type: g.type, isin: g.isin };
    if (g.mode === 'directo' && g.direct) {
      return this.store.addAsset({ ...base, symbol: g.direct.symbol, exchange: g.direct.exchange, currency: g.direct.currency || 'USD' });
    }
    if (g.mode === 'equivalente' && g.equivalent) {
      const eq = g.equivalent;
      return this.store.addAsset({
        ...base,
        symbol: eq.symbol,
        ticker: g.listing?.symbol ?? g.isin,
        exchange: eq.exchange,
        currency: eq.currency,
        tracking: { name: eq.name, how: eq.how, note: eq.note },
      });
    }
    return this.store.addAsset({ ...base, ticker: g.listing?.symbol, exchange: g.listing?.exchange, currency: this.store.settings().baseCurrency });
  }
}

function typeOf(assetClass: string, instrumentType: string): AssetType {
  const a = assetClass.toUpperCase();
  if (a === 'CRYPTO' || instrumentType.includes('Digital')) return 'cripto';
  if (instrumentType.includes('ETF') || a === 'FUND' || a === 'ETF') return 'etf';
  if (instrumentType.includes('Fund')) return 'fondo';
  if (a === 'STOCK' || instrumentType.includes('Stock')) return 'accion';
  return 'otro';
}

function noteFor(t: ImportedTrade): string {
  if (t.free) return 'Recibido gratis (Saveback o regalo) · Trade Republic';
  if (t.type.includes('SAVING')) return 'Plan de ahorro · Trade Republic';
  return 'Importado de Trade Republic';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
