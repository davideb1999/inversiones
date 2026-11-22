export interface GuruProfile {
  name: string;
  fund: string;
  style: string;
  idea: string;
  lesson: string;
}

/** Perfiles fijos (no dependen de la IA) para que el usuario entienda cómo invierte cada uno. */
export const GURUS: GuruProfile[] = [
  {
    name: 'Warren Buffett',
    fund: 'Berkshire Hathaway',
    style: 'Valor a largo plazo',
    idea: 'Compra empresas excelentes, fáciles de entender, a buen precio, y las mantiene durante décadas.',
    lesson: '"Si no estás dispuesto a tener una acción 10 años, no pienses en tenerla ni 10 minutos."',
  },
  {
    name: 'Michael Burry',
    fund: 'Scion Asset Management',
    style: 'Contrario / valor profundo',
    idea: 'Busca lo que el mercado odia o ignora. Famoso por anticipar la crisis de 2008.',
    lesson: 'Ir contra la mayoría puede funcionar, pero exige mucha paciencia y aguantar pérdidas temporales.',
  },
  {
    name: 'Bill Ackman',
    fund: 'Pershing Square',
    style: 'Concentrado y activista',
    idea: 'Pocas empresas (8-12) de gran calidad en las que se implica para mejorarlas.',
    lesson: 'Concentrar mucho funciona si sabes muchísimo de lo que compras; para la mayoría es arriesgado.',
  },
  {
    name: 'Ray Dalio',
    fund: 'Bridgewater Associates',
    style: 'Macro / diversificación total',
    idea: 'Reparte entre acciones, bonos, oro y materias primas para aguantar cualquier escenario económico.',
    lesson: 'Diversificar es "la única comida gratis" de la inversión.',
  },
  {
    name: 'Cathie Wood',
    fund: 'ARK Invest',
    style: 'Crecimiento e innovación',
    idea: 'Apuesta por tecnologías disruptivas (IA, genética, robótica) con visión de 5 años.',
    lesson: 'Puede ganar muchísimo en años buenos y perder más del 50% en años malos.',
  },
  {
    name: 'Terry Smith',
    fund: 'Fundsmith',
    style: 'Calidad',
    idea: '"Compra buenas empresas, no pagues de más y no hagas nada."',
    lesson: 'Hacer pocos movimientos suele ser mejor que estar comprando y vendiendo.',
  },
  {
    name: 'Francisco García Paramés',
    fund: 'Cobas Asset Management',
    style: 'Valor (inversor español)',
    idea: 'Compra empresas baratas respecto a lo que valen, muchas veces fuera de los índices más conocidos.',
    lesson: 'El valor acaba aflorando, pero a veces tarda años.',
  },
  {
    name: 'Stanley Druckenmiller',
    fund: 'Duquesne Family Office',
    style: 'Macro flexible',
    idea: 'Cambia de posiciones rápido según la economía y los bancos centrales.',
    lesson: 'Lo importante no es acertar siempre, sino cuánto ganas cuando aciertas y cuánto pierdes cuando fallas.',
  },
];
