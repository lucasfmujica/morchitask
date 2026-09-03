# Morchitask — DESIGN.md

Identidad visual para agents. Fuente de verdad: `app/globals.css` y las pantallas logueadas, no una marca inventada para marketing.

## Producto

Planificador diario con ritual. Tres momentos: planificar a la mañana, agendar durante el día, cerrar a la noche. Capacidad real del día. Si te pasás, la barra se pone roja. Dos personas de un hogar, no un equipo.

## Atmósfera

Calma, fría, intencional. Papel de oficina limpio, no SaaS neon. Quietud alrededor de un solo acento. El producto se siente como una libreta con reloj, no como un dashboard de startup.

## Tokens (usar nombres semánticos, no paleta Tailwind cruda)

- Canvas: `#f7f8fa` (`bg-surface` / fondo de marketing)
- Superficie: blanco
- Texto: casi negro
- Texto secundario: `text-muted`
- Acento / CTA / foco: teal `#0d9488` (`--primary`, teal-600)
- Hover CTA: teal-700
- Alerta / overflow / Alta: naranja `#ea580c` (`--accent`)
- Bloques de agenda: pasteles suaves (durazno, menta), nunca saturados
- Barra de capacidad OK: teal/verde
- Barra de capacidad overflow: rojo rayado + copy en naranja/rojo
- Tipografía: DM Sans. Nunca Inter, Arial, Geist, ni system-ui como voz de marca.
- Radio: el de la app (cards de día, chips). No subir el radius en marketing para que "se vea más friendly".
- Sombra: en producto, la mínima que ya usa una card de Semana. En marketing, los frames de producto van en un **bisel** (`Bezel` en `components/marketing/product-frames.tsx`): marco exterior suave, radio un paso mayor y una rampa de sombra de tres paradas. La sombra de reposo es correcta para una card dentro de una lista y equivocada para las únicas imágenes de la landing: sin elevación se leen como capturas pegadas en un documento. Sigue prohibido el mockup flotando con `shadow-2xl` y el device chrome.

## Firma visual (una sola)

La barra de capacidad del día. Verde cuando entra. Roja y rayada cuando te pasaste. Esa barra es el único gesto que la landing puede poner en el fold. No hay segunda firma (no hay patrón geométrico, no hay gradiente, no hay ilustración).

Va dos veces en el fold a propósito: como elemento real de la página debajo del CTA, a tamaño hero, y adentro del frame de Hoy. Primero el concepto, después lo mismo adentro del producto. La de la página usa `capacityState` igual que la app, no una imagen.

## Vocabulario de marketing

Tres marcas se repiten en las cinco superficies. Están definidas en `components/marketing/fold.tsx` y `page.tsx`.

- **La regla de acento.** Una línea corta en naranja arriba de cada título. Evita que una columna abra en tipografía de 40px sobre nada, y ahorra los eyebrows de texto, que significarían inventar copy que `COPY.md` no tiene.
- **El bisel.** Ver arriba.
- **Las superficies alternan.** Canvas tibio, blanco, canvas, blanco, tibio de nuevo. Cinco slabs idénticos separados por hairlines es lo que hacía leer la página como un documento y no como algo diseñado.

El canvas tibio es `color-mix(in srgb, var(--accent) 3.5%, var(--bg))` con un wash direccional anclado a la esquina que ocupa el producto. Es atmósfera, no una banda: sigue prohibida la banda oscura.

Ojo con el z-index: el wash va en un negativo y **necesita `isolate` en la sección**. Sin contexto de apilado pinta detrás del `bg-bg` del layout y desaparece sin error.

## Composición de marketing

Cinco superficies, en este orden, nada más:

1. Fold: nav chica + H1 de ritual + un frame de Hoy o Planificar a escala real.
2. Ritual: tres bloques full-bleed, un screenshot grande por momento.
3. Semana: la tira Lun–Vie a ancho completo. Prueba de que no es otra lista.
4. Honestidad: tipografía, una columna o lista, sin cards 2×2.
5. Precio + cierre: misma superficie clara. CTA teal. Sin banda `#000`.

## Screenshots

- Un frame por sección. Crop agresivo. UI a escala leíble.
- Prohibido: notebook + phone superpuestos, device chrome que come 300px, texto de la app ilegible, sombra de "producto flotando".
- En mobile: o el UI a ancho completo, o un solo phone. Nunca los dos.

## Do

- Reusar tokens y componentes de `components/ui/`.
- Dejar que el chrome de la app (sidebar, chips, barra de capacidad, bloques pastel) sea la imagen.
- Mucho aire. Un eje tipográfico fuerte. CTA único por superficie.
- Copy en vos, oraciones cortas, sin em dash.

## Don't

- Inter, purple gradients, cards anidadas, 01/02/03 decorativo.
- Banda dark decorativa.
- Emojis como iconos de sección.
- Hero que vende el precio contra Sunsama.
- Inventar una paleta "más premium" para marketing.
- Mockups de App Store genéricos.
- Bounce o elastic en hover.
- Secciones nuevas no listadas acá.
