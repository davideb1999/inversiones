import { Injectable, inject } from '@angular/core';
import { AiService, extractJson } from './ai.service';
import { MarketDataService, SymbolResult } from './market-data.service';

/**
 * ETF europeos (UCITS) habituales y el ETF de EE. UU. que sigue el mismo índice o uno casi igual.
 * La clave es el ticker europeo, sin bolsa.
 */
const UCITS_TO_US: Record<string, string> = {
  // Mundo (todo el mundo, desarrollados + emergentes)
  VWCE: 'VT', VWRL: 'VT', VWRA: 'VT', VWRD: 'VT', FWRA: 'VT', SPYY: 'ACWI', IUSQ: 'ACWI', SSAC: 'ACWI', ISAC: 'ACWI', LCWD: 'ACWI',
  // MSCI World (solo desarrollados)
  IWDA: 'URTH', SWDA: 'URTH', EUNL: 'URTH', CW8: 'URTH', AMEW: 'URTH', LYPS: 'URTH', XDWD: 'URTH', SPPW: 'URTH', MWRD: 'URTH', HMWO: 'URTH', SXR8W: 'URTH',
  // S&P 500
  CSPX: 'VOO', SXR8: 'VOO', VUSA: 'VOO', VUAA: 'VOO', VUSD: 'VOO', SPY5: 'VOO', SPXS: 'VOO', IUSA: 'VOO', XSPX: 'VOO', SPXP: 'VOO', '500': 'VOO',
  // Nasdaq 100
  EQQQ: 'QQQ', CNDX: 'QQQ', SXRV: 'QQQ', EQQU: 'QQQ', XNAS: 'QQQ',
  // Emergentes
  EIMI: 'IEMG', IS3N: 'IEMG', EMIM: 'IEMG', VFEM: 'VWO', VFEA: 'VWO', XMME: 'IEMG', AEEM: 'EEM',
  // Europa
  VEUR: 'VGK', VEVE: 'VEA', MEUD: 'VGK', IMEU: 'IEUR', EXSA: 'VGK', SMEA: 'IEUR', XESC: 'FEZ', EXW1: 'FEZ', CSX5: 'FEZ', SX5S: 'FEZ',
  // Países
  IBEXA: 'EWP', XESP: 'EWP', EXS1: 'EWG', DAXEX: 'EWG', ISF: 'EWU', CU2: 'EWU', IJPN: 'EWJ', SJPA: 'EWJ',
  // Dividendos, factores y sectores
  VHYL: 'VYMI', VHYA: 'VYMI', TDIV: 'VYM', IUSN: 'VSS', WSML: 'VSS', QDVE: 'XLK', IUIT: 'XLK', IUHC: 'XLV', IUFS: 'XLF', IUES: 'XLE',
  INRG: 'ICLN', IQQH: 'ICLN', HEAL: 'XLV',
  // Oro y bonos
  SGLD: 'GLD', '4GLD': 'GLD', PHAU: 'GLD', IGLN: 'IAU', SGLN: 'IAU', EGLN: 'IAU',
  AGGH: 'BNDW', VAGF: 'BNDW', AGGG: 'BNDW', IBTM: 'IEF', IDTL: 'TLT', DTLA: 'TLT', VGEA: 'BNDX', IEAG: 'BNDX',
};

/**
 * Si el nombre del ETF dice qué índice sigue, se usa el ETF de EE. UU. de ese índice.
 * Va de más concreto a más general (p. ej. "MSCI World Small Cap" antes que "MSCI World").
 */
const INDEX_TO_US: [RegExp, string][] = [
  [/msci world.*(small|smallcap)|world small cap/i, 'VSS'],
  [/msci world.*(info|tech)/i, 'XLK'],
  [/msci world.*(health)/i, 'XLV'],
  [/msci world.*(momentum)/i, 'MTUM'],
  [/msci world.*(quality)/i, 'QUAL'],
  [/msci world.*(value)/i, 'VLUE'],
  [/msci world.*(min|minimum).*vol/i, 'ACWV'],
  [/msci world|core world|developed world/i, 'URTH'],
  [/all[- ]?world|all[- ]?country|acwi|global all cap|total world/i, 'VT'],
  [/s&p ?500.*(equal)/i, 'RSP'],
  [/s&p ?500.*(info|tech)/i, 'XLK'],
  [/s&p ?500|sp ?500/i, 'VOO'],
  [/nasdaq[- ]?100|nasdaq/i, 'QQQ'],
  [/emerging|msci em\b|\bem imi\b/i, 'IEMG'],
  [/euro stoxx ?50|eurostoxx ?50/i, 'FEZ'],
  [/stoxx europe 600|msci europe|ftse developed europe|europe/i, 'VGK'],
  [/\bdax\b|germany/i, 'EWG'],
  [/\bibex\b|spain/i, 'EWP'],
  [/japan|nikkei|topix/i, 'EWJ'],
  [/ftse 100|united kingdom|\buk\b/i, 'EWU'],
  [/china/i, 'MCHI'],
  [/india/i, 'INDA'],
  [/clean energy/i, 'ICLN'],
  [/semiconductor/i, 'SMH'],
  [/high dividend|dividend aristocrat/i, 'VYMI'],
  [/physical gold|\bgold\b/i, 'GLD'],
  [/global aggregate|global bond/i, 'BNDW'],
];

