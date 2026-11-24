"""Carga salida/otc_rh.db (pipeline de la Etapa 3) a Firestore del proyecto otc-rh-agentes.

- Las llaves de cada documento son los IDs del pipeline (regla 1: nunca por nombre).
- Sueldos y costos individuales van aparte, en `colaboradores_privado` (solo rol admin).
- Las vistas v_* se guardan como `indicadores/{vista}`; a las vistas por persona se les quita
  el costo individual para que el rol `rh` no lo vea.
- Siembra los SOPs y crea/actualiza el usuario admin.

Uso:
    .venv/bin/python agentes/scripts/cargar_firestore.py [--db salida/otc_rh.db] [--solo-sops]
Credenciales: token de `gcloud auth print-access-token` (cuenta con rol owner del proyecto).
"""
from __future__ import annotations

import argparse
import math
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import firestore
from google.oauth2.credentials import Credentials

PROYECTO = "otc-rh-agentes"
RAIZ = Path(__file__).resolve().parents[2]

CAMPOS_PRIVADOS = [
    "sueldo_neto_imss", "sueldo_asimilados_sindicato", "sueldo_complementos", "sueldo_neto_total",
    "comision_nomina", "impuestos_imss", "sueldo_total_integrado", "costo_mensual", "costo_hora",
    "inversion_equipo",
]
# Columnas que no se publican en indicadores por persona (el rol rh no ve costos individuales)
COLUMNAS_PRIVADAS_INDICADOR = {"costo_mensual", "costo_hora", "sueldo_total_integrado"}

TABLAS = [
    # (tabla sqlite, colección, columna llave o función)
    ("asignacion_acondicionada", "asignaciones", "id_asignacion"),
    ("proyecto_acondicionado", "proyectos", "id_proyecto"),
    ("cliente_acondicionado", "clientes", "id_cliente"),
    ("activo_acondicionado", "activos", "cod_activo"),
    ("departamento_acondicionado", "departamentos", "id_departamento"),
    ("habilidad_acondicionada", "habilidades", "cod_habilidad"),
    ("matriz_habilidad_long", "matriz", lambda r: f"{r['id_colaborador']}__{r['cod_habilidad']}"),
    ("calidad_datos", "calidad_datos", lambda r: f"{r['tabla']}__{r['columna']}"),
    ("log_correcciones", "log_correcciones", "id_correccion"),
]


def cliente_firestore() -> firestore.Client:
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True,
                           text=True, check=True).stdout.strip()
    return firestore.Client(project=PROYECTO, credentials=Credentials(token))


def limpio(valor):
    if isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor)):
        return None
    return valor


def doc_id(valor) -> str:
    return str(valor).strip().replace("/", "_")


def filas(con: sqlite3.Connection, sql: str) -> list[dict]:
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [{c: limpio(v) for c, v in zip(cols, fila)} for fila in cur.fetchall()]


class Escritor:
    """Agrupa escrituras en lotes de 400 (límite de Firestore: 500)."""

    def __init__(self, db: firestore.Client):
        self.db, self.lote, self.n, self.total = db, db.batch(), 0, 0

    def set(self, ref, datos, merge=False):
        self.lote.set(ref, datos, merge=merge)
        self.n += 1
        if self.n >= 400:
            self.flush()

    def flush(self):
        if self.n:
            self.lote.commit()
            self.total += self.n
        self.lote, self.n = self.db.batch(), 0


