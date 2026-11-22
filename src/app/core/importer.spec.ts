import { describe, expect, it, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { EquivalentsService } from './equivalents';
import { ImporterService } from './importer.service';
import { MarketDataService } from './market-data.service';
import { PortfolioService } from './portfolio.service';
import { StoreService } from './store.service';
import { ImportedTrade } from './trade-republic';

function trade(id: string, date: string, amount: number, shares: number, kind: ImportedTrade['kind'] = 'aportacion'): ImportedTrade {
  return { id, date, isin: 'LU1681043599', name: 'MSCI World EUR (Acc)', assetClass: 'FUND', kind, amount, shares, currency: 'EUR', free: false, type: 'BUY' };
}

describe('reimportar el CSV de Trade Republic', () => {
  let store: StoreService;
  let importer: ImporterService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: signal({ id: 'u1' }) } },
        { provide: PortfolioService, useValue: { estimateShares: async () => ({ shares: 1, price: 1 }), refresh: async () => undefined } },
        { provide: MarketDataService, useValue: {} },
        { provide: EquivalentsService, useValue: {} },
      ],
    });
    store = TestBed.inject(StoreService);
    importer = TestBed.inject(ImporterService);
  });

  const count = () => store.assets().reduce((n, a) => n + a.movements.length, 0);

  it('no repite operaciones ya importadas y solo añade las nuevas', async () => {
    const first = [trade('t1', '2026-05-08', 199, 0.3), trade('t2', '2026-05-28', 192, 0.28)];
    await importer.apply(importer.group(first));
    expect(store.assets().length).toBe(1);
    expect(count()).toBe(2);

    // Mismo archivo otra vez: nada nuevo.
    expect(await importer.apply(importer.group(first))).toBe(0);
    expect(count()).toBe(2);

    // Archivo más reciente con una operación nueva: solo entra esa, en la misma inversión.
    const later = [...first, trade('t3', '2026-06-04', 400, 0.59)];
    const groups = importer.group(later);
    expect(groups[0].alreadyImported).toBe(2);
    expect(await importer.apply(groups)).toBe(1);
    expect(store.assets().length).toBe(1);
    expect(count()).toBe(3);
  });

  it('aunque elijas otra inversión de destino, lo ya importado no se copia', async () => {
    const first = [trade('t1', '2026-05-08', 199, 0.3)];
    await importer.apply(importer.group(first));
    const other = store.addAsset({ name: 'Otra', type: 'etf', currency: 'EUR' });
    const groups = importer.group(first).map((g) => ({ ...g, target: other.id }));
    expect(await importer.apply(groups)).toBe(0);
    expect(store.asset(other.id)!.movements.length).toBe(0);
    expect(count()).toBe(1);
  });

  it('completa las participaciones reales de importaciones antiguas sin duplicar', async () => {
    const first = [trade('t1', '2026-05-08', 199, 0.3)];
    await importer.apply(importer.group(first));
    const a = store.assets()[0];
    // Simula una importación antigua que no guardaba realShares.
    store.updateAsset(a.id, { movements: a.movements.map((m) => ({ ...m, realShares: undefined })) });
    await importer.apply(importer.group(first));
    expect(count()).toBe(1);
    expect(store.assets()[0].movements[0].realShares).toBe(0.3);
  });
});
