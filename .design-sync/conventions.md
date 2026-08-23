## How to build with Morchitask UI

Morchitask is a calm, dense daily planner (Spanish-language UI). These 11 components are its real primitives. Style everything — including your own layout — with the Tailwind utilities below, which are generated from the system's semantic tokens.

### Setup

**No provider or context wrapper is required.** Components are self-contained. Two things belong on your root element:

```jsx
const { Button, Card, Badge } = window.MorchitaskUI;

<div className="font-sans bg-bg text-fg min-h-screen">{/* your screen */}</div>;
```

- `font-sans` — binds DM Sans, the brand face. Without it text falls back to the browser default and the whole screen reads wrong.
- `bg-bg text-fg` — the page ground and ink. Every surface sits on top of these.

**Dark mode**: add `className="dark"` to any ancestor. All semantic tokens re-bind underneath it, so the same markup renders correctly in both themes. **Do not write `dark:` variants** — they are not compiled in this stylesheet, and the token flip already does the work.

### The styling idiom: semantic utilities, never raw colour

Never write a hex value, `gray-500`, `blue-600`, or an arbitrary `text-[#333]`. Every visual decision has a named token. The full vocabulary:

| Family               | Utilities                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ground               | `bg-bg` (page), `bg-surface` (cards), `bg-surface-2` (subtle fill / secondary buttons)                                                                         |
| Ink                  | `text-fg` (primary), `text-muted` (secondary), `text-subtle` (placeholders, faint meta)                                                                        |
| Lines                | `border-border` (hairline), `border-border-strong` (standalone outline)                                                                                        |
| Primary (teal)       | `bg-primary`, `hover:bg-primary-hover`, `text-on-primary`, `bg-primary-soft`, `text-primary`                                                                   |
| Accent (orange, CTA) | `bg-accent`, `hover:bg-accent-hover`, `text-on-accent`, `bg-accent-soft`, `text-accent`                                                                        |
| State                | `bg-danger` / `text-on-danger` / `text-danger`, `text-success`, `text-warning`                                                                                 |
| Overlay              | `bg-scrim`, `text-on-scrim`                                                                                                                                    |
| Focus ring           | `focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg`                                                       |
| Radius               | `rounded-md` (inputs) · `rounded-lg` (buttons, nav) · `rounded-xl` / `rounded-card` (task cards, same shape) · `rounded-2xl` (sheets, panels) · `rounded-pill` |
| Elevation            | `shadow-soft` (resting) · `shadow-card` (hover/raised) · `shadow-pop` (menus, overlays) · `shadow-drag` (under the cursor)                                     |
| Type scale           | `text-2xs` `text-xs` `text-sm` `text-base` `text-lg` `text-xl` `text-2xl` `text-3xl`                                                                           |

The type scale is deliberately one step tighter than stock Tailwind — `text-base` is 15px, `text-sm` is 13px. That density is what makes it read like a planner rather than a marketing page. Don't compensate by bumping sizes up.

`touch:` is a custom variant targeting pointers without hover — use it to keep hover-revealed controls visible on touch devices (e.g. `opacity-0 touch:opacity-100`).

### Layout classes

Standard Tailwind layout, spacing, and sizing utilities are available (flex, grid, gap, padding, margin, width/height, `max-w-*`). The stylesheet is compiled, not JIT — it carries the utilities the product uses plus a safelisted layout set. Stick to common, round-numbered utilities (`gap-4`, `p-6`, `max-w-2xl`, `grid-cols-3`); an unusual arbitrary value like `w-[327px]` may have no CSS behind it. Prefer composing with the components rather than rebuilding their look.

### Where the truth lives

- `styles.css` — the single entry; `@import`s the fonts and the compiled component styles. Read it (and `_ds_bundle.css`) to confirm any class before relying on it.
- `components/general/<Name>/<Name>.prompt.md` — per-component API and examples.
- `components/general/<Name>/<Name>.d.ts` — exact props.

### An idiomatic screen

```jsx
const { Card, Badge, Button, EmptyState } = window.MorchitaskUI;

<div className="font-sans bg-bg text-fg min-h-screen p-8">
  <h1 className="text-2xl font-semibold">Hoy</h1>

  <div className="mt-6 flex flex-col gap-3 max-w-2xl">
    <Card elevation="raised">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-fg">Revisar el informe de agosto</p>
        <Badge variant="accent">45 min</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">Chequear los números de la segunda quincena.</p>
    </Card>
  </div>

  <Button variant="accent" className="mt-6">
    Planificar el día
  </Button>
</div>;
```

Note the split: library components carry the control (`Card`, `Badge`, `Button`), and the DS's own utilities carry the layout glue around them.
