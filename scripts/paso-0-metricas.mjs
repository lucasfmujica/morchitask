/**
 * Paso 0 — ¿la app retiene de verdad?
 *
 * Mide el uso real de cada persona sobre los datos que ya existen, antes de
 * invertir un solo fin de semana más en salir a vender. La pregunta que
 * responde no es "¿funciona la app?" sino "¿alguien vuelve todos los días,
 * y hace el ritual o solo carga tareas?".
 *
 * Uso:  node scripts/paso-0-metricas.mjs
 * Necesita DATABASE_URL en .env.local (la misma que usa drizzle.config.ts).
 *
 * Es de solo lectura: no escribe ni una fila.
 */

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

/** Un día "activo" es un día en que la persona hizo algo, no solo abrió la app:
 *  creó una tarea, completó una, midió tiempo o tocó el diario del día. */
const ACTIVE_DAYS = `
  select owner_id as person, created_at::date as day from tasks
  union
  select owner_id, completed_at::date from tasks where completed_at is not null
  union
  select owner_id, note_date::date from daily_notes
  union
  select user_id, day::date from task_time_entries
`;

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const bar = (n, max, width = 24) => "█".repeat(Math.round((n / Math.max(max, 1)) * width)) || "·";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: people } = await client.query(`
    with activity as (${ACTIVE_DAYS})
    select p.display_name                                as nombre,
           min(a.day)                                    as primera,
           max(a.day)                                    as ultima,
           count(distinct a.day)                         as dias_activos,
           (current_date - max(a.day))                   as dias_sin_usar,
           (max(a.day) - min(a.day) + 1)                 as dias_calendario
    from activity a
    join profiles p on p.id = a.person
    group by p.display_name
    order by dias_activos desc
  `);

  console.log("\n═══ RETENCIÓN POR PERSONA ═══\n");
  console.log(
    pad("Persona", 14) +
      padL("Días activos", 13) +
      padL("Calendario", 12) +
      padL("Constancia", 12) +
      padL("Sin usar", 10),
  );
  for (const r of people) {
    // Con dos o tres días sueltos el porcentaje da 100% y no significa nada:
    // el span de calendario es tan corto como los días activos.
    const consistencia =
      r.dias_calendario >= 14
        ? Math.round((r.dias_activos / r.dias_calendario) * 100) + "%"
        : "sin datos";
    console.log(
      pad(r.nombre, 14) +
        padL(r.dias_activos, 13) +
        padL(r.dias_calendario, 12) +
        padL(consistencia, 12) +
        padL(r.dias_sin_usar + "d", 10),
    );
  }

  const { rows: weekly } = await client.query(`
    with activity as (${ACTIVE_DAYS})
    select p.display_name                          as nombre,
           date_trunc('week', a.day)::date         as semana,
           count(distinct a.day)                   as dias
    from activity a
    join profiles p on p.id = a.person
    group by 1, 2 order by 1, 2
  `);

  console.log("\n═══ DÍAS ACTIVOS POR SEMANA ═══");
  console.log("   (la pregunta: ¿se sostiene o se está muriendo?)\n");
  let currentPerson = null;
  for (const r of weekly) {
    if (r.nombre !== currentPerson) {
      console.log(`\n  ${r.nombre}`);
      currentPerson = r.nombre;
    }
    const semana = new Date(r.semana).toISOString().slice(0, 10);
    console.log(`    ${semana}  ${padL(r.dias, 2)}/7  ${bar(r.dias, 7)}`);
  }

  const { rows: ritual } = await client.query(`
    select p.display_name                                            as nombre,
           count(*)                                                  as dias_con_diario,
           count(*) filter (where d.plan_completed_at is not null)    as planes,
           count(*) filter (where d.shutdown_completed_at is not null) as cierres,
           count(*) filter (where d.reflection is not null and d.reflection <> '') as reflexiones
    from daily_notes d
    join profiles p on p.id = d.owner_id
    group by 1 order by 3 desc
  `);

  console.log("\n\n═══ EL RITUAL — la métrica decisiva ═══");
  console.log("   Si carga tareas pero no completa el ritual, lo que validaste");
  console.log("   es una lista de tareas linda, y eso compite contra Todoist gratis.\n");
  console.log(
    pad("Persona", 14) +
      padL("Planes", 9) +
      padL("Cierres", 9) +
      padL("Reflexiones", 13) +
      padL("% de días", 12),
  );
  for (const r of ritual) {
    const persona = people.find((p) => p.nombre === r.nombre);
    const pct = persona ? Math.round((r.cierres / Math.max(persona.dias_activos, 1)) * 100) : 0;
    console.log(
      pad(r.nombre, 14) +
        padL(r.planes, 9) +
        padL(r.cierres, 9) +
        padL(r.reflexiones, 13) +
        padL(pct + "%", 12),
    );
  }

  const { rows: monthly } = await client.query(`
    select p.display_name                              as nombre,
           to_char(date_trunc('month', t.created_at), 'YYYY-MM') as mes,
           count(*)                                    as creadas,
           count(*) filter (where t.status = 'done')   as completadas,
           count(*) filter (where t.shared)            as compartidas
    from tasks t
    join profiles p on p.id = t.owner_id
    group by 1, 2 order by 1, 2
  `);

  console.log("\n\n═══ TAREAS POR MES ═══\n");
  console.log(
    pad("Persona", 14) +
      pad("Mes", 10) +
      padL("Creadas", 9) +
      padL("Hechas", 9) +
      padL("% hechas", 11) +
      padL("Compartidas", 13),
  );
  for (const r of monthly) {
    const pctHechas = Math.round((r.completadas / Math.max(r.creadas, 1)) * 100);
    console.log(
      pad(r.nombre, 14) +
        pad(r.mes, 10) +
        padL(r.creadas, 9) +
        padL(r.completadas, 9) +
        padL(pctHechas + "%", 11) +
        padL(r.compartidas, 13),
    );
  }

  // ── Veredicto ────────────────────────────────────────────────────────────
  console.log("\n\n═══ VEREDICTO ═══\n");

  const top = people[0];
  if (!top) {
    console.log("  Sin datos. Algo anda mal con la conexión o la base está vacía.");
  } else {
    const consistencia =
      top.dias_calendario >= 14 ? Math.round((top.dias_activos / top.dias_calendario) * 100) : null;
    const suRitual = ritual.find((r) => r.nombre === top.nombre);
    const cierres = suRitual ? Number(suRitual.cierres) : 0;
    const pctRitual = Math.round((cierres / Math.max(top.dias_activos, 1)) * 100);

    const veredictos = [];

    if (consistencia === null) {
      veredictos.push(
        `Muy pocos datos: ${top.nombre} tiene ${top.dias_activos} días de uso en un lapso de ${top.dias_calendario}. No alcanza para concluir nada — volvé a correr esto en unas semanas.`,
      );
    } else if (top.dias_sin_usar > 7) {
      veredictos.push(
        `PARÁ. ${top.nombre} no entra hace ${top.dias_sin_usar} días. "La usa todos los días" no se sostiene en los datos.`,
      );
    } else if (consistencia >= 70) {
      veredictos.push(
        `Retención real: ${top.nombre} usó la app el ${consistencia}% de los días. Es una señal fuerte.`,
      );
    } else if (consistencia >= 40) {
      veredictos.push(
        `Uso regular pero no diario (${consistencia}%). Es un hábito, no un ritual. Ajustá el pitch.`,
      );
    } else {
      veredictos.push(
        `PARÁ. Solo ${consistencia}% de constancia. Eso es uso ocasional, no retención.`,
      );
    }

    if (consistencia === null) {
      veredictos.push(
        `Sobre el ritual todavía no se puede decir nada: ${cierres} cierres en ${top.dias_activos} días de uso es una muestra demasiado chica.`,
      );
    } else if (pctRitual >= 50) {
      veredictos.push(
        `El ritual es lo que la retiene (${pctRitual}% de sus días activos con cierre). El producto es el que creías.`,
      );
    } else if (pctRitual >= 20) {
      veredictos.push(
        `El ritual se usa a medias (${pctRitual}%). Mirá cuál de los dos pasos se saltea y por qué.`,
      );
    } else {
      veredictos.push(
        `OJO: solo ${pctRitual}% de los días activos terminan con el cierre. Lo que la retiene NO es el ritual — es la lista de tareas. Eso cambia todo el posicionamiento y te pone a competir contra Todoist gratis.`,
      );
    }

    veredictos.forEach((v, i) => console.log(`  ${i + 1}. ${v}\n`));
    console.log("  Umbral para seguir al Paso 1: constancia ≥70% y ritual ≥50%.");
    console.log("  Si no lo pasa, el plan dice archivar. Escribilo antes de mirar los números.\n");
  }

  await client.end();
}

main().catch((err) => {
  console.error("\nFalló:", err.message);
  process.exit(1);
});
