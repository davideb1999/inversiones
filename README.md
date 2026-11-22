# Cartera

Aplicación web (Angular 22, solo front) para llevar el control de tus inversiones, pensada para quien no sabe de economía.

## Qué incluye

- **Mi cartera**: cuánto has puesto, cuánto vale hoy, ganancia, rentabilidad anual (TIR) y frase en lenguaje llano ("por cada 100 € tienes 112 €"). Gráfica en verde cuando ganas y en rojo cuando pierdes.
- **Gráficas con tramo a elegir**: 1D, 1S, 1M, 3M, 6M, año en curso, 1A, 5A, todo o fechas personalizadas.
- **Registro de aportaciones y retiradas**, importación del CSV de Trade Republic y activos manuales. Los ETF europeos sin precio gratuito siguen a su equivalente de EE. UU.
- **Analizar acción**: cinta de cotizaciones, veredicto de los analistas (comprar/mantener/vender y plazo), rango de precios objetivo al estilo Investing Pro (mínimo, máximo, media, mediana y el 50 % central), modelos de valoración, salud financiera y noticias.
- **Oportunidades**: modelo de tendencia por plazos (día, semana, mes, año), simulación de lo que habría recomendado hace un año frente al S&P 500 y registro de aciertos. Incluye **grandes inversores** (fondos y las operaciones de **Nancy Pelosi**).
- **Declaración de la renta**: ventas del año por FIFO, regla de los 2 meses, dividendos e intereses, impuesto estimado y dónde ponerlo en Renta Web.
- **Asesor IA** (Gemini o Claude) que conoce tu cartera y tu perfil de riesgo.
- **Aprende**: calculadora de interés compuesto con impuestos en España, cómo sacar beneficios pagando lo mínimo de forma legal, reglas de oro y diccionario.
- Diseño para móvil, tablet y ordenador, con tema claro/oscuro. Se puede "instalar" en el móvil (Añadir a pantalla de inicio).

## Login y datos

Todo es local: los usuarios y sus datos se guardan en el `localStorage` del navegador (la contraseña, como hash PBKDF2). No hay servidor.
Para usarlo en otro dispositivo: **Ajustes → Descargar copia** y en el otro dispositivo crea tu usuario e **Importar copia**.

## Claves necesarias (en Ajustes)

| Servicio | Para qué | Precio |
|---|---|---|
| [Twelve Data](https://twelvedata.com/register) | Histórico de precios y gráficas | Gratis (800 consultas/día, 8/min) |
| [Finnhub](https://finnhub.io/register) | Precio en vivo, analistas, salud de la empresa, noticias | Gratis |
| [Alpha Vantage](https://www.alphavantage.co/support/#api-key) | Precio objetivo medio, opinión de analistas y modelos de valoración | Gratis (25 consultas/día) |
| [Financial Modeling Prep](https://site.financialmodelingprep.com/register) (opcional) | Rango de precios objetivo y objetivo de cada analista | Gratis (con límites) |
| [Gemini](https://aistudio.google.com/apikey) (por defecto) | Asesor IA, oportunidades, grandes inversores | Gratis (con límites diarios) |
| [Anthropic](https://console.anthropic.com/settings/keys) (opcional) | Lo mismo, con Claude y búsqueda web | Pago por uso |

La búsqueda en Google de Gemini no entra en su plan gratuito: si no la activas, la app pasa a la IA los precios y titulares del día desde Finnhub.

Las operaciones de congresistas (Nancy Pelosi) se guardan en `public/data/` porque su fuente no permite pedirlas desde el navegador. Se actualizan con `npm run update-data`, y GitHub Actions lo hace solo cada día al publicar.

Los planes gratuitos cubren bolsa de EE. UU. y criptomonedas. Los valores europeos pueden no tener precio: apúntalos como activo manual.

> Las claves se guardan en tu navegador y la IA se llama directamente desde él. No subas nunca tus claves al repositorio.

## Desarrollo

Requiere Node 22.22.3+ o 24.15+.

```bash
npm install
npm start          # http://localhost:4200
npm test -- --watch=false
```

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub (p. ej. `inversiones`) y sube el proyecto a la rama `main`.
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Cada `push` a `main` compila y publica en `https://<tu-usuario>.github.io/inversiones/`.

Las rutas usan `#/` para que funcionen en GitHub Pages sin configuración extra.

---

Herramienta personal. Nada de lo que muestra es asesoramiento financiero profesional.
