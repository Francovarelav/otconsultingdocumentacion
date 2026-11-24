// Rutina diaria (SOP-08): convierte las reglas de negocio en una bandeja de tareas concreta.
// Detectores deterministas → tareas con ID determinista (no duplica, no reabre lo hecho/descartado,
// cierra sola lo que ya se corrigió). Al final Gemini redacta el resumen del día.
import { FieldValue } from "firebase-admin/firestore";
import { coleccion, generar, hoyMonterrey, invalidar, textoDe } from "./comun.js";
import { esLaborable, leerJornada, sumarDias } from "./operacion.js";

const P = { alta: "alta", media: "media", baja: "baja" };

function detectar({ colaboradores, asignaciones, activos, matriz, operacion }) {
  const t = [];
  const add = (id, tarea) => t.push({ id, ...tarea });
  const plantilla = colaboradores.filter((c) => c.es_plantilla !== 0);
  const conMatriz = new Set(matriz.map((m) => m.id_colaborador));
  const nombre = (c) => `${c.nombre} (${c.id_colaborador})`;

  for (const c of plantilla) {
    const id = c.id_colaborador;
    if (c.estatus === "Baja") {
      if (!c.id_causa_baja)
        add(`causa_baja__${id}`, { tipo: "causa_baja", regla: 6, prioridad: P.alta, id_colaborador: id,
          titulo: `Capturar causa de baja de ${nombre(c)}`,
          detalle: `Salida${c.fecha_baja ? ` del ${String(c.fecha_baja).slice(0, 10)}` : " sin fecha"}. Elegir la causa del catálogo CB01–CB10 con RH; sin ella no se puede medir rotación voluntaria ni costo de reemplazo.` });
      if (c.falta_fecha_baja === 1)
        add(`fecha_baja__${id}`, { tipo: "fecha_baja", regla: 6, prioridad: P.alta, id_colaborador: id,
          titulo: `Capturar fecha de baja de ${nombre(c)}`,
          detalle: "La baja no tiene fecha; sin ella no entra a la rotación mensual ni a la permanencia." });
      continue;
    }
    // Activos
    if (c.inconsistencia_estatus_fecha === 1)
      add(`estatus_fecha__${id}`, { tipo: "estatus", regla: 6, prioridad: P.alta, id_colaborador: id,
        titulo: `Confirmar si ${nombre(c)} sigue activo`,
        detalle: "Venía como activo con fecha de baja; el pipeline nulificó la fecha. RH debe confirmar el estatus real." });

    const faltan = [
      c.falta_puesto === 1 && "puesto", c.falta_departamento === 1 && "departamento",
      c.falta_esquema_nomina === 1 && "esquema de nómina", c.falta_sueldo === 1 && "sueldo",
    ].filter(Boolean);
    if (faltan.length)
      add(`regla5__${id}`, { tipo: "datos_basicos", regla: 5, prioridad: P.alta, id_colaborador: id,
        titulo: `Completar ${faltan.join(", ")} de ${nombre(c)}`,
        detalle: `Un activo debe tener puesto, departamento, esquema de nómina y sueldo > $0. Falta: ${faltan.join(", ")}.` });

    if (c.en_banca === 1) {
      const dias = c.dias_en_banca ?? null;
      add(`banca__${id}`, { tipo: "banca", regla: 14, prioridad: dias == null ? P.media : dias > 180 ? P.alta : dias > 60 ? P.media : P.baja,
        id_colaborador: id, titulo: `Proponer asignación para ${nombre(c)}`,
        detalle: `En banca${dias != null ? ` desde hace ${dias} días` : ""}${c.puesto ? ` · ${c.puesto}` : ""}. Buscar proyecto con sus habilidades (SOP-03).` });
    }
    if (c.sobreasignado === 1)
      add(`sobreasignado__${id}`, { tipo: "sobreasignado", regla: 11, prioridad: P.alta, id_colaborador: id,
        titulo: `Revisar dedicación de ${nombre(c)}`,
        detalle: `Dedicación total ${c.dedicacion_total_pct ?? "> 100"}%: ajustar porcentajes o fechas de sus asignaciones.` });
    if (!conMatriz.has(id))
      add(`sin_matriz__${id}`, { tipo: "matriz", regla: 19, prioridad: P.media, id_colaborador: id,
        titulo: `Evaluar habilidades de ${nombre(c)}`,
        detalle: "No tiene ninguna habilidad evaluada; sin matriz no se le puede asignar con datos (SOP-04)." });
    if (c.expediente_completo !== 1)
      add(`expediente__${id}`, { tipo: "expediente", regla: 9, prioridad: c.doc_contrato === 1 ? P.baja : P.media, id_colaborador: id,
        titulo: `Completar expediente de ${nombre(c)}`,
        detalle: `Expediente al ${c.pct_expediente ?? "?"}%${c.doc_contrato === 1 ? "" : "; falta el contrato"}.` });
  }

  for (const a of asignaciones) {
    if (a.vigente === 1 && a.dias_para_fin_asignacion != null && a.dias_para_fin_asignacion <= 60)
      add(`asignacion_vence__${a.id_asignacion}`, { tipo: "asignacion_vence", regla: 12, prioridad: a.dias_para_fin_asignacion <= 30 ? P.alta : P.media,
        id_colaborador: a.id_colaborador, id_ref: a.id_asignacion,
        titulo: `Asignación ${a.id_asignacion} vence en ${a.dias_para_fin_asignacion} días`,
        detalle: `Colaborador ${a.id_colaborador} · proyecto ${a.id_proyecto ?? "sin proyecto"}. Decidir renovación o siguiente proyecto antes de que pase a banca.` });
  }

  for (const e of activos) {
    if (e.pendiente_recuperar === 1)
      add(`equipo__${e.cod_activo}`, { tipo: "equipo_recuperar", regla: 18, prioridad: P.alta, id_colaborador: e.id_colaborador, id_ref: e.cod_activo,
        titulo: `Recuperar ${e.tipo ?? "equipo"} ${e.cod_activo}`,
        detalle: `A nombre de ${e.id_colaborador}, ya dado de baja. ${e.marca ?? ""} ${e.modelo ?? ""}${e.costo ? ` · $${e.costo}` : " · sin costo capturado"} (SOP-07).`.trim() });
  }

  // Operación: asistencia de ayer y solicitudes sin atender (solo si RH activó el control de asistencia)
  if (operacion) {
    const { ayer, jornada, checadasAyer, ausenciasAyer, pendientes, hoy } = operacion;
    if (jornada.inicio_registro && ayer >= jornada.inicio_registro && esLaborable(ayer, jornada)) {
      for (const c of plantilla) {
        if (c.estatus !== "Activo") continue;
        if (c.fecha_incorporacion && String(c.fecha_incorporacion).slice(0, 10) > ayer) continue;
        const a = checadasAyer.get(c.id_colaborador);
        if (!a && !ausenciasAyer.has(c.id_colaborador))
          add(`falta__${c.id_colaborador}__${ayer}`, { tipo: "falta", regla: 15, prioridad: P.media, id_colaborador: c.id_colaborador,
            titulo: `Justificar falta de ${nombre(c)} del ${ayer}`,
            detalle: "No checó entrada y no tiene vacaciones, permiso ni incapacidad aprobados. Si fue permiso, regístralo en Vacaciones; si no, cuenta como falta en la prenómina." });
        else if (a && !a.hora_salida)
          add(`sin_salida__${c.id_colaborador}__${ayer}`, { tipo: "sin_salida", regla: 15, prioridad: P.baja, id_colaborador: c.id_colaborador,
            titulo: `Registrar salida de ${nombre(c)} del ${ayer}`,
            detalle: `Entró a las ${a.hora_entrada} y no registró salida; las horas trabajadas quedan incompletas.` });
      }
    }
    for (const v of pendientes) {
      const dias = v.creada?.toDate ? Math.floor((Date.now() - v.creada.toDate().getTime()) / 864e5) : 0;
      if (dias >= 2 || v.inicio <= sumarDias(hoy, 3))
        add(`vacaciones__${v.id}`, { tipo: "vacaciones_pendiente", regla: 6, prioridad: v.inicio <= sumarDias(hoy, 3) ? P.alta : P.media, id_colaborador: v.id_colaborador, id_ref: v.id,
          titulo: `Resolver solicitud de ${v.tipo.replace(/_/g, " ")} de ${v.nombre ?? v.id_colaborador}`,
          detalle: `${v.inicio} a ${v.fin} · ${v.dias_habiles} días hábiles · pendiente desde hace ${dias} días.` });
    }
  }

  // Capturas agregadas (tablas M14 vacías)
  const evalSinFecha = matriz.filter((m) => !m.fecha_evaluacion).length;
  if (evalSinFecha)
    add("captura__fecha_evaluacion", { tipo: "captura", regla: 19, prioridad: P.media,
      titulo: `Fechar ${evalSinFecha} evaluaciones de habilidades`,
      detalle: "Ninguna evaluación tiene fecha; sin ella no se sabe si la matriz está actualizada (< 12 meses)." });
  const vigentes = asignaciones.filter((a) => a.vigente === 1).length;
  add("captura__registro_horas", { tipo: "captura", regla: 15, prioridad: P.alta,
    titulo: `Arrancar registro de horas semanales (${vigentes} asignaciones vigentes)`,
    detalle: "Sin horas facturables no se puede medir utilización real ni margen." });
  add("captura__tarifas", { tipo: "captura", regla: 16, prioridad: P.alta,
    titulo: "Capturar tarifa por hora de cada proyecto",
    detalle: "Desbloquea ingreso y margen por proyecto." });
  add("captura__certificaciones", { tipo: "captura", regla: 20, prioridad: P.media,
    titulo: "Registrar certificaciones con fecha de vencimiento",
    detalle: "Hoy no hay certificaciones con vigencia; desbloquea dias_vencim_cert." });
  return t;
}

