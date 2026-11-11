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
- Tipografía: Figtree para la interfaz, Schibsted Grotesk para títulos (h1 a h3), IBM Plex Mono para horas sueltas. Números tabulares en todo el body. Nunca Inter, Arial ni system-ui como voz de marca.
- Radio: 20px las cards (`rounded-xl`, `rounded-card`), 24px pozos y paneles (`rounded-2xl`), pastilla para botones y navegación.
- Sombra: la mínima (`shadow-soft`) para la card dentro del pozo. Nada de mockup flotando.

## Firma visual (una sola)

La barra de capacidad del día. Verde (degradé `bg-fit`) cuando entra. Rayada en `--danger` cuando te pasaste. Esa barra es el único gesto que la landing puede poner en el fold. No hay segunda firma (no hay patrón geométrico, no hay gradiente, no hay ilustración).

## Composición de marketing

Cinco superficies, en este orden, nada más:

1. Fold: nav chica + H1 de ritual + un frame de Hoy o Planificar a escala real.
2. Ritual: tres bloques full-bleed, un screenshot grande por momento.
3. Semana: la tira Lun–Vie a ancho completo. Prueba de que no es otra lista.
4. Honestidad: tipografía, una columna o lista, sin cards 2×2.
5. Precio + cierre: misma superficie clara. CTA de tinta. Sin banda `#000`.

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
