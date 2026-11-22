import { Component, input } from '@angular/core';

/** Formas legales de pagar menos impuestos al sacar beneficios (IRPF, España). */
export const TAX_TIPS: { title: string; text: string }[] = [
  {
    title: 'Saca los beneficios poco a poco',
    text: 'El impuesto sube por tramos: los primeros 6.000 € de ganancia de cada año pagan un 19 %; de 6.000 a 50.000 €, un 21 %, y así hasta el 30 %. Si repartes las ventas en varios años para quedarte en el primer tramo, pagas menos. Solo tributa la ganancia, no todo lo que retiras.',
  },
  {
    title: 'Compensa con lo que va en pérdidas',
    text: 'Si vendes con ganancia, vende también ese mismo año lo que esté en pérdidas y quieras quitarte: las pérdidas restan de las ganancias. Lo que no puedas compensar se arrastra durante 4 años.',
  },
  {
    title: 'Ojo con la regla de los 2 meses',
    text: 'Si vendes con pérdidas y vuelves a comprar el mismo valor en los 2 meses anteriores o posteriores, Hacienda no te deja restar esa pérdida hasta que vendas las nuevas. Si quieres seguir invertido, compra otro producto parecido (por ejemplo, otro ETF de un índice distinto).',
  },
  {
    title: 'Los fondos de inversión se pueden traspasar sin pagar',
    text: 'Con fondos de inversión (no con acciones ni con la mayoría de ETF) puedes pasar el dinero de un fondo a otro sin tributar: solo pagas cuando lo sacas de verdad. Para el largo plazo, un fondo indexado te deja mover el dinero sin coste fiscal.',
  },
  {
    title: 'Dividendos e intereses también compensan',
    text: 'Las pérdidas de vender pueden compensar hasta el 25 % de lo que cobres en dividendos e intereses (y al revés). Y lo que te retienen en EE. UU. por dividendos (normalmente un 15 % con el formulario W-8BEN) se descuenta en la renta para no pagar dos veces.',
  },
  {
    title: 'Primero salen las más antiguas (FIFO)',
    text: 'Si compraste el mismo valor varias veces, Hacienda considera que vendes primero las participaciones más antiguas. Suelen ser las que más han ganado, así que tenlo en cuenta al calcular cuánto vender.',
  },
  {
    title: 'Si tienes más de 65 años',
    text: 'Las ganancias no tributan si reinviertes lo obtenido en una renta vitalicia en 6 meses (hasta 240.000 € en toda tu vida).',
  },
  {
    title: 'Plan de pensiones: ahorra ahora, paga después',
    text: 'Lo que aportas (hasta 1.500 € al año, más si tu empresa tiene plan) reduce tu base general este año. Al rescatarlo tributa como un sueldo, así que compensa si en la jubilación vas a ganar menos que ahora. Puedes rescatar lo aportado hace más de 10 años.',
  },
];

@Component({
  selector: 'app-tax-tips',
  template: `
    <ol class="tips" [class.compact]="compact()">
      @for (t of tips; track t.title) {
        <li><strong>{{ t.title }}.&nbsp;</strong><span class="text-2">{{ t.text }}</span></li>
      }
    </ol>
    <p class="disclaimer">Información general según la normativa del IRPF vigente desde 2025. Cada caso es distinto: para importes grandes, consulta con un asesor fiscal.</p>
  `,
  styles: `
    .tips { margin: 0; padding-left: 20px; display: grid; gap: 10px; font-size: 14px; line-height: 1.55; }
    .tips.compact { gap: 6px; }
  `,
})
export class TaxTips {
  readonly compact = input(false);
  readonly tips = TAX_TIPS;
}
