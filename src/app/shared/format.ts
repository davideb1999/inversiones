import { Pipe, PipeTransform, inject } from '@angular/core';
import { StoreService } from '../core/store.service';

/** Separador de miles también en números de 4 cifras (5.878 en vez de 5878). */
const ALWAYS_GROUP = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

export function formatMoney(value: number, currency: string, compact = false): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    ...ALWAYS_GROUP,
    notation: compact && Math.abs(value) >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) < 10 && value !== 0 ? 2 : compact ? 0 : 2,
  }).format(value);
}

export function formatPct(value: number | undefined, signed = true): string {
  if (value === undefined || !isFinite(value)) return '—';
  const s = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2, ...ALWAYS_GROUP }).format(value);
  return `${signed && value > 0 ? '+' : ''}${s} %`;
}

/** Importe en la moneda base del usuario. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly store = inject(StoreService);
  transform(value: number | null | undefined, currency?: string, signed = false): string {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    const s = formatMoney(value, currency || this.store.settings().baseCurrency);
    return signed && value > 0 ? '+' + s : s;
  }
}

@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(value: number | null | undefined, signed = true): string {
    return formatPct(value ?? undefined, signed);
  }
}

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 2): string {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, ...ALWAYS_GROUP }).format(value);
  }
}

/** Fecha corta en español. */
@Pipe({ name: 'fecha' })
export class FechaPipe implements PipeTransform {
  transform(value: string | number | null | undefined, withTime = false): string {
    if (!value) return '—';
    const d = typeof value === 'string' && value.length === 10 ? new Date(value + 'T12:00:00') : new Date(value);
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** Markdown mínimo y seguro (se escapa todo el HTML) para mostrar respuestas de la IA. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if (h) {
      flushPara();
      closeList();
      const level = Math.min(4, h[1].length + 2);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (/^---+$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push('<hr>');
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join('\n');
}

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? renderMarkdown(value) : '';
  }
}
