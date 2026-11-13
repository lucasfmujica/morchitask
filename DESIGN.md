# Morchitask — DESIGN.md

Identidad visual para agents. Fuente de verdad: `app/globals.css` y las pantallas logueadas, no una marca inventada para marketing.

## Producto

Planificador diario con ritual. Tres momentos: planificar a la mañana, agendar durante el día, cerrar a la noche. Capacidad real del día. Si te pasás, la barra se pone roja. Dos personas de un hogar, no un equipo.

## Atmósfera

Calma, fría, intencional. Papel de oficina limpio, no SaaS neon. Quietud alrededor de un solo acento. El producto se siente como una libreta con reloj, no como un dashboard de startup.

## Tokens (usar nombres semánticos, no paleta Tailwind cruda)

Rediseño bento (noviembre 2026). Fuente de verdad: `app/globals.css`.

- Canvas: `#f4f5f1` (`bg-bg`), papel frío con un toque verde.
- Pozo: `#eceee8` (`bg-surface-2`). Agrupa cosas: sidebar, secciones, segmentados.
- Superficie: blanco (`bg-surface`). La card que vive adentro del pozo.
- Texto: `#1c1f1a` (`text-fg`), secundario `text-muted`.
- Acción principal: pastilla de tinta (`bg-fg text-bg`), una por pantalla. No es verde: el verde es estado.
- Verde `#2c7a4b` (`--primary`): lo que entra. Check hecho, capacidad OK, selección. El degradé `bg-fit` es el único de la app y siempre significa eso.
- Alerta / overflow / Alta: `#b3400f` (`--accent`), siempre con texto, nunca solo color.
- Bloques de agenda: pasteles suaves, nunca saturados.
- Tipografía: Figtree para la interfaz, Fraunces (variable, eje `opsz` en automático) para títulos y números grandes, IBM Plex Mono para horas sueltas. Números tabulares en todo el body. Nunca Inter, Arial ni system-ui como voz de marca.
  - Fraunces (`font-display`) va en h1 a h3, en números de display ("1h 25m", "US$10") y en el wordmark. Peso 600 siempre (`font-semibold`), nunca 700/800: la serif ya tiene contraste y en bold se empasta.
  - Tracking: `-0.01em` de 17 a 40px, `-0.015em` en titulares de marketing (36 a 92px), `-0.02em` en los titulares y números gigantes que no son el hero (72 a 104px). El corte de óptica grande de Fraunces ya viene apretado: con el `-0.045em` que usaba Schibsted las letras se tocan.
  - De 14px para abajo es Figtree semibold, aunque sea un `<h2>`: labels, rótulos de sección chicos, números dentro de un chip. Una serif a ese tamaño al lado de la UI se ve sucia. Card titles de 15 y 16px quedan en Fraunces.
  - Botones, labels, nav, chips: Figtree. La serif no entra en la UI de acción.
- Radio: 20px las cards (`rounded-xl`, `rounded-card`), 24px pozos y paneles (`rounded-2xl`), pastilla para botones y navegación.
- Sombra: la mínima (`shadow-soft`) para la card dentro del pozo. Nada de mockup flotando.

## Firma visual (una sola)

La barra de capacidad del día. Verde (degradé `bg-fit`) cuando entra. Rayada en `--danger` cuando te pasaste. En la landing va a ancho completo justo debajo del hero; el fold lo ocupa el ritual en el teléfono. No hay segunda firma (no hay patrón geométrico ni ilustración); los lavados menta y durazno de marketing son el color del momento del día, no una firma.

## Composición de marketing

Aprobada en el canvas (noviembre 2026, `Landing.dc.html`). Reemplaza la lista de cinco superficies anterior. Código: `app/(marketing)/page.tsx`, `layout.tsx` y `components/marketing/`. En este orden:

1. Nav: logo (tile `bg-fit` con check) + wordmark, links en la pastilla segmentada del producto (`bg-surface-2`), "Entrar" como texto, "Probar gratis" en pastilla de tinta.
2. Hero en dos columnas: el H1 contiene la keyword (eyebrow mono "Planificador diario con time-blocking" adentro del `<h1>`) y el titular de 92px (56px en mobile) con el resaltador `--marker` bajo "Cerrá la noche."; subtítulo, CTA de tinta con glow, nota de precio. A la derecha, un pozo de 520px con el teléfono pasando los tres rituales como stories (mañana, día, noche, 5s cada uno, tabs clickeables); el color del pozo sigue la hora (menta a la mañana, durazno a la noche).
3. Tira de capacidad a ancho completo: la firma visual, fuera del fold.
4. Bento "Un día con principio y final" en grilla de 12 columnas (una sola en mobile): agenda con barra que se pasa (7), anillo de capacidad sobre lavado menta (5), dictado, mail y reacomodar (4 cada uno), semana (6), Foco en tile oscuro `bg-ink` (6), "para vos y una persona más" (12). Cada tile es UI real animada en loop, no ilustración.
5. Precio: barras contra Sunsama (7) + tile menta con el precio grande (5). Sunsama aparece acá, nunca en el hero.
6. "Lo que no hace": lista ordenada tipográfica, una columna. Sin cards.
7. Cierre: panel redondeado con degradé menta a durazno (`--wash-mint` → `--wash-peach`) y CTA de tinta.
8. Footer: solo links que existen (Precio, Privacidad, Términos, cambio de idioma).

Aprobado y ya no prohibido: la grilla bento, el tile oscuro de Foco (solo ese, no una banda) y los lavados menta/durazno del ritual, anillo, precio y cierre. Las animaciones viven en el bloque "MARKETING MOTION" de `app/globals.css` y se apagan con `prefers-reduced-motion`.

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
- Banda dark decorativa a ancho completo (el tile de Foco es la única superficie oscura).
- Emojis como iconos de sección.
- Hero que vende el precio contra Sunsama.
- Inventar una paleta "más premium" para marketing.
- Mockups de App Store genéricos.
- Bounce o elastic en hover.
- Secciones nuevas no listadas en "Composición de marketing".
