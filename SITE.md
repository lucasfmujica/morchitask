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
- **/plan/AAAA-MM-DD** — **planificar el día** (ritual de la mañana): poné tu foco del día, traé lo que quedó de ayer o del backlog, ajustá duraciones y mirá la **capacidad del día**.
- **/week** y **/week/AAAA-MM-DD** — la semana en columnas por día (se deslizan al costado); cada tarjeta muestra su checklist, duración y categoría.
- **/month** y **/month/AAAA-MM-DD** — el calendario mensual.
- **/backlog** — tareas sin fecha asignada.
- **/metas** — tus **objetivos** de la semana y del mes; cada meta muestra una barra de progreso con las tareas que tenés enganchadas.

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

- 2026-06-23: **Arreglos en el detalle de tarea (sobre todo en celular).** Antes, al abrir una tarea y tocar una opción (Compartir, Categoría, Estimación, Meta), **no se veía ningún cambio** porque la ventana mostraba una "foto" vieja de la tarea: ahora **reacciona al instante** a lo que tocás. El **checklist** quedó mucho más claro: el casillero para **agregar un ítem** ahora es un campo visible con su propio botón **+** (antes casi no se veía), los ítems largos se ven completos (sin cortarse) y el botón de **borrar ítem** aparece siempre en el celular. La **estimación** suma la opción **2 h** y los botones de opciones son más grandes y fáciles de tocar, con la selección bien marcada.
- 2026-06-23: **Más colores para categorías + repaso de mobile.** Ahora hay **16 colores** para elegir en cada categoría (incluyendo **amarillo** y **celeste**, además de cian, índigo, fucsia, lima, esmeralda y más), ordenados como un arcoíris suave en el selector (Ajustes → Categorías). Arreglé la tarjeta de **Google Calendar en Ajustes**, que en el celular se desbordaba cuando estaba conectada: ahora el botón/etiquetas se acomodan **debajo** del texto en pantallas chicas. Y los botones que antes **solo aparecían al pasar el mouse** (borrar tarea, "+ tiempo", borrar subtarea/meta, la manija para mover tareas en la Semana) ahora **se ven siempre en pantallas táctiles**, así se pueden usar desde el celular.
- 2026-06-23: **Google Calendar en dos vías + Recordatorio diario.** Ahora cuando le ponés un **horario a una tarea** (pestaña Agenda), se crea/actualiza sola en tu **Google Calendar**; si le sacás el horario o borrás la tarea, también se borra del calendario. Lo activás en **Ajustes → Google Calendar → Reconectar** (vos y Sofi, una vez). Y un **recordatorio diario**: a las **8:00** te llega una notificación para planificar el día (abre directo la pantalla de planificar) — lo prendés en **Ajustes → Notificaciones**. En iPhone hace falta tener la app **instalada** (Compartir → Agregar a inicio).
- 2026-06-23: **Detalles que dan gusto (delight).** **Buscador rápido con ⌘K / Ctrl+K**: abrís una barra para saltar a cualquier vista o crear una tarea al toque desde donde estés. **Confeti** cuando terminás todas tus tareas del día (y al cerrar el día con todo hecho). En **Foco**, cuando termina un bloque suena un _chime_ y te llega una notificación. En el **celular**, **deslizá una tarea hacia la derecha para completarla** (solo touch; en compu no cambia nada). Todo respeta "menos animaciones" si lo tenés activado en el sistema.
- 2026-06-23: **Metas (objetivos de semana y mes).** Nueva pantalla `/metas` para anotar tus objetivos. Desde el **detalle de una tarea** la enganchás a una meta ("Meta"), y cada meta muestra una **barra de progreso** con cuántas de sus tareas terminaste. Las tareas enganchadas muestran un pequeño ícono de meta. Vos y Sofi ven las metas del otro, pero cada uno edita las suyas.
- 2026-06-23: **Planificá tu día (ritual de la mañana) + Capacidad del día.** Nueva pantalla `/plan/AAAA-MM-DD` (botón "Planificar" arriba en el Día): escribís tu **foco del día**, traés con un toque lo que **quedó de ayer** o del **backlog**, y ajustás las duraciones. Arriba, una **barra de capacidad** te muestra cuánto tiempo planeaste vs. tu objetivo del día (6 h por defecto) y se pone **amarilla/roja** si te pasás, con un aviso para sacar algo o moverlo a mañana. La misma barra aparece también en la vista del Día. Así se completa el círculo: **planificar a la mañana ↔ cerrar a la noche**.
- 2026-06-23: **Arrastrar tareas entre días en la Semana** (agarrás la tarjeta de la manija y la soltás en otra columna). **Ayuda de atajos** con la tecla `?`, y las flechas ← → ahora también cambian de semana (en Semana) y de mes (en Mes).
- 2026-06-23: **Arrastrar tareas al calendario** (Agenda) para agendarlas o moverlas, con resaltado del horario. **Atajos de teclado** (N = nueva tarea, ← → = cambiar de día, T = ir a hoy). Indicador **"de [Nombre]"** en tareas que te asignó la otra persona, e indicador **"compartida"**. Estados vacíos más cálidos con tip de teclado.
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
