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
- ✅ Vista **Semana** (estilo Sunsama): el **mini-calendario** y el **filtro por categorías** viven en la **barra lateral única** (como Sunsama), así las columnas de días usan **todo el ancho**; **barra de progreso** arriba de cada día (se llena al tildar tareas, verde al 100%), con tarjetas que muestran el **checklist tildable**, la duración y la categoría
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
- **/week** y **/week/AAAA-MM-DD** — la semana. El **mini-calendario** y el **filtro de categorías** están en la **barra lateral** (en compu), no en una segunda columna, así los días ocupan todo el ancho. Cada día tiene su **barra de progreso** y cada tarjeta muestra su checklist, duración y categoría.
- **/month** y **/month/AAAA-MM-DD** — el calendario mensual.
- **/backlog** — tareas sin fecha asignada.
- **/metas** — tus **objetivos** de la semana y del mes; cada meta muestra una barra de progreso con las tareas que tenés enganchadas.

## Componentes

- **components/ui/** — la "caja de herramientas" visual reusable: `Button`, `Card`, `Input`, `Badge`.
- **components/layout/** — la barra lateral/superior, navegación inferior, el selector de fecha y los **atajos de rituales** (`ritual-nav.tsx`: Planificar / Cerrar día con indicador de estado).
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

**Anchos y márgenes (desktop):** el contenido arranca siempre en el **mismo borde izquierdo**, pegado a la barra lateral (el margen lo pone `<main>` en `components/layout/app-chrome.tsx`, con `md:px-8 md:py-6`). Cada pantalla elige su ancho máximo:

- **Hoy, Semana, Mes** = lienzos anchos (usan casi toda la pantalla).
- **Backlog, Metas, Rutinas, Resumen, Ajustes, Planificar, Cerrar el día** = columna única ancha (`max-w-3xl`), alineada a la izquierda.
- **Foco** = angosto y centrado a propósito (es la pantalla de concentración).

Si querés mover una pantalla de "columna" a "lienzo ancho" o al revés, se cambia el `max-w-…` del `<div>` de más afuera de su componente.

## Cómo personalizar

- **Cambiar un color:** en `app/globals.css`, buscá la sección "SEMANTIC TOKENS" y cambiá el valor (ej. `--primary` para el teal). El cambio se aplica en toda la app.
- **Cambiar la fuente:** en `app/layout.tsx`, donde dice `Plus_Jakarta_Sans`.
- **Categorías:** son **de cada persona**. Las gestionás en Ajustes → Categorías (crear, renombrar, recolorear, borrar) y solo afectan a tu cuenta; las de tu pareja quedan intactas.

## Cambios recientes

- 2026-06-23: **Las tareas compartidas que agendás invitan a la otra persona en Google Calendar.** Si una tarea es **compartida** y le ponés un horario, el evento de Google ahora **suma como invitada a la otra persona del hogar** (le llega la invitación y le aparece en su calendario). Si le sacás el horario o la tarea, también se le cancela. Por detrás: la edge function busca al otro integrante del hogar y su email (de forma segura, solo el servidor lo lee) y lo agrega como invitado del evento.
- 2026-06-23: **Quedó andando la sincronización con Google Calendar (de las dos vías).** Después de bastante depuración, agendar una tarea **crea/actualiza/borra** el evento en tu Google Calendar de verdad. Eran dos cosas: el permiso de Google había quedado **solo de lectura** (ahora la app pide acceso completo en un único permiso, hay que **reconectar** una vez en Ajustes), y al guardar la conexión fallaba una regla de seguridad de la base (se guarda con una función segura). Si alguna vez deja de andar, en Ajustes → Google Calendar → reconectás.
- 2026-06-23: **Tus eventos de Google Calendar ahora aparecen dentro del Día (solo lectura, estilo Sunsama).** Antes los eventos de tu Google Calendar **solo se dibujaban en la grilla de la Agenda** (derecha). Ahora también se ven **en la lista del Día** (arriba, sección "De tu calendario"), con su **color**, **título** y **horario**, ordenados por hora —los de "todo el día" primero—. Son **solo de mirar**: no se tildan, editan ni arrastran (es tu agenda externa). Los eventos que la app misma creó a partir de tus bloques no se duplican. Si arrastrás una tarjeta para agarrarla mejor en compu (la tarjeta entera ahora es agarrable), eso es aparte: esto es solo para _ver_ tus compromisos del día junto con tus tareas.
- 2026-06-23: **Agenda del Día: arrastrar de la lista al calendario, redimensionar bloques y arreglo de Google Calendar.** Tres cosas en la pantalla del **Día**: (1) En compu ahora podés **arrastrar una tarea de la lista de la izquierda directo a una hora del calendario** de la derecha (antes solo se podía desde una mini-lista dentro de la agenda). (2) Un bloque ya agendado se puede **estirar o encoger desde el borde de abajo** para cambiarle la duración, como en Google Calendar (se ajusta de a 15 min). (3) **Arreglé la sincronización con Google Calendar**: al agendar una tarea, el evento **no se estaba creando** en tu calendario (Google rechazaba la escritura por un dato faltante en el pedido). Ahora sí se crea/actualiza/borra. Por detrás: las dos columnas comparten un único sistema de arrastrar; el agendado vive en un helper común (`components/day/use-agenda-scheduling.ts`) y la edge function `google-calendar-write` se redeployó con el fix + logs.
- 2026-06-23: **Arreglo: a veces se colaba una categoría del otro en tu lista.** Aunque las categorías ya son de cada persona, al **abrir la app** (ese instante en que todavía está confirmando quién sos) la lista mostraba por un momento las categorías **de todo el hogar**, así que podías ver, por ejemplo, "Medicos" que creó Sofi. Lo arreglé: mientras no sepa con seguridad quién está conectado, no muestra **ninguna** en vez de mostrar las de todos. También limpié un dato suelto: una tarea de Sofi ("Merendar con mama") había quedado etiquetada con **tu** categoría "Personal"; la reapunté a la "Personal" **de ella**, así nada tuyo afecta a sus tareas.
- 2026-06-23: **Las categorías ahora son de cada persona, no compartidas.** Antes vos y Sofi compartían la misma lista de categorías: si uno **borraba** una o le **cambiaba el color/nombre**, le cambiaba al otro. Ahora **cada uno tiene las suyas** (igual que las tareas). Para que nadie perdiera nada, dupliqué las categorías que tenían en ese momento: una copia para vos y otra para Sofi, y reapunté cada tarea a la categoría de su dueño. Desde ahora, lo que hagas con tus categorías **no toca las del otro**. En las **tareas compartidas** seguís viendo la categoría que le puso el otro (con su color), pero no la podés editar ni borrar; en el selector de categorías cada uno ve **solo las propias**.
- 2026-06-23: **Los rituales del día (Planificar / Cerrar el día) ahora viven en la barra lateral.** Antes solo se llegaba a ellos desde los botones Sol/Luna arriba de la pantalla del Día, el buscador (Cmd+K) o el aviso de las 8am — quedaban medio escondidos. Ahora la **barra lateral** tiene una sección propia con **"Planificar"** (☀) y **"Cerrar día"** (☾), cada uno con un **indicador de estado**: un **puntito** si todavía no lo hiciste y un **tilde ✓** cuando ya lo cerraste hoy. Además se **resalta solo según la hora**: a la mañana se ilumina "Planificar" (en naranja) y a la tarde/noche "Cerrar día" (en teal); cuando ya hiciste los dos, la barra queda tranquila con los dos tildes. En el **celular**, los mismos dos íconos aparecen arriba a la derecha con su indicador. (Nuevo: `components/layout/ritual-nav.tsx`.)
- 2026-06-23: **Vista Semana con una sola barra (como Sunsama).** Antes parecía que había **dos barras** a la izquierda: la de navegación y, al lado, una segunda columna con el **mini-calendario** y el **filtro de categorías** (que encima repetía las categorías que ya están en la barra principal). Ahora todo eso vive en **una sola barra**: el **calendario** aparece arriba de las categorías cuando estás en Semana, y las **categorías de la barra principal se volvieron clickeables para filtrar** (tocás una o varias para ver solo esas tareas; aparece **"Mostrar todas"** para volver a ver todo). Así desaparece la duplicación y las **columnas de los días usan todo el ancho**, con tarjetas más anchas y legibles. El filtro se limpia solo cuando salís de la Semana.
- 2026-06-23: **Layout de desktop más prolijo y aprovechando el espacio.** Antes, al pasar de una pantalla a otra, el contenido **se corría de lugar** (cada pantalla se centraba sola con un ancho distinto, así que el borde izquierdo "saltaba" hasta ~290px de una vista a otra) y varias pantallas quedaban **flotando angostas en el medio**, desperdiciando espacio. Ahora **todo arranca en el mismo borde izquierdo**, pegado a la barra lateral, y el espaciado de arriba es **parejo** en todas las vistas. Las pantallas de columna (Backlog, Metas, Rutinas, Resumen, Ajustes, Planificar, Cerrar el día) son **más anchas** y van alineadas a la izquierda; Hoy/Semana/Mes siguen siendo lienzos anchos; y Foco queda centrado a propósito.
- 2026-06-23: **El cronómetro ahora guarda hasta los segundos.** Antes, cuando pausabas una tarea, el tiempo se guardaba redondeado a minutos enteros, así que una medición de pocos segundos se podía perder. Ahora **al pausar se guarda el tiempo exacto**, incluso si fueron solo 5 segundos, y se va sumando bien sesión tras sesión. En las tarjetas, cuando el tiempo trabajado es menos de un minuto, se ve en segundos (ej. **"23s"**, **"1m 30s"**).
- 2026-06-23: **Selector de tarea más lindo en Foco.** En la pantalla de **Foco**, el menú para elegir "¿en qué te concentrás?" dejó de ser el desplegable gris del sistema: ahora es un selector propio que combina con la app, con el **puntito de color de la categoría**, la **estimación de tiempo** al costado, un **tilde** en la tarea elegida y una apertura suave. Si no tenés tareas para hoy, lo dice; y siempre podés elegir "Sin tarea".
- 2026-06-23: **Crear categoría desde la tarea + tarjetas más compactas.** Ahora, al abrir una tarea, en "Categoría" hay un botón **"+ Nueva"**: escribís el nombre, apretás Enter y se crea la categoría (con un color automático) y **queda asignada a esa tarea** al instante, sin tener que ir al menú de la izquierda. Y arreglé el **espacio de más que quedaba arriba del nombre** en las tarjetas: la hora, el cronómetro y la estimación de tiempo ahora van **en la misma línea del título** (a la derecha), así la tarjeta queda más prolija y ocupa menos alto.
- 2026-06-23: **Cronómetro dentro de las tareas (tiempo real vs estimado).** Ahora podés **medir cuánto tardás** en cada tarea. En cada tarjeta hay un botón de **play ▶** (en el celular siempre visible); al tocarlo arranca un cronómetro y aparece una **barrita flotante** abajo con el nombre de la tarea y el tiempo corriendo, para que no te olvides de pararlo. Cuando lo **detenés**, el tiempo se **suma al "Real"** de la tarea. En el **detalle de la tarea** ves lado a lado el **Real** y el **Estimado**, con su botón **Empezar/Detener**. Solo se cronometra **una tarea a la vez** (si arrancás otra, la anterior se guarda sola), y al **completar** una tarea su cronómetro se detiene. El cronómetro **sigue corriendo aunque cierres y abras** la app.
- 2026-06-23: **Vista Semana estilo Sunsama.** Le sumé a la izquierda (en compu) un **mini-calendario lindo** para moverte entre semanas de un toque —resalta la semana que estás viendo y "hoy"— y un **filtro por categorías** que muestra solo las tareas de las categorías que elijas (botón "Todas" para volver a ver todo). Arriba de cada día ahora hay una **barra de progreso** que se va llenando a medida que tildás las tareas de ese día y se pone **verde** cuando completás todo. Y lo más pedido: las columnas de días **ya no hacen scroll de toda la página** —se deslizan **dentro de su propio panel**, al lado del calendario—. En el **celular** se mantiene el deslizar de a un día (arrancando en "hoy"), ahora con su barra de progreso.
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
