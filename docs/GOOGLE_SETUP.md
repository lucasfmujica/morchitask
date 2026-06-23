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
