// Descarga datos públicos que no se pueden pedir desde el navegador (sin CORS) y los guarda
// como archivos estáticos de la web. Lo ejecuta GitHub Actions cada día antes de publicar.
// Uso: node scripts/update-data.mjs
import { writeFileSync } from 'node:fs';

const MEMBERS = [{ slug: 'nancy-pelosi', name: 'Nancy Pelosi' }];

async function congress(slug) {
  const res = await fetch(`https://tracefour.com/v1/congress/${slug}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Tracefour respondió ${res.status}`);
  const { data } = await res.json();
  return {
    member: data.member.memberName,
    party: data.member.party,
    district: data.member.district,
    trades: data.trades
      .map((t) => ({
        date: t.transactionDate,
        disclosed: t.disclosureDate,
        ticker: t.ticker,
        asset: t.assetDescription,
        assetType: t.assetType,
        type: t.type,
        amountMin: t.amountMin,
        amountMax: t.amountMax,
        amount: t.amountLabel,
        owner: t.owner,
        source: t.sourceLink,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}

for (const m of MEMBERS) {
  try {
    const out = { updatedAt: new Date().toISOString(), ...(await congress(m.slug)) };
    writeFileSync(`public/data/${m.slug}.json`, JSON.stringify(out));
    console.log(`${m.name}: ${out.trades.length} operaciones`);
  } catch (e) {
    // Si falla, se conserva el archivo anterior y la web sigue funcionando.
    console.warn(`${m.name}: no se pudo actualizar (${e.message})`);
  }
}
