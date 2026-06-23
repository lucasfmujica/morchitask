# Morchitask

> Planificá tu día con calma. Una app de productividad para organizarse juntos (Lucas + Sofi).

**App publicada:** https://productivity-app-three-pink.vercel.app

Inspirada en Sunsama: planificación diaria, time-blocking, vistas día/semana/mes, rutinas, Pomodoro y "cierre del día". Funciona como **app instalable (PWA) en iPhone**.

## Identidad de marca

- **Personalidad:** limpia, calma, minimalista, intencional (estilo Sunsama).
- **Colores:** base **gris/blanco frío y limpio** (fondo `#f7f8fa`, tarjetas blancas), texto casi negro, acento **teal** (`#0d9488`) para foco, **naranja** (`#ea580c`) para acciones; el calendario del día usa **bloques pastel** suaves. Tiene modo claro y oscuro.
- **Tipografía:** Plus Jakarta Sans (amigable y moderna).
- Los colores y estilos viven como "tokens" en `app/globals.css` (ver "Cómo personalizar").

## Estado actual (Fase 2 — Semana/Mes + horarios)

Ya se puede planificar por día, **semana y mes**, y **agendar tareas a un horario**
(time-blocking) con una agenda visual por horas. Vos y Sofi comparten el mismo espacio.

- ✅ Diseño base (colores, fuente, modo claro/oscuro) + PWA instalable
- ✅ Base de datos con login, hogar compartido, canales y tareas (con seguridad por fila)
- ✅ Login con Google (requiere una configuración tuya — ver `docs/GOOGLE_SETUP.md`)
- ✅ Vista del **Día**: agregar, completar, editar, borrar, **reordenar arrastrando**
- ✅ Vista **Semana** (estilo Sunsama): columnas anchas por día que se **deslizan al costado**, con tarjetas que muestran el **checklist tildable**, la duración y la categoría
- ✅ Vista **Mes**: calendario con puntos por día; tocás un día y lo planificás
- ✅ **Agenda / time-blocking**: poné un horario a una tarea y vela en una línea de tiempo
- ✅ Backlog (tareas sin fecha)
- ✅ Tests automáticos (fechas, orden, horarios con zona horaria)
- ⏳ Próximo (Fase 3): rutinas que se repiten + traslado de pendientes + cierre del día

## Páginas

- **/** — redirige a "Hoy".
- **/login** — entrar con Google.
- **/today** y **/day/AAAA-MM-DD** — la vista del Día (con pestañas **Lista** y **Agenda**).
- **/week** y **/week/AAAA-MM-DD** — la semana en columnas por día (se deslizan al costado); cada tarjeta muestra su checklist, duración y categoría.
- **/month** y **/month/AAAA-MM-DD** — el calendario mensual.
- **/backlog** — tareas sin fecha asignada.

## Componentes

