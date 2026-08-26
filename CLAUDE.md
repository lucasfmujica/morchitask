# Morchitask

PWA de planificación diaria estilo Sunsama: ritual matutino → time-blocking → cierre del día. Está en producción y la usan dos personas todos los días, así que **romper algo tiene costo real**.

La interfaz está en español y en inglés. Los comentarios y los mensajes de commit, en inglés.

---

## Stack

| Capa       | Qué                                                              |
| ---------- | ---------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, RSC, Server Actions)                     |
| UI         | React 19, TypeScript, Tailwind CSS v4                            |
| Datos      | Neon Postgres + Drizzle ORM                                      |
| Auth       | Auth.js v5 (`next-auth`) + adapter de Drizzle, sesiones en la DB |
| Cliente    | TanStack Query (optimista) + Zustand                             |
| i18n       | next-intl, catálogos en `messages/`                              |
| PWA / push | Serwist + web-push (VAPID)                                       |
| Tests      | Vitest, con pglite para los que tocan la base                    |

`proxy.ts` en la raíz es el middleware (Next 16 lo renombró).

---

## Lo que hay que saber antes de tocar

### 1. El aislamiento entre usuarios vive en el código, no en la base

Esta app **no tiene Row-Level Security**. La tenía con Supabase y se perdió al migrar a Neon. Hoy el aislamiento es que **cada query lleva `householdId`**, que sale de la sesión.

Eso significa que **una query sin `householdId` es una fuga de datos**, no un bug de UX. No la va a atrapar el tipado ni ningún otro test, porque todos los demás corren contra un solo tenant.

- Toda mutación va en `lib/actions/*` y arranca con `requireSession()`.
- Toda lectura va en `lib/db/queries/*` y recibe `householdId` como parámetro.
- `lib/db/queries/isolation.test.ts` levanta un Postgres real y verifica que A nunca lea una fila de B. **Si agregás una query nueva, sumala ahí.**

### 2. Los strings van al catálogo, siempre

Nada de texto visible hardcodeado. Va a `messages/es.json` y `messages/en.json`, con **las mismas claves en los dos**.

```tsx
const t = useTranslations("tasks"); // client component
const t = await getTranslations("tasks"); // server component / server action
```

- Convención de nombres: `t` para el namespace principal del archivo, `tt` para `tasks`, `tcm` para `common`, `tnav` para `nav`.
- **Una frase es un mensaje completo.** No armes oraciones concatenando pedazos alrededor de un `<span>` ni de un ternario: el orden de las palabras y dónde cae el énfasis cambian entre idiomas. Para markup, `t.rich`. Para contar cosas, plurales ICU.
- Un módulo de `lib/` que no es componente **no puede usar el hook**: que devuelva una clave (mirá `lib/priority.ts`, `lib/shutdown.ts`) o que reciba el texto por parámetro.
- Dos reglas de lint rechazan texto suelto en JSX y en atributos. Lo que el lint no ve —un literal adentro de una expresión— lo encuentra `npm run i18n:scan`. **Correlo antes de dar por terminado un cambio con texto.**

### 3. Las fechas se rompen en silencio

`lib/date.ts` es aritmética de calendario, sin idioma. `lib/date-labels.ts` es lo que convierte una fecha en palabras.

No alcanza con cambiar el locale de date-fns: los patrones llevan gramática adentro (`"EEEE d 'de' MMMM"` en inglés da _"Monday 27 de July"_). Y **nunca compares una fecha contra una etiqueta** — había un bug así: comparaba contra el string `"hoy"` y en inglés nunca daba verdadero. Comparás fechas.

### 4. Las migraciones van contra la rama `dev` de Neon

No contra `main`, que está vacía. `npm run db:generate` para crearlas, `npm run db:migrate` para aplicarlas.

---

## Estructura

```
app/(app)/          Pantallas autenticadas (today, day, week, month, plan,
                    shutdown, backlog, metas, routines, focus, settings, resumen)
app/(auth)/login    Entrada
app/api/            Auth.js, calendar, crons, tasks, attachments
components/         Agrupados por feature (day/, week/, tasks/, ui/ …)
lib/actions/        Server Actions — toda mutación
lib/db/             Schema de Drizzle + queries
lib/queries/        Hooks de TanStack Query que envuelven las actions
lib/stores/         Zustand (timers activos, detalle de tarea, paleta)
lib/*.ts            Lógica pura, cada una con su .test.ts al lado
messages/           es.json / en.json
drizzle/migrations/ Migraciones
```

---

## Antes de dar algo por terminado

```bash
npm run typecheck && npx eslint . && npm test && npm run build
npm run i18n:scan     # si tocaste algo con texto
```

El build local necesita `DATABASE_URL` seteada (sirve cualquier string con forma de URL de Postgres; no se conecta).

Otras cosas que valen:

- **Los tests son la red, usala.** Hay 399. Si arreglás un bug, escribí el test que lo hubiera atrapado.
- **Verificá que una regla nueva realmente atrape lo que dice atrapar** metiendo la violación a propósito una vez. Una regla de lint que no corre se ve idéntica a una que pasa.
- Hay pre-commit con Husky + lint-staged: formatea y lintea lo que está en stage.

---

## Convenciones

- **Estilos**: solo tokens semánticos (`bg-surface`, `text-muted`, `border-border`). La paleta cruda de Tailwind (`bg-blue-500`) está prohibida por lint — no responde al tema. Si falta un token, agregalo en `app/globals.css`.
- **Comentarios**: explicá _por qué_, no _qué_. Los que más valen son los que cuentan qué se rompió antes y por eso el código está así.
- **`components/ui/`** es la base compartida (Button, EmptyState, Toaster…). Fijate si ya existe antes de crear uno nuevo.

---

## Cosas que NO son texto de interfaz

Las categorías por defecto (`Trabajo`, `Hogar`, `Personal`) son **filas en la base**, sembradas por usuario en `lib/household-provisioning.ts`. Quien ya las tiene se las queda: renombrarlas al cambiar de idioma sería editarle los datos a alguien. Solo se siembran en el idioma del alta.

`app/manifest.ts` queda en español a propósito: es uno por origen y no hay prefijos de idioma en las rutas. Está anotado en el archivo.
