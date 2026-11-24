// Operación de RH: asistencia (clock in/out), vacaciones (LFT 2023), días festivos (LFT art. 74)
// y prenómina quincenal de control. La comparten callables, herramientas de agentes y rutina.
// Principio: no se inventan datos. Las faltas solo se cuentan desde que RH activa el control de
// asistencia (`config/jornada.inicio_registro`); los montos sin sueldo capturado quedan con bandera.
import { FieldValue } from "firebase-admin/firestore";

export const ZONA = "America/Monterrey";
export const JORNADA_DEF = {
  hora_entrada: "09:00", hora_salida: "18:00", tolerancia_min: 10, dias_laborales: [1, 2, 3, 4, 5],
  horas_jornada: 8, zona: ZONA, inicio_registro: null,
};

// ------------------------------------------------------------------ fechas (hora de Monterrey)
const fmtFecha = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
export const fechaLocal = (d = new Date()) => fmtFecha.format(d);
export const horaLocal = (d = new Date()) => fmtHora.format(d);
const aMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const utc = (s) => new Date(`${s}T12:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
export const sumarDias = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diaSemana = (s) => { const w = utc(s).getUTCDay(); return w === 0 ? 7 : w; }; // 1=lunes … 7=domingo
export const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(utc(s).getTime());

function* rango(inicio, fin) {
  for (let d = inicio; d <= fin; d = sumarDias(d, 1)) yield d;
}

// ------------------------------------------------------------------ festivos LFT art. 74
function enesimoLunes(anio, mes, n) {
  const d = new Date(Date.UTC(anio, mes - 1, 1, 12));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1));
  return iso(d);
}
const _festivos = new Map();
export function festivos(anio) {
  if (_festivos.has(anio)) return _festivos.get(anio);
  const f = new Map([
    [`${anio}-01-01`, "Año Nuevo"],
    [enesimoLunes(anio, 2, 1), "Día de la Constitución"],
    [enesimoLunes(anio, 3, 3), "Natalicio de Benito Juárez"],
    [`${anio}-05-01`, "Día del Trabajo"],
    [`${anio}-09-16`, "Día de la Independencia"],
    [enesimoLunes(anio, 11, 3), "Día de la Revolución"],
    [`${anio}-12-25`, "Navidad"],
  ]);
  if ((anio - 2024) % 6 === 0) f.set(`${anio}-10-01`, "Transmisión del Poder Ejecutivo Federal");
  _festivos.set(anio, f);
  return f;
}
export const esFestivo = (s) => festivos(Number(s.slice(0, 4))).get(s) ?? null;
export const esLaborable = (s, jornada) => jornada.dias_laborales.includes(diaSemana(s)) && !esFestivo(s);
export function diasHabiles(inicio, fin, jornada) {
  let n = 0;
  for (const d of rango(inicio, fin)) if (esLaborable(d, jornada)) n++;
  return n;
}

export async function leerJornada(db) {
  const s = await db.collection("config").doc("jornada").get();
  return { ...JORNADA_DEF, ...(s.data() ?? {}) };
}

// ------------------------------------------------------------------ asistencia
export async function checar(db, { colaborador, tipo, origen, registradoPor, nota }) {
  const jornada = await leerJornada(db);
  const ahora = new Date();
  const fecha = fechaLocal(ahora);
  const hora = horaLocal(ahora);
  const id = `${colaborador.id_colaborador}__${fecha}`;
  const ref = db.collection("asistencia").doc(id);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (tipo === "entrada") {
      if (s.exists) throw new Error(`Ya hay entrada registrada hoy a las ${s.data().hora_entrada}.`);
      const tarde = aMin(hora) - aMin(jornada.hora_entrada);
      const retardo = esLaborable(fecha, jornada) && tarde > jornada.tolerancia_min ? tarde : 0;
      const doc = {
        id_colaborador: colaborador.id_colaborador, nombre: colaborador.nombre ?? null, fecha,
        entrada: ahora, salida: null, hora_entrada: hora, hora_salida: null, retardo_min: retardo,
        minutos_trabajados: null, estado: "abierta", origen, registrado_por: registradoPor,
        nota: nota ?? null, dia_laborable: esLaborable(fecha, jornada), actualizado: FieldValue.serverTimestamp(),
      };
      tx.set(ref, doc);
      return { id, ...doc, entrada: ahora.toISOString() };
    }
    if (!s.exists) throw new Error("No hay entrada registrada hoy; primero checa la entrada.");
    const a = s.data();
    if (a.salida) throw new Error(`La salida ya se registró a las ${a.hora_salida}.`);
    const minutos = Math.max(0, Math.round((ahora - a.entrada.toDate()) / 60000));
    tx.update(ref, {
      salida: ahora, hora_salida: hora, minutos_trabajados: minutos, estado: "cerrada",
      ...(nota ? { nota } : {}), actualizado: FieldValue.serverTimestamp(),
    });
    return { id, fecha, hora_entrada: a.hora_entrada, hora_salida: hora, minutos_trabajados: minutos };
  });
}

export async function resumenAsistencia(db, { desde, hasta, id_colaborador }) {
  let q = db.collection("asistencia").where("fecha", ">=", desde).where("fecha", "<=", hasta);
  const snap = await q.get();
  const regs = snap.docs.map((d) => d.data()).filter((a) => !id_colaborador || a.id_colaborador === id_colaborador);
  const por = {};
  for (const a of regs) {
    const p = (por[a.id_colaborador] ??= { id_colaborador: a.id_colaborador, nombre: a.nombre, dias: 0, retardos: 0, minutos_retardo: 0, minutos_trabajados: 0, sin_salida: 0 });
    p.dias++;
    if (a.retardo_min > 0) { p.retardos++; p.minutos_retardo += a.retardo_min; }
    if (a.minutos_trabajados != null) p.minutos_trabajados += a.minutos_trabajados;
    else if (a.fecha < fechaLocal()) p.sin_salida++;
  }
  const lista = Object.values(por).map((p) => ({ ...p, horas_trabajadas: Math.round((p.minutos_trabajados / 60) * 10) / 10, puntualidad_pct: p.dias ? Math.round(((p.dias - p.retardos) / p.dias) * 1000) / 10 : null }));
  return { desde, hasta, registros: regs.length, colaboradores: lista.length, detalle: lista.sort((a, b) => b.retardos - a.retardos) };
}

// ------------------------------------------------------------------ vacaciones (LFT 2023)
/** Días de vacaciones por años cumplidos (LFT art. 76, reforma 2023). */
export function derechoLFT(anios) {
  if (anios < 1) return 0;
  if (anios <= 5) return 10 + 2 * anios;
  return 22 + 2 * Math.floor((anios - 6) / 5);
}

function aniosCumplidos(ingreso, hoy) {
  let n = Number(hoy.slice(0, 4)) - Number(ingreso.slice(0, 4));
  if (hoy.slice(5) < ingreso.slice(5)) n--;
  return Math.max(0, n);
}
const aniversario = (ingreso, anios) => `${Number(ingreso.slice(0, 4)) + anios}${ingreso.slice(4, 10)}`;

export async function saldoVacaciones(db, idColaborador, { hoy = fechaLocal() } = {}) {
  const c = (await db.collection("colaboradores").doc(idColaborador).get()).data();
  if (!c) throw new Error(`No existe el colaborador ${idColaborador}`);
  const ingreso = c.fecha_incorporacion ? String(c.fecha_incorporacion).slice(0, 10) : null;
  if (!ingreso) return { id_colaborador: idColaborador, nombre: c.nombre, nota: "Sin fecha de incorporación capturada: no se puede calcular el saldo (regla 3).", disponibles: null };
  const anios = aniosCumplidos(ingreso, hoy);
  const derecho = derechoLFT(anios);
  const periodoInicio = anios >= 1 ? aniversario(ingreso, anios) : ingreso;
  const periodoFin = sumarDias(aniversario(ingreso, anios + 1), -1);
  const snap = await db.collection("vacaciones").where("id_colaborador", "==", idColaborador).get();
  let tomados = 0, pendientes = 0;
  for (const d of snap.docs) {
    const v = d.data();
    if (v.tipo !== "vacaciones" || v.inicio < periodoInicio) continue;
    if (v.estado === "aprobada") tomados += v.dias_habiles;
    if (v.estado === "pendiente") pendientes += v.dias_habiles;
  }
  return {
    id_colaborador: idColaborador, nombre: c.nombre, fecha_incorporacion: ingreso, antiguedad_anios: anios,
    aniversario: aniversario(ingreso, anios + 1), periodo_inicio: periodoInicio, periodo_fin: periodoFin,
    derecho, tomados, pendientes, disponibles: derecho - tomados,
    nota: anios < 1 ? `Aún no cumple un año: el derecho (12 días) inicia el ${aniversario(ingreso, 1)}.` : null,
    // LFT art. 81: deben disfrutarse dentro de los 6 meses siguientes al aniversario.
    disfrutar_antes_de: anios >= 1 ? sumarDias(aniversario(ingreso, anios), 182) : null,
  };
}

const TIPOS_AUSENCIA = ["vacaciones", "permiso_con_goce", "permiso_sin_goce", "incapacidad"];

export async function solicitarVacaciones(db, { colaborador, tipo, inicio, fin, motivo, solicitadaPor }) {
  if (!TIPOS_AUSENCIA.includes(tipo)) throw new Error("Tipo inválido.");
  if (!esFecha(inicio) || !esFecha(fin) || fin < inicio) throw new Error("Rango de fechas inválido (AAAA-MM-DD, fin ≥ inicio).");
  if (fin > sumarDias(inicio, 120)) throw new Error("El rango no puede pasar de 120 días.");
  const jornada = await leerJornada(db);
  const dias = diasHabiles(inicio, fin, jornada);
  if (!dias) throw new Error("El rango no tiene días hábiles.");
  const existentes = await db.collection("vacaciones").where("id_colaborador", "==", colaborador.id_colaborador).get();
  const choque = existentes.docs.map((d) => d.data()).find((v) => ["pendiente", "aprobada"].includes(v.estado) && v.inicio <= fin && v.fin >= inicio);
  if (choque) throw new Error(`Se cruza con otra solicitud (${choque.inicio} a ${choque.fin}, ${choque.estado}).`);
  let aviso = null;
  if (tipo === "vacaciones") {
    const s = await saldoVacaciones(db, colaborador.id_colaborador);
    if (s.disponibles != null && dias > s.disponibles - s.pendientes)
      aviso = `Pide ${dias} días y tiene ${s.disponibles - s.pendientes} disponibles; RH decide.`;
  }
  const ref = await db.collection("vacaciones").add({
    id_colaborador: colaborador.id_colaborador, nombre: colaborador.nombre ?? null, tipo, inicio, fin,
    dias_habiles: dias, motivo: motivo ?? null, estado: "pendiente", aviso, solicitada_por: solicitadaPor,
    creada: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, dias_habiles: dias, aviso };
}

// ------------------------------------------------------------------ prenómina quincenal
export function rangoPeriodo(periodo) {
  const m = /^(\d{4})-(\d{2})-Q([12])$/.exec(periodo);
  if (!m) throw new Error("Periodo inválido; usa AAAA-MM-Q1 o AAAA-MM-Q2.");
  const [, a, mes, q] = m;
  const ultimo = new Date(Date.UTC(Number(a), Number(mes), 0)).getUTCDate();
  return q === "1" ? { inicio: `${a}-${mes}-01`, fin: `${a}-${mes}-15` } : { inicio: `${a}-${mes}-16`, fin: `${a}-${mes}-${String(ultimo).padStart(2, "0")}` };
}
const r2 = (n) => Math.round(n * 100) / 100;

export async function calcularPrenomina(db, { periodo, autor }) {
  const { inicio, fin } = rangoPeriodo(periodo);
  const pref = db.collection("nomina_periodos").doc(periodo);
  if ((await pref.get()).data()?.estado === "cerrado") throw new Error("El periodo está cerrado; no se recalcula.");
  const hoy = fechaLocal();
  const jornada = await leerJornada(db);
  const [cols, priv, asis, vac] = await Promise.all([
    db.collection("colaboradores").get(),
    db.collection("colaboradores_privado").get(),
    db.collection("asistencia").where("fecha", ">=", inicio).where("fecha", "<=", fin).get(),
    db.collection("vacaciones").where("estado", "==", "aprobada").get(),
  ]);
  const privPorId = Object.fromEntries(priv.docs.map((d) => [d.id, d.data()]));
  const asisPor = new Set(asis.docs.map((d) => `${d.data().id_colaborador}__${d.data().fecha}`));
  const retPor = {};
  asis.docs.forEach((d) => { const a = d.data(); if (a.retardo_min > 0) retPor[a.id_colaborador] = (retPor[a.id_colaborador] ?? 0) + 1; });
  const ausencias = vac.docs.map((d) => d.data()).filter((v) => v.inicio <= fin && v.fin >= inicio);

  const recibos = [];
  for (const d of cols.docs) {
    const c = d.data();
    if (c.es_plantilla === 0 || c.estatus !== "Activo") continue;
    const ingreso = c.fecha_incorporacion ? String(c.fecha_incorporacion).slice(0, 10) : null;
    if (ingreso && ingreso > fin) continue;
    const p = privPorId[d.id] ?? {};
    const banderas = [];
    const sueldo = p.sueldo_neto_total > 0 ? p.sueldo_neto_total : null;
    const integrado = p.sueldo_total_integrado > 0 ? p.sueldo_total_integrado : null;
    if (!sueldo) banderas.push("falta_sueldo");
    if (!ingreso) banderas.push("falta_fecha_incorporacion");
    if (!jornada.inicio_registro) banderas.push("asistencia_no_activada");

    const desde = ingreso && ingreso > inicio ? ingreso : inicio;
    const diasPeriodo = 15; // quincena comercial
    const diasPagables = ingreso && ingreso > inicio ? Math.max(0, Math.min(15, Math.round((utc(fin) - utc(ingreso)) / 864e5) + 1)) : diasPeriodo;
    const conteo = { faltas: 0, dias_laborables: 0, vacaciones: 0, permiso_con_goce: 0, permiso_sin_goce: 0, incapacidad: 0 };
    for (const dia of rango(desde, fin)) {
      if (!esLaborable(dia, jornada)) continue;
      conteo.dias_laborables++;
      const aus = ausencias.find((v) => v.id_colaborador === d.id && v.inicio <= dia && v.fin >= dia);
      if (aus) { conteo[aus.tipo]++; continue; }
      if (asisPor.has(`${d.id}__${dia}`)) continue;
      if (jornada.inicio_registro && dia >= jornada.inicio_registro && dia < hoy) conteo.faltas++;
    }

    const sd = sueldo ? sueldo / 30 : null;
    const percepciones = sd ? { sueldo: r2(sd * diasPagables), prima_vacacional: r2(sd * conteo.vacaciones * 0.25) } : null;
    const deducciones = sd ? { faltas: r2(sd * conteo.faltas), sin_goce: r2(sd * conteo.permiso_sin_goce), incapacidad: r2(sd * conteo.incapacidad) } : null;
    const neto = sd ? r2(percepciones.sueldo + percepciones.prima_vacacional - deducciones.faltas - deducciones.sin_goce - deducciones.incapacidad) : null;
    const costo = integrado ? r2((integrado / 30) * diasPagables + (percepciones?.prima_vacacional ?? 0)) : null;
    recibos.push({
      id_colaborador: d.id, nombre: c.nombre, puesto: c.puesto ?? null, esquema_nomina: c.esquema_nomina ?? null,
      sueldo_mensual: sueldo, salario_diario: sd ? r2(sd) : null, dias_periodo: diasPagables, dias_laborables: conteo.dias_laborables,
      faltas: conteo.faltas, retardos: retPor[d.id] ?? 0, dias_vacaciones: conteo.vacaciones, dias_permiso_con_goce: conteo.permiso_con_goce,
      dias_sin_goce: conteo.permiso_sin_goce, dias_incapacidad: conteo.incapacidad,
      percepciones, deducciones, neto_estimado: neto, costo_empresa: costo, banderas,
    });
  }

  const suma = (f) => r2(recibos.reduce((s, r) => s + (f(r) ?? 0), 0));
  const totales = {
    colaboradores: recibos.length, con_sueldo: recibos.filter((r) => r.sueldo_mensual).length,
    percepciones: suma((r) => r.percepciones && r.percepciones.sueldo + r.percepciones.prima_vacacional),
    deducciones: suma((r) => r.deducciones && r.deducciones.faltas + r.deducciones.sin_goce + r.deducciones.incapacidad),
    neto: suma((r) => r.neto_estimado), costo_empresa: suma((r) => r.costo_empresa),
    faltas: recibos.reduce((s, r) => s + r.faltas, 0), retardos: recibos.reduce((s, r) => s + r.retardos, 0),
    dias_vacaciones: recibos.reduce((s, r) => s + r.dias_vacaciones, 0),
  };

  // Reescribe los recibos del periodo
  const viejos = await pref.collection("recibos").get();
  let lote = db.batch(), n = 0;
  const flush = async () => { if (n) await lote.commit(); lote = db.batch(); n = 0; };
  for (const v of viejos.docs) { lote.delete(v.ref); if (++n >= 400) await flush(); }
  for (const r of recibos) { lote.set(pref.collection("recibos").doc(r.id_colaborador), { ...r, periodo }); if (++n >= 400) await flush(); }
  lote.set(pref, { periodo, inicio, fin, estado: "calculado", totales, calculado_por: autor, calculado: FieldValue.serverTimestamp(),
    nota: "Prenómina de control: no timbra CFDI ni recalcula ISR/IMSS." }, { merge: true });
  n++;
  await flush();
  return { periodo, inicio, fin, totales };
}