def cargar_datos(db: firestore.Client, con: sqlite3.Connection, w: Escritor):
    ahora = datetime.now(timezone.utc)

    # Colaboradores: públicos + privados. Causa de baja como campo nulo (dato que no existe, regla 6).
    for r in filas(con, "SELECT * FROM colaborador_acondicionado"):
        cid = doc_id(r["id_colaborador"])
        privado = {k: r.pop(k, None) for k in CAMPOS_PRIVADOS}
        if r["estatus"] == "Baja":
            r.setdefault("id_causa_baja", None)
            r.setdefault("causa_baja", None)
            r["falta_causa_baja"] = 1
        r["actualizado"] = ahora
        w.set(db.collection("colaboradores").document(cid), r, merge=True)
        privado["id_colaborador"] = r["id_colaborador"]
        w.set(db.collection("colaboradores_privado").document(cid), privado)
    print("colaboradores ok")

    for tabla, coleccion, llave in TABLAS:
        n = 0
        for r in filas(con, f"SELECT * FROM {tabla}"):
            did = llave(r) if callable(llave) else r[llave]
            w.set(db.collection(coleccion).document(doc_id(did)), r)
            n += 1
        print(f"{coleccion}: {n}")

    # Catálogos
    for (tabla,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cat_%'"):
        valores = filas(con, f"SELECT * FROM {tabla}")
        w.set(db.collection("catalogos").document(tabla.removeprefix("cat_")),
              {"tabla": tabla, "valores": valores, "total": len(valores)})
    print("catálogos ok")

    # Indicadores: una vista = un documento
    vistas = [n for (n,) in con.execute("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name")]
    for vista in vistas:
        datos = filas(con, f"SELECT * FROM {vista}")
        columnas = list(datos[0].keys()) if datos else [d[0] for d in con.execute(f"SELECT * FROM {vista} LIMIT 0").description]
        if "id_colaborador" in columnas:
            columnas = [c for c in columnas if c not in COLUMNAS_PRIVADAS_INDICADOR]
            datos = [{c: f[c] for c in columnas} for f in datos]
        if vista in ("v_plantilla", "v_plantilla_activa"):
            continue  # son las tablas base, ya están en `colaboradores`
        w.set(db.collection("indicadores").document(vista),
              {"vista": vista, "columnas": columnas, "filas": datos[:500], "total": len(datos),
               "actualizado": ahora})
    print(f"indicadores: {len(vistas) - 2}")

    params = {k: v for k, v in con.execute("SELECT clave, valor FROM parametro")}
    w.set(db.collection("config").document("pipeline"), {**params, "cargado": ahora})


SOPS = [
    {
        "id": "SOP-01", "titulo": "Registrar una baja",
        "objetivo": "Que cada salida quede con fecha, tipo y causa de catálogo para poder medir rotación voluntaria y costo de reemplazo.",
        "disparador": "Un colaborador deja la empresa, o la rutina detecta una baja sin causa o sin fecha.",
        "pasos": [
            "Ubica al colaborador por su ID (nunca por nombre) con ver_colaborador.",
            "Verifica que la fecha de baja exista y no sea anterior a la fecha de incorporación. Si falta, crea una tarea para que RH la capture; no la estimes.",
            "Pide a RH la causa y clasifícala en el catálogo de causas de baja (CB01–CB10). Si RH no la sabe, deja la causa nula: nunca la inventes.",
            "Con la causa confirmada por RH, usa proponer_cambio sobre colaboradores.id_causa_baja; RH aprueba en Aprobaciones.",
            "Revisa sus asignaciones vigentes: deben cerrarse con la fecha de baja.",
            "Revisa sus equipos: cada uno se devuelve o queda pendiente de recuperar (SOP-07).",
            "Si la baja ocurrió antes de 12 meses de antigüedad, regístralo como baja en el primer año en la memoria del caso.",
        ],
        "reglas": [3, 6, 7, 13, 18], "agente": "rotacion",
    },
    {
        "id": "SOP-02", "titulo": "Alta de colaborador",
        "objetivo": "Que todo ingreso entre completo y con catálogos, para no repetir los huecos de la exportación original.",
        "disparador": "RH contrata a alguien o un candidato del lector de CVs es aceptado.",
        "pasos": [
            "Confirma que la persona no exista ya (busca por ID y por coincidencia de nombre solo para detectar duplicados).",
            "Puesto, departamento, esquema de nómina, aseguradora y ciudad se eligen de catálogo; nada en texto libre.",
            "El sueldo total integrado debe ser mayor a $0; si no se conoce, queda nulo con bandera.",
            "Abre el expediente con los 12 documentos obligatorios; pasaporte y visa son opcionales.",
            "Si viene del lector de CVs, carga sus habilidades a la matriz con nivel 1–4 y fecha de evaluación.",
            "Los familiares de seguros no cuentan como plantilla (es_plantilla = 0).",
        ],
        "reglas": [2, 4, 5, 8, 9, 19], "agente": "asistente",
    },
    {
        "id": "SOP-03", "titulo": "Asignar a un proyecto",
        "objetivo": "Reducir la banca asignando a la persona con las habilidades correctas sin sobreasignar.",
        "disparador": "Un proyecto necesita gente, una asignación está por vencer o alguien lleva tiempo en banca.",
        "pasos": [
            "Define las habilidades que pide el proyecto y busca candidatos con buscar_por_habilidad (nivel ≥ 3 = experto).",
            "Prioriza a quien está en banca y, entre ellos, a quien lleva más días.",
            "Verifica que la dedicación total no pase de 100% con la nueva asignación.",
            "La asignación lleva fecha de inicio real; si no tiene fin, se marca indefinida (nunca texto en la fecha).",
            "Si la habilidad tiene un solo experto, avisa del riesgo de persona clave y sugiere a quién formar.",
            "Propón la asignación como tarea para RH; el agente no la registra solo.",
        ],
        "reglas": [11, 12, 14, 16], "agente": "staffing",
    },
    {
        "id": "SOP-04", "titulo": "Evaluar habilidades",
        "objetivo": "Mantener la matriz vigente y saber si hay talento para los proyectos que vienen.",
        "disparador": "Ingreso, cierre de proyecto, o evaluación con más de 12 meses o sin fecha.",
        "pasos": [
            "Evalúa en escala 1–4: Básico, Intermedio, Avanzado, Experto. Vacío significa no evaluado, nunca cero.",
            "Toda evaluación lleva fecha; se reevalúa al menos una vez al año.",
            "Distingue la misma habilidad en Oracle EBS y en Cloud por su código, no por el nombre.",
            "Registra cada certificación con fecha de obtención y de vencimiento; solo es vigente si no ha vencido.",
            "Reporta las habilidades con ≤ 1 experto como riesgo de persona clave.",
        ],
        "reglas": [19, 20], "agente": "staffing",
    },
    {
        "id": "SOP-05", "titulo": "Revisar el CV de un candidato",
        "objetivo": "Saber en minutos si un candidato cubre huecos reales de la plantilla.",
        "disparador": "RH sube un CV en el Lector de CVs.",
        "pasos": [
            "Extrae solo lo que dice el CV; si un dato no aparece, queda nulo. No supongas niveles sin evidencia.",
            "Mapea cada habilidad al catálogo de 71 habilidades por código (EBS y Cloud son distintas).",
            "Estima nivel 1–4 citando la evidencia del CV (años, proyectos, certificaciones).",
            "Cruza con la matriz: ¿cubre habilidades con ≤ 1 experto? ¿Hay alguien en banca que ya las tenga?",
            "Da una recomendación breve: entrevistar, guardar en cartera o descartar, con el porqué.",
            "No guardes datos personales de contacto en la memoria; basta el perfil profesional.",
        ],
        "reglas": [1, 19, 20], "agente": "reclutador",
    },
    {
        "id": "SOP-06", "titulo": "Corregir un dato",
        "objetivo": "Que cada corrección sea trazable y aprobada por una persona.",
        "disparador": "Un agente o una persona detecta un dato faltante o incorrecto.",
        "pasos": [
            "Identifica el registro por su ID y el campo exacto.",
            "Si el valor correcto no se conoce, no se imputa: se deja nulo con bandera y se crea una tarea de captura.",
            "Si el valor viene de una fuente confiable (RH, documento), usa proponer_cambio con el motivo y la fuente.",
            "Los campos de catálogo solo aceptan valores del catálogo.",
            "RH aprueba o rechaza en Aprobaciones; al aprobar, el cambio se escribe en log_correcciones con método M15.",
        ],
        "reglas": [1, 2, 3, 4], "agente": "auditor",
    },
    {
        "id": "SOP-07", "titulo": "Recuperar equipo de una baja",
        "objetivo": "Que ningún equipo se quede a nombre de alguien que ya salió.",
        "disparador": "La rutina detecta equipo pendiente de recuperar.",
        "pasos": [
            "Lista los equipos con pendiente_recuperar = 1 y su costo conocido.",
            "Crea una tarea por equipo con el ID del colaborador y la fecha de baja.",
            "Cuando se devuelva, propone cerrar la asignación del equipo con su fecha de fin.",
            "Si el equipo no tiene costo de compra, crea también la tarea de capturarlo.",
        ],
        "reglas": [17, 18], "agente": "auditor",
    },
    {
        "id": "SOP-08", "titulo": "Rutina diaria",
        "objetivo": "Convertir las 20 reglas en una bandeja de trabajo concreta cada mañana.",
        "disparador": "Todos los días a las 07:00 (hora de Monterrey) o a mano desde Inicio.",
        "pasos": [
            "Recorre colaboradores, asignaciones, activos y matriz con los detectores de cada regla.",
            "Crea una tarea por hallazgo con ID determinista: no duplica y no reabre lo descartado.",
            "Cierra solas las tareas cuyo hallazgo ya se corrigió.",
            "Redacta el resumen del día: qué cambió, lo urgente y por dónde empezar.",
        ],
        "reglas": [5, 6, 9, 11, 12, 14, 18, 19], "agente": "auditor",
    },
    {
        "id": "SOP-09", "titulo": "Asistencia, retardos y faltas",
        "objetivo": "Que cada día laboral quede con entrada y salida, y que las faltas se justifiquen antes de la prenómina.",
        "disparador": "Cada día laboral; la rutina detecta faltas y salidas sin registrar del día anterior.",
        "pasos": [
            "El colaborador checa entrada y salida en Mi espacio; si no tiene acceso, RH checa por él indicando su ID.",
            "Retardo = entrada después de la hora de entrada más la tolerancia de la jornada configurada.",
            "Las faltas solo cuentan desde la fecha en que RH activó el control de asistencia; nunca se reconstruyen fechas pasadas.",
            "Si una falta fue permiso, vacaciones o incapacidad, regístralo en Vacaciones y apruébalo: la falta desaparece.",
            "Antes de calcular la prenómina, revisa la bandeja: no debe quedar ninguna falta sin decidir del periodo.",
        ],
        "reglas": [3, 15], "agente": "nomina",
    },
    {
        "id": "SOP-10", "titulo": "Prenómina quincenal",
        "objetivo": "Cerrar cada quincena con incidencias completas y trazables.",
        "disparador": "Días 15 y último de cada mes.",
        "pasos": [
            "Verifica que no haya faltas ni solicitudes de vacaciones pendientes del periodo (SOP-09).",
            "Calcula la prenómina del periodo AAAA-MM-Q1 o Q2 en Nómina.",
            "Revisa los recibos con bandera: sin sueldo capturado no se estiman montos (regla 3).",
            "Vacaciones pagan prima vacacional del 25 % (LFT art. 80); permisos sin goce e incapacidades se descuentan.",
            "Cuando cuadre con contabilidad, cierra el periodo: ya no se recalcula.",
            "La prenómina es de control: el timbrado CFDI y el cálculo de ISR/IMSS siguen en el sistema de nómina.",
        ],
        "reglas": [3, 10], "agente": "nomina",
    },
    {
        "id": "SOP-11", "titulo": "Encuestas de clima y salida",
        "objetivo": "Medir el clima con regularidad y conocer la causa real de cada salida.",
        "disparador": "eNPS trimestral, clima semestral, pulso opcional semanal y encuesta de salida en cada baja.",
        "pasos": [
            "Crea la encuesta desde plantilla y revísala en borrador antes de abrirla.",
            "Comparte el enlace público; las encuestas anónimas nunca guardan quién respondió.",
            "En cada baja, envía la encuesta de salida pidiendo su ID: la causa elegida llega como propuesta a Aprobaciones.",
            "Cierra la encuesta en la fecha acordada y pide al agente de Clima y cultura el análisis.",
            "Convierte las 3 acciones principales en tareas con responsable.",
        ],
        "reglas": [6], "agente": "cultura",
    },
]


def cargar_sops(db: firestore.Client, w: Escritor):
    ahora = datetime.now(timezone.utc)
    for sop in SOPS:
        ref = db.collection("sops").document(sop["id"])
        previo = ref.get()
        version = (previo.to_dict() or {}).get("version", 0) + 1 if previo.exists else 1
        w.set(ref, {**sop, "version": version, "actualizada": ahora})
    print(f"sops: {len(SOPS)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(RAIZ / "salida" / "otc_rh.db"))
    ap.add_argument("--solo-sops", action="store_true")
    args = ap.parse_args()

    db = cliente_firestore()
    w = Escritor(db)
    if not args.solo_sops:
        con = sqlite3.connect(args.db)
        cargar_datos(db, con, w)
    cargar_sops(db, w)
    w.flush()
    print(f"Listo: {w.total} documentos escritos en {PROYECTO}")


if __name__ == "__main__":
    main()