const GENERIC = new Set([
  'the', 'ucits', 'etf', 'acc', 'dist', 'inc', 'plc', 'sa', 'ag', 'nv', 'se', 'spa', 'corp', 'corporation', 'company', 'group',
  'holding', 'holdings', 'ltd', 'limited', 'adr', 'ordinary', 'shares', 'share', 'class', 'usd', 'eur', 'gbp', 'hedged',
  'accumulating', 'distributing', 'fund', 'index', 'banco', 'bank', 'and', 'de', 'del', 'la', 'el',
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/** ¿Parecen la misma empresa? (comparten alguna palabra significativa del nombre) */
function similar(a: string, b: string): boolean {
  const ta = new Set(tokens(a));
  return tokens(b).some((t) => ta.has(t));
}

/** ETF de EE. UU. que sigue el índice que aparece en el nombre de un ETF europeo. */
export function indexEquivalent(name: string, type: string): string | undefined {
  const looksLikeFund = /etf|fund|ucits|index/i.test(type + ' ' + name) || /msci|s&p|stoxx|ftse|nasdaq/i.test(name);
  if (!looksLikeFund) return undefined;
  return INDEX_TO_US.find(([re]) => re.test(name))?.[1];
}

function isUsFree(r: SymbolResult): boolean {
  return r.free && r.country === 'United States';
}

export interface Equivalent {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  /** Cómo se ha encontrado, para explicárselo al usuario. */
  how: 'tabla' | 'mismo-ticker' | 'nombre' | 'ia';
  note?: string;
}

/** Busca un valor de EE. UU. (con precio gratuito) que se mueva igual que uno europeo. */
@Injectable({ providedIn: 'root' })
export class EquivalentsService {
  private readonly market = inject(MarketDataService);
  private readonly ai = inject(AiService);

  async find(original: { symbol: string; name: string; type: string }): Promise<Equivalent | null> {
    const ticker = original.symbol.toUpperCase().split(/[.:]/)[0];

    // 1. Tabla de ETF conocidos.
    const mapped = UCITS_TO_US[ticker];
    if (mapped) {
      const hit = await this.verify(mapped);
      if (hit) return { ...hit, how: 'tabla' };
    }

    // 1b. ETF que dicen en su nombre el índice que siguen ("Amundi MSCI World...", "iShares Core S&P 500...").
    const byIndex = indexEquivalent(original.name, original.type);
    if (byIndex) {
      const hit = await this.verify(byIndex);
      if (hit) return { ...hit, how: 'tabla' };
    }

    // 2. Mismo ticker en una bolsa de EE. UU. (muchas empresas europeas cotizan también allí: SAN, ASML, SAP...).
    const same = (await this.market.search(ticker).catch(() => [])).find(
      (r) => isUsFree(r) && r.symbol === ticker && similar(r.name, original.name),
    );
    if (same) return { ...this.pick(same), how: 'mismo-ticker' };

    // 3. Por nombre (útil para acciones con ADR).
    const nameQuery = tokens(original.name).slice(0, 2).join(' ');
    if (nameQuery && !original.type.includes('ETF')) {
      const byName = (await this.market.search(nameQuery).catch(() => [])).find(
        (r) => isUsFree(r) && similar(r.name, original.name),
      );
      if (byName) return { ...this.pick(byName), how: 'nombre' };
    }

    // 4. Preguntar a la IA y comprobar que su propuesta existe con precio gratuito.
    if (this.ai.isConfigured()) {
      try {
        const res = await this.ai.ask({
          system: 'Eres un experto en ETF y acciones. Respondes solo con JSON válido.',
          messages: [
            {
              role: 'user',
              content: `Valor europeo: "${original.name}" (ticker ${original.symbol}, tipo ${original.type}).
¿Qué ETF o acción que cotice en una bolsa de EE. UU. (NYSE/Nasdaq) se mueve de forma más parecida? Para un ETF, el que siga el mismo índice o el más cercano; para una acción, su ADR si existe.
Responde SOLO con un bloque \`\`\`json: {"symbol":"VT","name":"...","note":"una frase sencilla de por qué es equivalente"}. Si no hay un equivalente razonable, {"symbol":""}.`,
            },
          ],
          effort: 'low',
        });
        const s = extractJson<{ symbol?: string; note?: string }>(res.text);
        const symbol = (s.symbol ?? '').toUpperCase().trim();
        if (symbol) {
          const hit = await this.verify(symbol);
          if (hit) return { ...hit, how: 'ia', note: s.note };
        }
      } catch {
        // Sin IA o sin respuesta válida: no hay equivalente.
      }
    }
    return null;
  }

  /** Comprueba que un ticker de EE. UU. existe y tiene precio en el plan gratuito. */
  async verify(symbol: string): Promise<Omit<Equivalent, 'how'> | null> {
    const res = await this.market.search(symbol).catch(() => []);
    const hit = res.find((r) => r.symbol === symbol && isUsFree(r));
    return hit ? this.pick(hit) : null;
  }

  private pick(r: SymbolResult): Omit<Equivalent, 'how'> {
    return { symbol: r.symbol, name: r.name, currency: r.currency || 'USD', exchange: r.exchange };
  }
}