- **components/ui/** — la "caja de herramientas" visual reusable: `Button`, `Card`, `Input`, `Badge`.
- **components/layout/** — la barra superior, navegación inferior y el selector de fecha.
- **components/tasks/** — la tarjeta de tarea, el cuadro para agregar, la lista y la fila compacta.
- **components/day/** — las vistas de Día (Lista + Agenda) y Backlog.
- **components/week/** y **components/month/** — las vistas de Semana y Mes.
- **lib/queries/** — cómo la app lee y guarda tareas/canales (rápido y optimista).

## Cómo está organizado (para referencia)

- `app/` — las páginas. `app/page.tsx` es el inicio.
- `app/globals.css` — los colores y estilos (los "tokens").
- `components/ui/` — piezas visuales reusables.
- `lib/supabase/` — conexión a la base de datos.
- `public/` — íconos de la app.

## Cómo personalizar

- **Cambiar un color:** en `app/globals.css`, buscá la sección "SEMANTIC TOKENS" y cambiá el valor (ej. `--primary` para el teal). El cambio se aplica en toda la app.
- **Cambiar la fuente:** en `app/layout.tsx`, donde dice `Plus_Jakarta_Sans`.

## Cambios recientes

- 2026-06-23: **Rediseño estilo Sunsama.** Paleta nueva limpia (gris/blanco frío en vez del papel cálido), **tarjetas de tarea más ricas** (checklist tildable adentro, chip de duración, hora agendada y categoría `#nombre`) en Hoy y Semana, **vista Semana en columnas anchas** que se deslizan al costado, y **calendario del día en bloques pastel**. Por detrás: carga de subtareas "por día" (una sola consulta, sin N+1).
- 2026-06-23: **Mejoras mobile.** En el celular, la Semana se desliza de lado y **arranca en el día de hoy**, con scroll más suave (sin barra fea, sin “rebote” lateral). Colores de la PWA (barra de estado y pantalla de carga) actualizados a la paleta nueva.
- 2026-06-23: **Tareas privadas + asignar + compartir.** Cada persona ve solo SUS tareas; en el detalle podés cambiar el "Responsable" (asignarle una tarea al otro) o activar "Compartir" para que la vea también. Las rutinas también son por persona.
- 2026-06-23: "Canal" renombrado a **"Categoría"** en toda la app. Google Calendar: guardado del token más robusto + lee **todos los calendarios** de la cuenta (con su color).
- 2026-06-23: Gestión de categorías (renombrar/recolorear/borrar en Ajustes) y nueva vista **Resumen** (`/resumen`: tareas de la semana + tiempo por canal con barras).
- 2026-06-22: Pulido visual 4 — línea de "ahora" en la Agenda (timeline del día), login rediseñado (glow cálido + features), y contador de bloques de foco en el Pomodoro.
- 2026-06-22: Fase 4 — **Google Calendar (lectura)**. Conectás tu calendario desde Ajustes y tus eventos del día aparecen en la pestaña Agenda. Requiere config tuya en Google Cloud + Supabase (ver `docs/GOOGLE_SETUP.md`, sección Fase 4).
- 2026-06-22: Foco (Pomodoro) + Ajustes + tema — nueva pantalla **Foco** (timer pomodoro 25/5 que suma tiempo a la tarea elegida), **Ajustes** (`/settings`: tema claro/oscuro/sistema, editar nombre, cerrar sesión), y sidebar reorganizado en secciones con Foco y Ajustes.
- 2026-06-22: Pulido visual 3 (Sunsama) — sidebar más rico (canales con "+ agregar", footer de usuario), vista Mes como calendario (hoy en círculo, fines de semana sutiles, dots por día), y Backlog/Rutinas con encabezados con ícono.
- 2026-06-22: Pulido visual 2 (Sunsama) — selector de hora custom (TimePicker, reemplaza el input nativo) y rediseño de la vista Semana (columnas con tiempo planeado por día, hoy resaltado, altura uniforme).
- 2026-06-22: Fase 3 (parte 2) — **traslado de pendientes** (lo no terminado se mueve a mañana, sin tocar las rutinas), **Daily Shutdown** (`/shutdown/AAAA-MM-DD`: resumen, mover pendientes, reflexión + ánimo, cerrar el día) y **auto-agendar** (poné la hora a la que querés terminar y la app acomoda tus tareas en la agenda según su duración).
- 2026-06-22: Fase 3 (parte 1) — **panel de detalle de tarea** (click en una tarea → descripción + checklist de subtareas) y **rutinas** (tareas que se repiten diarias o ciertos días, se generan solas al abrir el día).
- 2026-06-22: Pulido visual estilo Sunsama — micro-animaciones (Framer Motion), tarjeta de tarea rediseñada (franja de canal, chip de tiempo), resumen del día (progreso + tiempo planeado), y **layout de escritorio real**: sidebar fija + Día en dos columnas (lista + agenda) + Semana en 7 columnas. En mobile sigue la barra inferior + columna única.
- 2026-06-22: Fase 2 — vistas Semana y Mes, y time-blocking (pestaña Agenda con línea de tiempo por horas).
- 2026-06-22: Fase 1 — login con Google, hogar compartido, vista del Día (agregar/completar/editar/borrar/reordenar) y Backlog.
- 2026-06-22: Fase 0 — fundación. Diseño base, PWA instalable, base de datos Supabase nueva ("Morchitask"), librería de componentes y tests automáticos.
