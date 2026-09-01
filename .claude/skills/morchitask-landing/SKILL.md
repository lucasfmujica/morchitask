---
name: morchitask-landing
description: Rebuild or rewrite Morchitask marketing pages (`/` and `/pricing`) with the product's own visual language. Use when the user asks for landing, marketing, pricing copy, hero, ritual sections, or to stop the page looking like generic AI SaaS.
---

# Morchitask landing

Sos el design lead de un planificador diario usado todos los días por dos personas. La landing vende el ritual, no una plantilla de SaaS. Leé `DESIGN.md` antes de tocar archivos.

## Dónde está el código

- Copy: `messages/es.json` y `messages/en.json`, namespace `marketing` y `pricing`. Keys idénticas en los dos idiomas.
- Home: `app/(marketing)/page.tsx`
- Precio: `app/(marketing)/pricing/page.tsx`
- Shell nav/footer: `app/(marketing)/layout.tsx`
- Tokens: `app/globals.css`
- Precio numérico: `lib/pricing.ts` (`PRICE_MONTHLY_USD=10`, `PRICE_YEARLY_USD=80`, `TRIAL_DAYS=14`, `SUNSAMA_MONTHLY_USD=20`)

No hardcodees strings en JSX. Si agregás una sección, agregás keys en ES y EN.

## Brief

Morchitask es el ritual (planificar, agendar, cerrar) a US$10. Sunsama es la referencia de precio, no el H1. El día tiene capacidad. Si te pasás, se pone rojo. No hay plan gratis. La prueba es 14 días sin tarjeta.

## Superficies permitidas en `/`

1. Fold: H1 de ritual + subtítulo + CTA + un frame de producto a escala real (Hoy o Planificar).
2. Ritual: tres momentos, cada uno con un screenshot grande.
3. Semana: tira de días a ancho completo.
4. Honestidad: lista tipográfica, no grid de cards.
5. Precio corto + CTA final en superficie clara.

No agregues testimonials, logos, feature grid, FAQ en home, ni banda oscura.

## Copy

Usá el texto de `COPY.md` de este pack. No reescribas "para que suene más marketing". No uses em dash ni raya. Vos en ES, you en EN. CTA siempre "Probalo 14 días gratis" / "Try it free for 14 days".

Sunsama aparece recién en "Por qué cuesta la mitad" y en `/pricing`. Nunca en el H1.

## Layout

- Desktop primero, después mobile.
- Un CTA primario por superficie. El secundario es texto, no botón ghost con borde.
- Screenshots: crop de UI real. Si el usuario adjuntó capturas de la app, esas son la referencia. Ignorá capturas de la landing anterior.
- Reusá `Button` y tokens semánticos (`bg-surface`, `text-muted`, `border-border`). Nada de `bg-blue-500`.
- La barra de capacidad puede aparecer in-page como elemento real, no solo en una foto.

## Prohibido

- Recrear el diseño anterior (hero centrado + devices flotando + 4 cards + banda negra).
- Inter, purple, glassmorphism, gradient mesh, 01/02/03 decorativo.
- Cards 2×2 para "lo que no hace".
- Device mockup de notebook y teléfono juntos.
- Emoji como icono de sección. Lucide solo si ya está en el archivo; preferí números o nada.
- Tocar rutas logueadas (`app/(app)`, `components/day`, etc.).
- "Mejorar" privacy/terms.

## Orden de trabajo

1. Leé `DESIGN.md` y `COPY.md`.
2. Actualizá keys en `messages/es.json` y `messages/en.json`.
3. Reestructurá `app/(marketing)/page.tsx` a las cinco superficies.
4. Ajustá `layout.tsx` solo si el footer o nav rompen el aire. No rediseñes el chrome.
5. `/pricing` recibe copy nuevo, no un redesign de card.
6. Corré lo que pida `CLAUDE.md` si tocaste texto: `npm run i18n:scan`.

## Criterio de listo

- El fold muestra capacidad o overflow, no un phone de 300px.
- "Lo que no hace" se lee como prosa, no como features invertidas en cards.
- No hay sección dark.
- ES y EN tienen las mismas keys.
- La página se siente de la misma familia que `/today`, no como un site aparte.
