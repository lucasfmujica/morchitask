# Conectar el login con Google (para Lucas)

Esto se hace **una sola vez**. Habilita el "Continuar con Google" de Morchitask.
Tomá nota: el login de Google también es el que después usaremos para Google Calendar (Fase 4).

## Datos que vas a necesitar

- **URL de callback de Supabase** (la "redirect URI" que pide Google):
  `https://bodkrhcmzdvbeqipsqzx.supabase.co/auth/v1/callback`

## Paso 1 — Crear credenciales en Google Cloud

1. Entrá a https://console.cloud.google.com/ y creá un proyecto nuevo (ej. "Morchitask").
2. En el buscador, andá a **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Tipo de usuario: **Externo** → Crear.
   - Completá nombre de la app ("Morchitask"), tu email de soporte y el de contacto.
   - En **Usuarios de prueba**, agregá tu email y el de Sofi. (Así no hace falta verificación de Google mientras son solo ustedes.)
3. Andá a **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - En **URIs de redireccionamiento autorizados**, pegá exactamente:
     `https://bodkrhcmzdvbeqipsqzx.supabase.co/auth/v1/callback`
   - Crear. Te va a dar un **Client ID** y un **Client Secret**. Copialos.

## Paso 2 — Pegar las credenciales en Supabase

1. Entrá a https://supabase.com/dashboard/project/bodkrhcmzdvbeqipsqzx
2. **Authentication → Providers → Google** → activalo.
3. Pegá el **Client ID** y el **Client Secret** del paso anterior. Guardar.

## Paso 3 — URLs permitidas en Supabase

La app ya está publicada en: **https://productivity-app-three-pink.vercel.app**

1. En Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `https://productivity-app-three-pink.vercel.app`
   - **Redirect URLs** (Add URL): `https://productivity-app-three-pink.vercel.app/**`
2. Guardar.

---

Cuando termines los 3 pasos, decime y probamos el login juntos en la app publicada.

---

# Fase 4 — Conectar Google Calendar (lectura)

Para ver tus eventos de Google Calendar dentro de la Agenda. Son 2 configuraciones.

## A) Habilitar la API + el permiso de calendario en Google Cloud

1. https://console.cloud.google.com/ → tu proyecto "Morchitask".
2. **APIs y servicios → Biblioteca** → buscá **"Google Calendar API"** → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth → Acceso a datos** (o "Permisos/Scopes")
   → **Agregar o quitar permisos** → buscá y marcá:
   `.../auth/calendar.readonly` (Google Calendar API — ver eventos)
   → Actualizar/Guardar.
   - Como la app está en modo "Prueba" y vos/Sofi son usuarios de prueba, no hace falta verificación de Google.

## B) Secrets de la Edge Function en Supabase

La función que lee el calendario necesita tu Client ID y Secret (los mismos de la Parte 1 del login).

1. https://supabase.com/dashboard/project/bodkrhcmzdvbeqipsqzx/settings/functions
   (o **Edge Functions → Secrets**).
2. Agregá dos secrets:
   - `GOOGLE_CLIENT_ID` = tu Client ID de Google
   - `GOOGLE_CLIENT_SECRET` = tu Client Secret de Google
3. Guardar.

## Probar

1. En la app → **Ajustes → Google Calendar → Conectar** → aceptá los permisos (te va a pedir el de calendario).
2. Volvés a la app; andá a **Hoy → pestaña Agenda**: deberían aparecer tus eventos del día (en gris, distintos de tus bloques de tarea).

Avisame cuando hagas A y B y lo probamos juntos.

---

# Fase 4 (2 vías) — mandar tus bloques al calendario

Ya está el código y la función `google-calendar-write` desplegada. Lo único que falta:

1. **Permiso de escritura en Google** (si no estaba): Google Cloud → tu proyecto → **Pantalla de consentimiento → Acceso a datos** → agregá el permiso `.../auth/calendar.events` (dejá también el `calendar.readonly`). _(Confirmaste que ya estaba.)_
2. **Reconectar** en la app (vos **y** Sofi, una vez): **Ajustes → Google Calendar → Reconectar** → aceptás los permisos nuevos. Esto es obligatorio porque cambió el permiso.

No hace falta ningún secret nuevo (usa el mismo `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` de antes).

**Probar:** en **Hoy → Agenda**, ponéle un horario a una tarea → debería aparecer el evento en tu Google Calendar. Sacale el horario → desaparece.

---

# Fase 5 — Notificaciones (recordatorio diario 8:00)

