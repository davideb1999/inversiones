import { describe, expect, it } from 'vitest';
import { ImportError, parseCsv, parseTradeRepublic } from './trade-republic';

const HEADER =
  'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code';

function row(fields: Record<string, string>): string {
  return HEADER.split(',')
    .map((h) => `"${fields[h] ?? ''}"`)
    .join(',');
}

const csv = [
  HEADER,
  row({ datetime: '2025-01-02T10:00:00Z', date: '2025-01-02', category: 'TRADING', type: 'BUY', asset_class: 'FUND', name: 'Vanguard FTSE All-World', symbol: 'IE00BK5BQT80', shares: '2.0000000000', price: '120.50', amount: '-241.00', fee: '-1.00', currency: 'EUR', transaction_id: 't1' }),
  row({ date: '2025-02-01', category: 'TRADING', type: 'SAVINGS_PLAN_EXECUTION', asset_class: 'FUND', name: 'Vanguard FTSE All-World', symbol: 'IE00BK5BQT80', shares: '0.4100000000', price: '121.95', amount: '-50.00', currency: 'EUR', transaction_id: 't2' }),
  row({ date: '2025-03-10', category: 'TRADING', type: 'SELL', asset_class: 'STOCK', name: 'Apple Inc.', symbol: 'US0378331005', shares: '-1.0000000000', price: '200.00', amount: '200.00', fee: '-1.00', tax: '-10.00', currency: 'EUR', transaction_id: 't3' }),
  row({ date: '2025-03-11', category: 'DELIVERY', type: 'FREE_RECEIPT', asset_class: 'CRYPTO', name: 'Bitcoin', symbol: 'BTC', shares: '0.0001', price: '90000', currency: 'EUR', transaction_id: 't4' }),
  row({ date: '2025-03-12', category: 'CASH', type: 'DIVIDEND', asset_class: 'STOCK', symbol: 'US0378331005', amount: '5.00', tax: '-0.75', currency: 'EUR', transaction_id: 't5' }),
  row({ date: '2025-03-13', category: 'CASH', type: 'CARD_TRANSACTION', amount: '-12.30', currency: 'EUR', transaction_id: 't6' }),
  row({ date: '2025-03-13', category: 'CASH', type: 'CARD_TRANSACTION', amount: '-12.30', currency: 'EUR', transaction_id: 't6' }),
].join('\n');

describe('parseCsv', () => {
  it('respeta comillas, comas internas y comillas escapadas', () => {
    expect(parseCsv('a,b\n"x, y","He said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'He said "hi"'],
    ]);
  });
});

describe('parseTradeRepublic', () => {
  const r = parseTradeRepublic(csv);

  it('importa compras con la comisión incluida', () => {
    const buy = r.trades.find((t) => t.id === 't1')!;
    expect(buy).toMatchObject({ kind: 'aportacion', amount: 242, shares: 2, isin: 'IE00BK5BQT80' });
  });

  it('reconoce los planes de ahorro como compras', () => {
    expect(r.trades.find((t) => t.id === 't2')).toMatchObject({ kind: 'aportacion', amount: 50, shares: 0.41 });
  });

  it('importa ventas netas de comisión e impuestos', () => {
    expect(r.trades.find((t) => t.id === 't3')).toMatchObject({ kind: 'retirada', amount: 189, shares: 1 });
  });

  it('marca lo recibido gratis', () => {
    expect(r.trades.find((t) => t.id === 't4')).toMatchObject({ free: true, amount: 9, isin: 'BTC' });
  });

  it('suma dividendos netos e ignora la tarjeta (sin duplicados)', () => {
    expect(r.dividends).toBe(4.25);
    expect(r.ignored).toEqual([{ label: 'Pagos con tarjeta', count: 1 }]);
    expect(r.trades.length).toBe(4);
  });

  it('rechaza archivos que no son de Trade Republic', () => {
    expect(() => parseTradeRepublic('fecha,importe\n2025-01-01,10')).toThrow(ImportError);
  });
});
