# Configurar Google (login + Calendar)

Esta guía cubre dos cosas distintas que conviene no mezclar:

1. **Hacer que funcione** — credenciales de OAuth. 15 minutos, y con eso ya podés entrar y sincronizar tu calendario.
2. **Hacer que funcione para desconocidos** — la verificación de Google. Es gratis, no toca una línea de código, y **tarda semanas**. Es el ítem de mayor tiempo de espera de todo el lanzamiento, así que arrancala apenas tengas el dominio.

> Esta guía reemplaza a la anterior, que documentaba el flujo viejo contra Supabase. El login pasó a **Auth.js v5**, así que la URL de callback **cambió**. Si tenés credenciales viejas dando vueltas, la redirect URI que figura ahí ya no sirve.

---

## Parte 1 — Credenciales (lo mínimo para que ande)

### Paso 1: proyecto y APIs

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) y creá un proyecto (o elegí el que ya tengas).
2. **APIs y servicios → Biblioteca** → buscá **Google Calendar API** → **Habilitar**.

Sin ese paso el login anda igual, pero cualquier llamada al calendario devuelve 403.

### Paso 2: pantalla de consentimiento

**APIs y servicios → Pantalla de consentimiento de OAuth**:

- **Tipo de usuario: Externo.** "Interno" solo existe si tenés Google Workspace, y limitaría la app a tu organización.
- **Nombre de la app**, mail de asistencia y mail de contacto del desarrollador: obligatorios.
- **Dominios autorizados**: `morchitask.com` cuando lo tengas. Se puede dejar vacío mientras trabajás en `localhost`.
- **Permisos (scopes)**: agregá estos dos, que son los que pide `lib/auth.ts`:
  - `.../auth/calendar.readonly`
  - `.../auth/calendar.events`

  `openid`, `email` y `profile` no hace falta agregarlos a mano.

- **Usuarios de prueba**: mientras la app esté "En prueba", **solo entran los mails que cargues acá**. Agregate vos y a quien vaya a probarla.

### Paso 3: el ID de cliente

**APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo **Aplicación web**.

**Orígenes autorizados de JavaScript:**

```
http://localhost:3000
https://<tu-dominio-de-produccion>
```

**URIs de redireccionamiento autorizados** — acá está el cambio importante:

```
http://localhost:3000/api/auth/callback/google
https://<tu-dominio-de-produccion>/api/auth/callback/google
```

> ⚠️ Es `/api/auth/callback/google` (Auth.js). **No** el `/auth/v1/callback` de Supabase que decía la guía vieja: ese apuntaba a un proyecto que ya no existe. Tiene que coincidir carácter por carácter, incluida la barra final (no lleva).

Copiá el **ID de cliente** y el **Secreto**.

### Paso 4: variables de entorno

En `.env.local` (y en Vercel → Settings → Environment Variables):

```bash
AUTH_GOOGLE_ID=...apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-...
AUTH_SECRET=            # npx auth secret
NEXT_PUBLIC_APP_URL=https://<tu-dominio>   # el back-link en los eventos del calendario
```

En Vercel, después de tocar variables hay que **redeployar**: no se recargan solas.

### Paso 5: probar

1. Entrá a `/login` y elegí Continuar con Google.
2. La pantalla de permisos tiene que pedir acceso al calendario, no solo al perfil.
3. Andá a **Ajustes → Integraciones**: Google Calendar tiene que decir **Conectado**.
4. En la vista de Día, agendá una tarea en un horario y confirmá que aparece en tu Google Calendar.

**Si algo falla:**

| Síntoma                              | Causa casi siempre                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`              | La URI del Paso 3 no coincide exacto. Compará carácter por carácter.                                                        |
| Entra pero Ajustes dice desconectado | Faltó habilitar la Calendar API, o los scopes no están en la pantalla de consentimiento.                                    |
| Andaba y dejó de andar               | Google solo manda el refresh token cuando hay consentimiento nuevo. Usá **Reconectar** en Ajustes: fuerza `prompt=consent`. |
| `access_denied` con la app en prueba | Ese mail no está en la lista de usuarios de prueba.                                                                         |

---

## Parte 2 — Verificación (para abrirla a desconocidos)

`calendar.readonly` y `calendar.events` son **scopes sensibles**. Sin verificar:

- Todo el que entre ve una pantalla de **"Google no verificó esta aplicación"**, con el botón real escondido detrás de _Configuración avanzada_.
- Tope de **100 usuarios** en total, para siempre.

Las dos cosas matan la conversión, así que esto no es opcional si la app se vende.

**Lo que sí y lo que no:** sensible ≠ restringido. Los scopes restringidos (tipo Gmail) exigen una auditoría de seguridad **CASA** que cuesta plata y meses. Calendar **no** la necesita. Esto es gratis; lo único que cuesta es esperar.

### Qué pide Google

1. **Un dominio propio y verificado.** Verificalo en [Google Search Console](https://search.google.com/search-console) con la **misma cuenta** que es dueña del proyecto de Cloud, y cargalo en _Dominios autorizados_ de la pantalla de consentimiento. **Este es el cuello de botella**: sin dominio no arranca nada de esta parte.
2. **Política de privacidad y términos**, publicados en ese dominio (`/privacy` y `/terms`), enlazados desde la pantalla de consentimiento. Tienen que decir de verdad qué datos de Google se usan y para qué.
3. **Página principal** en el mismo dominio, que explique qué hace la app. No puede ser un login pelado.
4. **Un video en YouTube** (puede ser "no listado") que muestre, con la app corriendo y la URL visible:
   - de dónde sale el pedido de permisos (el botón de login),
   - la pantalla de consentimiento con los scopes,
   - **qué hace la app con cada scope**: leer los eventos del día en la vista de Día, y escribir un bloque al agendar una tarea.

   Es la parte que más rechazos se lleva. Si el video no muestra el uso de _cada_ scope pedido, lo devuelven.

5. **Justificación escrita de cada scope.** Concreta: _"`calendar.events` se usa para crear, actualizar y borrar el evento que corresponde a un bloque de tiempo que el usuario agendó dentro de la app"_.

### Cómo se manda

Pantalla de consentimiento → **Publicar la app** → **Preparar para verificación**. Completás el formulario, adjuntás el video, y esperás. Suelen contestar con idas y vueltas por mail; respondé rápido, porque cada rebote reinicia la espera.

### Orden recomendado

```
comprar el dominio
  └→ verificarlo en Search Console
       └→ publicar /privacy, /terms y la landing
            └→ grabar el video
                 └→ mandar a verificación   ← y acá se espera semanas
```

Mientras esperás, la app funciona normal para los usuarios de prueba: la verificación no bloquea el desarrollo, solo el lanzamiento.

---

## Anexo — Spotify (opcional)

Solo afecta la reproducción en la pantalla de Foco. La app anda perfecto sin esto.

En el [dashboard de Spotify](https://developer.spotify.com/dashboard), creá una app y agregá como Redirect URI:

```
http://localhost:3000/auth/spotify/callback
https://<tu-dominio>/auth/spotify/callback
```

Y en el entorno: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.

Dos límites que conviene saber antes de prometerle esto a nadie: la reproducción dentro de la app **requiere Spotify Premium**, y en modo development Spotify topea en **25 usuarios cargados a mano**. El _extended quota_ se pide aparte y se rechaza seguido, así que no conviene que esto bloquee el lanzamiento.