Ya está el código, la función `send-push` desplegada y el cron diario creado (11:00 UTC = 08:00 ART).
Falta cargar los **secrets** en Supabase y redesplegar Vercel.

## A) Secrets en Supabase (Edge Functions → Secrets)

https://supabase.com/dashboard/project/bodkrhcmzdvbeqipsqzx/settings/functions

- `VAPID_PUBLIC_KEY` = tu clave pública de VAPID
- `VAPID_PRIVATE_KEY` = tu clave privada de VAPID
- `VAPID_SUBJECT` = `mailto:lucasfmujica@gmail.com`
- `CRON_SECRET` = el valor que te pasé por el chat _(no lo escribimos acá por seguridad; ya está puesto en el cron, así que tiene que coincidir exactamente)_

## B) Vercel (Environment Variables) + Redeploy

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = tu clave **pública** de VAPID _(la misma de arriba)_
- Después de agregarla, **Redeploy** el proyecto.
- (Para probar en el preview local, agregá la misma línea a `.env.local`.)

## Probar

1. Instalá la app en el iPhone (**Compartir → Agregar a inicio**) y abrila desde el ícono.
2. **Ajustes → Notificaciones → Recordatorio diario** → activar → aceptá el permiso.
3. Avisame y disparo la función `send-push` a mano para que te llegue una de prueba (sin esperar a las 8).

---

# Fase 6 — 4 features nuevas (recordatorios por tarea, colaboración, rachas, analítica)

Las 4 features están en el código (typecheck + 91 tests + lint OK). **Rachas** y **Analítica** no necesitan nada de infra: ya funcionan apenas se despliega el front. Lo que falta es producción para **recordatorios por tarea** y **colaboración**.

## A) Migraciones (Supabase → proyecto `bodkrhcmzdvbeqipsqzx`)

Se aplican con el MCP `apply_migration` (o desde el SQL editor). Dos migraciones:

**1. `add_task_reminders`**

```sql
alter table public.tasks
  add column if not exists remind_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;
create index if not exists tasks_remind_at_pending_idx
  on public.tasks (remind_at)
  where remind_at is not null and reminder_sent_at is null;
```

**2. `add_collaboration`** (comentarios + reacciones + presencia + realtime)

```sql
-- presence: which shared task each person is timing right now
alter table public.tasks add column if not exists active_since timestamptz;

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default app_private.current_household_id() references public.households(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.task_comments enable row level security;
create policy task_comments_select on public.task_comments for select
  using (household_id = app_private.current_household_id());
create policy task_comments_insert on public.task_comments for insert
  with check (household_id = app_private.current_household_id() and author_id = auth.uid());
create policy task_comments_delete on public.task_comments for delete
  using (author_id = auth.uid());
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_reactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default app_private.current_household_id() references public.households(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (task_id, author_id, emoji)
);
alter table public.task_reactions enable row level security;
create policy task_reactions_select on public.task_reactions for select
  using (household_id = app_private.current_household_id());
create policy task_reactions_insert on public.task_reactions for insert
  with check (household_id = app_private.current_household_id() and author_id = auth.uid());
create policy task_reactions_delete on public.task_reactions for delete
  using (author_id = auth.uid());
create index task_reactions_task_idx on public.task_reactions (task_id);

-- realtime for the presence banner (instant "Sofi está en…")
alter publication supabase_realtime add table public.tasks;
```

## B) Edge function + cron (recordatorios por tarea)

1. Desplegar `supabase/functions/send-reminders` (reusa los mismos secrets VAPID + `CRON_SECRET` de la Fase 5; no hace falta ninguno nuevo).
2. Crear el cron `morchitask-task-reminders` que corre cada 5 min y POSTea a `send-reminders` con `x-cron-secret` (mismo patrón que `morchitask-daily-plan`):

```sql
select cron.schedule(
  'morchitask-task-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bodkrhcmzdvbeqipsqzx.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## C) Probar

1. **Recordatorios:** en una tarea con horario, **Detalle → Recordatorio → 5 min antes**. Activá **Ajustes → Notificaciones → Recordatorios de tareas**. Avisame y disparo `send-reminders` a mano con una tarea de `remind_at` pasado.
2. **Colaboración:** abrí una tarea **compartida** → escribí un comentario y reaccioná; Sofi debería verlo. Completá una tarea compartida → aparecen los kudos en la card.
3. **Presencia:** arrancá el cronómetro de una tarea compartida; en el dispositivo de Sofi debería aparecer la barra "Lucas está en: …".