export async function ejecutarRutina({ db, cliente, origen = "programada" }) {
  invalidar();
  const [colaboradores, asignaciones, activos, matriz] = await Promise.all([
    coleccion(db, "colaboradores", { fresco: true }), coleccion(db, "asignaciones", { fresco: true }),
    coleccion(db, "activos", { fresco: true }), coleccion(db, "matriz", { fresco: true }),
  ]);
  const hoy = hoyMonterrey();
  const ayer = sumarDias(hoy, -1);
  const [jornada, asisAyer, vacs] = await Promise.all([
    leerJornada(db),
    db.collection("asistencia").where("fecha", "==", ayer).get(),
    db.collection("vacaciones").where("estado", "in", ["pendiente", "aprobada"]).get(),
  ]);
  const vacLista = vacs.docs.map((d) => ({ id: d.id, ...d.data() }));
  const operacion = {
    hoy, ayer, jornada,
    checadasAyer: new Map(asisAyer.docs.map((d) => [d.data().id_colaborador, d.data()])),
    ausenciasAyer: new Set(vacLista.filter((v) => v.estado === "aprobada" && v.inicio <= ayer && v.fin >= ayer).map((v) => v.id_colaborador)),
    pendientes: vacLista.filter((v) => v.estado === "pendiente"),
  };
  const detectadas = detectar({ colaboradores, asignaciones, activos, matriz, operacion });
  const existentes = await db.collection("tareas").where("origen", "==", "rutina").get();
  const previo = new Map(existentes.docs.map((d) => [d.id, d.data()]));

  const ahora = FieldValue.serverTimestamp();
  let lote = db.batch(), n = 0, nuevas = 0, cerradas = 0;
  const flush = async () => { if (n) await lote.commit(); lote = db.batch(); n = 0; };
  const poner = async (ref, datos, merge) => { lote.set(ref, datos, { merge }); if (++n >= 400) await flush(); };

  const ids = new Set();
  for (const { id, ...t } of detectadas) {
    ids.add(id);
    const p = previo.get(id);
    if (p && p.estado !== "abierta") continue; // no reabre lo hecho o descartado
    if (!p) nuevas++;
    await poner(db.collection("tareas").doc(id), {
      ...t, id_colaborador: t.id_colaborador ?? null, id_ref: t.id_ref ?? null, estado: "abierta", origen: "rutina",
      actualizada: ahora, ...(p ? {} : { creada: ahora }),
    }, true);
  }
  for (const [id, p] of previo) {
    if (!ids.has(id) && p.estado === "abierta") {
      cerradas++;
      await poner(db.collection("tareas").doc(id), { estado: "hecha", cerrada_por: "rutina: el hallazgo ya no aparece", actualizada: ahora }, true);
    }
  }
  await flush();

  const abiertas = detectadas.filter((t) => previo.get(t.id)?.estado !== "hecha" && previo.get(t.id)?.estado !== "descartada");
  const porTipo = {}, porPrioridad = { alta: 0, media: 0, baja: 0 };
  abiertas.forEach((t) => { porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1; porPrioridad[t.prioridad]++; });

  let resumen = "";
  try {
    if (!cliente) throw new Error("sin llave de Gemini");
    const r = await generar(cliente, {
      db,
      maxTokens: 2000,
      pensamiento: "LOW",
      system: "Eres el Auditor de datos del sistema de RH de OT Consulting. Escribes el resumen de la rutina diaria para RH: español de México, sin emojis, máximo 120 palabras, en 3 partes: «Hoy» (una línea con lo más importante), «Urgente» (2–3 viñetas) y «Por dónde empezar» (una acción concreta). Usa solo las cifras que te dan.",
      contents: [{ role: "user", parts: [{ text: JSON.stringify({
        fecha: hoyMonterrey(), tareas_abiertas: abiertas.length, nuevas, cerradas_solas: cerradas,
        por_tipo: porTipo, por_prioridad: porPrioridad,
        contexto: { activos: colaboradores.filter((c) => c.estatus === "Activo" && c.es_plantilla !== 0).length,
          en_banca: colaboradores.filter((c) => c.en_banca === 1).length,
          bajas_sin_causa: colaboradores.filter((c) => c.estatus === "Baja" && c.es_plantilla !== 0 && !c.id_causa_baja).length },
        ejemplos_alta: abiertas.filter((t) => t.prioridad === "alta").slice(0, 8).map((t) => t.titulo),
      }) }] }],
    });
    resumen = textoDe(r);
  } catch (e) {
    resumen = `Rutina ejecutada: ${abiertas.length} tareas abiertas (${porPrioridad.alta} de prioridad alta), ${nuevas} nuevas y ${cerradas} cerradas solas. (No se pudo generar el resumen con IA: ${e.message})`;
  }

  const fecha = hoyMonterrey();
  await db.collection("rutinas").doc(fecha).set({
    fecha, origen, total_abiertas: abiertas.length, total: abiertas.length, nuevas, creadas: nuevas, cerradas, por_tipo: porTipo, por_prioridad: porPrioridad,
    resumen, ejecutada: FieldValue.serverTimestamp(),
  });
  return { creadas: nuevas, cerradas, total: abiertas.length, resumen };
}
