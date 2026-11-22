import { addDays, today } from './models';

export type RangeKey = '1D' | '1S' | '1M' | '3M' | '6M' | 'YTD' | '1A' | '5A' | 'TODO' | 'CUSTOM';

export interface RangeOption {
  key: RangeKey;
  label: string;
  title: string;
}

export const RANGE_OPTIONS: RangeOption[] = [
  { key: '1D', label: '1D', title: 'Hoy' },
  { key: '1S', label: '1S', title: 'Última semana' },
  { key: '1M', label: '1M', title: 'Último mes' },
  { key: '3M', label: '3M', title: 'Últimos 3 meses' },
  { key: '6M', label: '6M', title: 'Últimos 6 meses' },
  { key: 'YTD', label: 'Año', title: 'Desde el 1 de enero' },
  { key: '1A', label: '1A', title: 'Último año' },
  { key: '5A', label: '5A', title: 'Últimos 5 años' },
  { key: 'TODO', label: 'Todo', title: 'Desde tu primera aportación' },
  { key: 'CUSTOM', label: 'Fechas', title: 'Elige tú las fechas' },
];

export interface DateRange {
  key: RangeKey;
  from: string; // YYYY-MM-DD
  to: string;
}

export function resolveRange(key: RangeKey, earliest?: string, custom?: { from: string; to: string }): DateRange {
  const t = today();
  switch (key) {
    case '1D':
      return { key, from: addDays(t, -1), to: t };
    case '1S':
      return { key, from: addDays(t, -7), to: t };
    case '1M':
      return { key, from: addDays(t, -30), to: t };
    case '3M':
      return { key, from: addDays(t, -91), to: t };
    case '6M':
      return { key, from: addDays(t, -182), to: t };
    case 'YTD':
      return { key, from: `${t.slice(0, 4)}-01-01`, to: t };
    case '1A':
      return { key, from: addDays(t, -365), to: t };
    case '5A':
      return { key, from: addDays(t, -365 * 5), to: t };
    case 'TODO':
      return { key, from: earliest ?? addDays(t, -365), to: t };
    case 'CUSTOM':
      return { key, from: custom?.from ?? addDays(t, -30), to: custom?.to ?? t };
  }
}
