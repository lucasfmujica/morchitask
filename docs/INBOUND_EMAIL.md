# Captura por mail

Cada persona tiene una dirección privada, por ejemplo
`backlog+<id>.<firma>@in.tudominio.com`. Lo que se reenvía ahí entra como tarea
en su backlog. La dirección aparece en **Ajustes** cuando el servidor está configurado.

El código ya está en producción y no hace nada hasta que se configura. Faltan
tres pasos, todos fuera del repo.

## 1. Variables en Vercel

| Variable                       | Qué es                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| `INBOUND_EMAIL_DOMAIN`         | El dominio que recibe, por ejemplo `in.tudominio.com`                    |
| `INBOUND_EMAIL_SECRET`         | Firma las direcciones. Un string largo al azar. Cambiarlo invalida todas |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | El bearer que manda el relay. Otro string largo al azar                  |

`openssl rand -hex 32` sirve para los dos secretos.

## 2. Recibir mail en el dominio (Cloudflare Email Routing)

Gratis si el dominio ya está en Cloudflare. En el panel del dominio:
**Email → Email Routing**, activarlo y dejar que agregue los registros MX.
Después, una regla **catch-all** que mande a un **Worker** (paso 3).

## 3. El Worker que reenvía al webhook

`wrangler init morchitask-inbound`, `npm i postal-mime`, y este `src/index.js`:

```js
import PostalMime from "postal-mime";

export default {
  async email(message, env) {
    // message.raw se puede leer una sola vez: se junta entero antes de parsear.
    const raw = await new Response(message.raw).arrayBuffer();
    const mail = await PostalMime.parse(raw);
    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WEBHOOK_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        subject: mail.subject ?? "",
        text: mail.text ?? "",
      }),
    });
    // 5xx = error de base en la app: rechazar para que el remitente reintente.
    if (res.status >= 500) message.setReject("Temporary error, try again later");
  },
};
```

Secretos del Worker: `wrangler secret put WEBHOOK_SECRET` (el mismo valor que
`INBOUND_EMAIL_WEBHOOK_SECRET`) y en `wrangler.toml`
`vars = { WEBHOOK_URL = "https://<tu-app>/api/webhooks/inbound-email" }`.

## Qué hace la app con cada mail

- El dueño sale **solo** de la dirección firmada, nunca del remitente.
- Saca el hilo citado, los `Re:`/`Fwd:` y la firma.
- Si hay `ANTHROPIC_API_KEY`, Claude propone hasta 3 tareas con duración,
  prioridad y categoría. Si no, una tarea con el asunto.
- Todo va al **backlog**, nunca a un día. Una fecha mencionada queda en **Vence**.
  El mail entero queda en las notas.
- Tope de 60 mails por persona por día.
