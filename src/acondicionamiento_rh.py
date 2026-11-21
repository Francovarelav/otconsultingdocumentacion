"""Acondicionamiento y corrección de los datos de RH de OT Consulting (Etapa 3).

Pipeline M1–M14: toma los 7 archivos que exporta el sistema, los corrige sin borrar ni
inventar registros, y entrega tablas unidas por ID en SQLite y CSV.

Uso:
    python src/acondicionamiento_rh.py --datos datos --salida salida --corte 2026-11-20

Principio rector: el acondicionamiento no borra ni inventa. Corrige formato, reconstruye
llaves, nulifica centinelas y deja bandera de calidad. Un registro que no cumple una regla
se marca y se excluye del indicador, pero se conserva para que RH lo corrija.
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import unicodedata
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

try:  # rapidfuzz solo propone; el pipeline corre igual sin él
    from rapidfuzz import fuzz, process
except ImportError:  # pragma: no cover
    fuzz = process = None

import catalogos as cat

RAIZ = Path(__file__).resolve().parent
ARCHIVOS = {
    'colaboradores': 'Catalogo_Colaboradores.xlsx',
    'asignaciones': 'Asignaciones_Colaboradores.xlsx',
    'clientes': 'Catalogo_Clientes.xlsx',
    'activos': 'Catalogo_Activos.xlsx',
    'departamentos': 'Catalogo_Departamentos.xlsx',
    'habilidades': 'Catalogo_Habilidades.xlsx',
    'matriz': 'Matriz_Habilidades.xlsx',
}
CORTE_DEFECTO = '2026-11-20'
HORAS_MES = 160          # regla 10
UMBRAL_DIFUSO = 90       # M3 / M5
DIAS_MES = 30.4375


# =============================================================================================
# M1 · Normalización de texto
# =============================================================================================
def limpio(x):
    """Quita espacios sobrantes, colapsa espacios internos y normaliza a NFC."""
    if x is None or (isinstance(x, float) and np.isnan(x)) or x is pd.NaT:
        return np.nan
    s = re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(x))).strip()
    return s if s else np.nan


def clave(x):
    """Forma de comparación: mayúsculas, sin acentos, espacios colapsados."""
    s = limpio(x)
    if pd.isna(s):
        return ''
    s = unicodedata.normalize('NFD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return s.upper()


_MINUSCULAS = {'de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von'}


def titulo(x):
    """Formato título para nombres propios (regla 4), con partículas en minúscula."""
    s = limpio(x)
    if pd.isna(s):
        return np.nan
    partes = []
    for i, p in enumerate(s.lower().split(' ')):
        partes.append(p if (i and p in _MINUSCULAS) else '-'.join(t.capitalize() for t in p.split('-')))
    return ' '.join(partes)


# =============================================================================================
# M2 · Centinelas   ·   M4 · Tipificación
# =============================================================================================
def es_centinela(x) -> bool:
    return (not pd.isna(x)) and clave(x) in cat.CENTINELAS


def sin_centinela(x):
    """Texto limpio, o NaN si el valor es un centinela."""
    s = limpio(x)
    return np.nan if (pd.isna(s) or clave(s) in cat.CENTINELAS) else s


def a_fecha(serie: pd.Series) -> pd.Series:
    """Fecha real o NaT: los centinelas y las fechas de relleno no son fechas."""
    def uno(v):
        s = limpio(v)
        if pd.isna(s) or clave(s) in cat.CENTINELAS or s[:10] in cat.FECHAS_RELLENO or clave(s) == 'ACTIVO':
            return pd.NaT
        return pd.to_datetime(s, errors='coerce')
    return pd.to_datetime(serie.map(uno), errors='coerce')


def a_monto(serie: pd.Series) -> pd.Series:
    """Monto numérico: sin $ ni comas."""
    if serie.dtype == object:
        serie = serie.astype(str).str.replace(r'[$,\s]', '', regex=True)
    return pd.to_numeric(serie, errors='coerce')


def iso(serie: pd.Series) -> pd.Series:
    return serie.dt.strftime('%Y-%m-%d').where(serie.notna(), None)


def meses_entre(inicio: pd.Series, fin: pd.Series) -> pd.Series:
    return np.floor((fin - inicio).dt.days / DIAS_MES)


# =============================================================================================
# M13 · Trazabilidad
# =============================================================================================
class Bitacora:
    """Cada cambio queda en `log_correcciones`: qué tabla, columna y registro, el valor
    original, el corregido y el método que lo produjo."""

    def __init__(self):
        self.filas = []
        self.fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    def anotar(self, tabla, columna, registro, original, corregido, metodo, nota=None):
        self.filas.append({
            'tabla': tabla, 'columna': columna, 'id_registro': registro,
            'valor_original': None if pd.isna(original) else str(original),
            'valor_corregido': None if pd.isna(corregido) else str(corregido),
            'metodo': metodo, 'nota': nota, 'fecha_correccion': self.fecha,
        })

    def comparar(self, tabla, columna, ids, antes: pd.Series, despues: pd.Series, metodo, nota=None):
        """Anota solo las celdas que cambiaron."""
        for i, a, d in zip(ids, antes, despues):
            a_nulo, d_nulo = pd.isna(a), pd.isna(d)
            if a_nulo and d_nulo:
                continue
            if a_nulo != d_nulo or str(a) != str(d):
                self.anotar(tabla, columna, i, a, d, metodo, nota)

    def tabla(self) -> pd.DataFrame:
        df = pd.DataFrame(self.filas)
        df.insert(0, 'id_correccion', range(1, len(df) + 1))
        return df


# =============================================================================================
# M3 · Catálogos
# =============================================================================================
def proponer(valor, opciones):
    """Propuesta difusa para un valor que no está en el diccionario. No se aplica sola."""
    if process is None or not opciones:
        return None
    r = process.extractOne(clave(valor), list(opciones), scorer=fuzz.WRatio)
    return (r[0], round(r[1])) if r and r[1] >= UMBRAL_DIFUSO else None


def homologar(serie: pd.Series, diccionario: dict, propuestas: list, campo: str) -> pd.Series:
    """Asigna la forma canónica desde el diccionario. Lo que no está queda nulo y se guarda
    como propuesta para que una persona lo agregue al diccionario."""
    def uno(v):
        s = sin_centinela(v)
        if pd.isna(s):
            return np.nan
        k = clave(s)
        if k in diccionario:
            return diccionario[k]
        prop = proponer(s, diccionario.keys())
        propuestas.append({'campo': campo, 'valor': s,
                           'propuesta': diccionario[prop[0]] if prop else None,
                           'similitud': prop[1] if prop else None})
        return np.nan
    return serie.map(uno)


def catalogo_de(valores: pd.Series, prefijo: str, nombre: str) -> pd.DataFrame:
    """Catálogo con ID generado a partir de los valores distintos, en orden alfabético."""
    unicos = sorted(v for v in valores.dropna().unique())
    return pd.DataFrame({f'id_{nombre}': [f'{prefijo}{i:03d}' for i in range(1, len(unicos) + 1)],
                         nombre: unicos})


# =============================================================================================
# Carga
# =============================================================================================
def cargar(carpeta) -> dict[str, pd.DataFrame]:
    carpeta = Path(carpeta)
    faltan = [f for f in ARCHIVOS.values() if not (carpeta / f).exists()]
    if faltan:
        raise FileNotFoundError(f'Faltan archivos en {carpeta}: {", ".join(faltan)}')
    return {k: pd.read_excel(carpeta / f) for k, f in ARCHIVOS.items()}


# =============================================================================================
# Tablas
# =============================================================================================
def acond_departamentos(raw, log):
    d = pd.DataFrame({
        'id_departamento': raw['codigo'].map(limpio),
        'departamento': raw['nombre'].map(limpio),
        'objetivo': raw['objetivo'].map(limpio),
        'responsable': raw['responsable'].map(sin_centinela),
        'centro_costos': raw['centroCostos'].map(sin_centinela),
        'estatus': raw['estatus'].map(limpio),
    })
    log.comparar('departamento', 'departamento', d.id_departamento, raw['nombre'], d.departamento, 'M1')
    d['falta_responsable'] = d.responsable.isna().astype(int)
    d['falta_centro_costos'] = d.centro_costos.isna().astype(int)
    return d


def acond_clientes_proyectos(raw, colab, log, propuestas, corte):
    r = raw.copy()
    r['id_cliente'] = r['Cód Cliente'].map(limpio)
    r['cliente'] = homologar(r['Cliente'], cat.CLIENTE, propuestas, 'cliente')
    r['industria'] = homologar(r['Industria'], cat.INDUSTRIA, propuestas, 'industria')
    r['rfc'] = r['RFC'].map(sin_centinela).str.upper()
    log.comparar('cliente', 'cliente', r.id_cliente, r['Cliente'], r.cliente, 'M3')
    log.comparar('cliente', 'industria', r.id_cliente, r['Industria'], r.industria, 'M3')
    log.comparar('cliente', 'rfc', r.id_cliente, r['RFC'], r.rfc, 'M1')

    clientes = (r.groupby('id_cliente', as_index=False)
                 .agg(cliente=('cliente', 'first'), industria=('industria', 'first'),
                      rfc=('rfc', 'first'), estatus_cliente=('Estatus Cliente', 'first'),
                      tiene_contacto=('Contacto Principal', lambda s: int(s.map(sin_centinela).notna().any()))))
    clientes['falta_rfc'] = clientes.rfc.isna().astype(int)

    # M5 · el proyecto no tenía código: se genera id_proyecto desde (cliente, proyecto)
    p = pd.DataFrame({
        'id_proyecto': [f'P{i:04d}' for i in range(1, len(r) + 1)],
        'id_cliente': r.id_cliente.values,
        'proyecto': homologar(r['Proyecto'], cat.PROYECTO, propuestas, 'proyecto').values,
        'estatus_proyecto': r['Estatus Proyecto'].map(limpio).values,
        'fecha_inicio': a_fecha(r['Fecha Inicio']).values,
        'fecha_fin': a_fecha(r['Fecha Fin']).values,
        'pm_otc': r['PM OTC'].map(sin_centinela).map(titulo).values,
        'tiene_pm_cliente': r['PM Cliente'].map(sin_centinela).notna().astype(int).values,
        '_clave': [f'{c}|{clave(x)}' for c, x in zip(r.id_cliente, r['Proyecto'])],
    })
    log.comparar('proyecto', 'proyecto', p.id_proyecto, r['Proyecto'].values, p.proyecto, 'M3')
    for i in p.id_proyecto:
        log.anotar('proyecto', 'id_proyecto', i, None, i, 'M5', 'llave generada desde (cliente, proyecto)')

    # El PM se liga al colaborador por nombre una sola vez, aquí; después solo se usa el ID
    por_nombre = dict(zip(colab.nombre.map(clave), colab.id_colaborador))
    p['id_pm'] = p.pm_otc.map(lambda n: por_nombre.get(clave(n)) if pd.notna(n) else None)
    p['falta_pm'] = p.pm_otc.isna().astype(int)
    p['falta_fecha_inicio'] = p.fecha_inicio.isna().astype(int)
    p['fin_vencido_en_curso'] = ((p.fecha_fin < corte) & (p.estatus_proyecto == 'En Curso')).astype(int)
    return clientes, p


def acond_colaboradores(raw, deptos, log, propuestas, corte):
    c = pd.DataFrame({'id_colaborador': raw['ID'].map(limpio)})
    ids = c.id_colaborador

    c['nombre'] = raw['Nombre Completo'].map(titulo)
    c['genero'] = raw['Género'].map(limpio)
    c['fecha_nacimiento'] = a_fecha(raw['Fecha Nacimiento'])
    c['edad'] = np.floor((corte - c.fecha_nacimiento).dt.days / 365.25)

    # Ciudad (M3)
    k = raw['Ciudad'].map(clave)
    ciudad = k.map(lambda v: cat.CIUDAD.get(v, (None,) * 4))
    c['ciudad'] = [x[0] or x[1] or x[2] for x in ciudad]
    c['ciudad'] = c.ciudad.where(c.ciudad.notna(), np.nan)
    c['estado'] = [x[1] for x in ciudad]
    c['pais'] = [x[2] for x in ciudad]
    c['precision_ciudad'] = [x[3] for x in ciudad]
    for v in sorted(set(k) - set(cat.CIUDAD) - cat.CIUDAD_NO_VALIDA - cat.CENTINELAS):
        prop = proponer(v, cat.CIUDAD.keys())
        propuestas.append({'campo': 'ciudad', 'valor': v, 'propuesta': prop and prop[0], 'similitud': prop and prop[1]})
    log.comparar('colaborador', 'ciudad', ids, raw['Ciudad'], c.ciudad, 'M3')

    c['estatus'] = raw['Estatus'].map(limpio)
    c['fecha_incorporacion'] = a_fecha(raw['Fecha Incorporación'])
    c['fecha_baja'] = a_fecha(raw['Fecha de Baja'])

    # M8 · coherencia temporal
    inconsist = (c.estatus == 'Activo') & c.fecha_baja.notna()
    c['inconsistencia_estatus_fecha'] = inconsist.astype(int)
    for i, f in zip(ids[inconsist], c.fecha_baja[inconsist]):
        log.anotar('colaborador', 'fecha_baja', i, f.date(), None, 'M8',
                   'activo con fecha de baja: se nulifica y RH confirma el estatus')
    c.loc[inconsist, 'fecha_baja'] = pd.NaT
    antes = c.fecha_baja < c.fecha_incorporacion
    c['baja_anterior_a_ingreso'] = antes.astype(int)
    for i, f in zip(ids[antes], c.fecha_baja[antes]):
        log.anotar('colaborador', 'fecha_baja', i, f.date(), None, 'M8', 'baja anterior al ingreso')
    c.loc[antes, 'fecha_baja'] = pd.NaT

    # Esquema de nómina, departamento y puesto (M2 + M3)
    c['esquema_nomina'] = homologar(raw['Tipo Nómina'], cat.ESQUEMA_NOMINA, propuestas, 'esquema_nomina')
    log.comparar('colaborador', 'esquema_nomina', ids, raw['Tipo Nómina'], c.esquema_nomina, 'M3')

    depto_id = dict(zip(deptos.departamento.map(clave), deptos.id_departamento))
    depto_txt = raw['Departamento'].map(sin_centinela)
    c['id_departamento'] = depto_txt.map(lambda v: depto_id.get(clave(v)) if pd.notna(v) else None)
    c['departamento'] = c.id_departamento.map(dict(zip(deptos.id_departamento, deptos.departamento)))
    for i, v in zip(ids, depto_txt):
        if pd.notna(v) and clave(v) not in depto_id:
            propuestas.append({'campo': 'departamento', 'valor': v, 'propuesta': None, 'similitud': None})
    log.comparar('colaborador', 'id_departamento', ids, raw['Departamento'], c.id_departamento, 'M5',
                 'departamento por nombre → id_departamento')

    puesto = raw['Puesto'].map(sin_centinela).str.upper()
    c['es_plantilla'] = (~puesto.isin(cat.PUESTOS_NO_PLANTILLA)).astype(int)   # M7
    for i, v in zip(ids[c.es_plantilla == 0], puesto[c.es_plantilla == 0]):
        log.anotar('colaborador', 'es_plantilla', i, v, 0, 'M7', 'familiar asegurado: sale del denominador, no del archivo')
    c['puesto'] = puesto.where(c.es_plantilla == 1)
    log.comparar('colaborador', 'puesto', ids, raw['Puesto'], c.puesto, 'M2')

    # Sueldos (M4 + M11): $0 es dato desconocido, no un sueldo. No se imputa.
    sueldos = {
        'Sueldo Neto IMSS': 'sueldo_neto_imss', 'Sueldo Asimilados/Sindicato': 'sueldo_asimilados_sindicato',
        'Sueldo Complementos': 'sueldo_complementos', 'Sueldo Neto Total': 'sueldo_neto_total',
        'Comisión Nómina': 'comision_nomina', 'Impuestos IMSS': 'impuestos_imss',
        'Sueldo Total Integrado': 'sueldo_total_integrado',
    }
    total = a_monto(raw['Sueldo Total Integrado'])
    sin_sueldo = total.isna() | (total <= 0)
    for origen, destino in sueldos.items():
        c[destino] = a_monto(raw[origen]).where(~sin_sueldo)
    log.comparar('colaborador', 'sueldo_total_integrado', ids, total, c.sueldo_total_integrado, 'M11',
                 'sueldo en $0 → nulo + falta_sueldo')
    c['costo_mensual'] = c.sueldo_total_integrado            # regla 10
    c['costo_hora'] = (c.costo_mensual / HORAS_MES).round(2)

    # Seguros
    seg = raw['SGMM'].map(clave).map(lambda v: cat.ASEGURADORA.get(v, (None, None)))
    c['aseguradora'] = [x[0] for x in seg]
    c['tiene_sgmm'] = pd.array([x[1] for x in seg], dtype='Int64')
    log.comparar('colaborador', 'aseguradora', ids, raw['SGMM'], c.aseguradora, 'M3')
    c['seguro_vida'] = raw['Seguro Vida'].map(clave).map({'SI': 1, 'NO': 0}).astype('Int64')
    c['tiene_beneficiario'] = raw['Beneficiario'].map(sin_centinela).map(
        lambda v: 0 if pd.isna(v) or clave(v) == 'NO' else 1)

    # Documentación (M4): SI / NO APLICA = 1 · NO = 0 · Pendiente = nulo
    obligatorios = []
    for origen, (destino, obligatorio) in cat.DOCUMENTOS.items():
        c[destino] = pd.array(raw[origen].map(clave).map(cat.DOCUMENTO_VALOR), dtype='Int64')
        if obligatorio:
            obligatorios.append(destino)
    c['tipo_contrato'] = raw['Doc: Contrato'].map(clave).map(cat.TIPO_CONTRATO)
    c['docs_cumplidos'] = c[obligatorios].fillna(0).sum(axis=1).astype(int)
    c['docs_obligatorios'] = len(obligatorios)
    c['pct_expediente'] = (c.docs_cumplidos / len(obligatorios) * 100).round(1)
    c['expediente_completo'] = (c.docs_cumplidos == len(obligatorios)).astype(int)

    # Derivados de permanencia
    fin = c.fecha_baja.where(c.estatus == 'Baja', corte)
    c['antiguedad_meses'] = meses_entre(c.fecha_incorporacion, fin)
    c['anio_ingreso'] = c.fecha_incorporacion.dt.year.astype('Int64')
    # baja en el primer año: confirmada con fecha, o deducida cuando entró hace menos de
    # 12 meses y ya es baja (no hace falta la fecha para saberlo). Si no, se desconoce.
    baja = c.estatus == 'Baja'
    con_fecha = baja & c.fecha_baja.notna() & c.fecha_incorporacion.notna()
    deducible = baja & c.fecha_baja.isna() & (meses_entre(c.fecha_incorporacion, pd.Series(corte, index=c.index)) < 12)
    c['baja_primer_anio'] = pd.array([pd.NA] * len(c), dtype='Int64')
    c.loc[con_fecha, 'baja_primer_anio'] = (c.antiguedad_meses[con_fecha] < 12).astype(int)
    c.loc[deducible, 'baja_primer_anio'] = 1
    c['baja_primer_anio_fuente'] = np.select([con_fecha, deducible], ['fecha de baja', 'deducida por fecha de ingreso'], None)

    # Banderas de calidad (reglas 5 y 6)
    plantilla_activa = (c.estatus == 'Activo') & (c.es_plantilla == 1)
    c['falta_puesto'] = (plantilla_activa & c.puesto.isna()).astype(int)
    c['falta_departamento'] = (plantilla_activa & c.id_departamento.isna()).astype(int)
    c['falta_esquema_nomina'] = (plantilla_activa & c.esquema_nomina.isna()).astype(int)
    c['falta_sueldo'] = (plantilla_activa & c.sueldo_total_integrado.isna()).astype(int)
    c['falta_fecha_incorporacion'] = ((c.es_plantilla == 1) & c.fecha_incorporacion.isna()).astype(int)
    c['falta_fecha_baja'] = (baja & c.fecha_baja.isna()).astype(int)
    c['cumple_regla_5'] = (plantilla_activa & c.puesto.notna() & c.id_departamento.notna()
                           & c.esquema_nomina.notna() & c.sueldo_total_integrado.notna()).astype(int)
    return c


def acond_asignaciones(raw, colab, clientes, proyectos, log, propuestas, corte):
    a = pd.DataFrame({
        'id_asignacion': [f'AS{i:04d}' for i in range(1, len(raw) + 1)],
        'id_colaborador': raw['ID Colaborador'].map(limpio),
    })
    ids = a.id_asignacion
    a['colaborador_existe'] = a.id_colaborador.isin(colab.id_colaborador).astype(int)

    # M5 · cliente y proyecto llegan como texto: se resuelven a ID una sola vez
    cli_id = dict(zip(clientes.cliente.map(clave), clientes.id_cliente))
    cli_txt = homologar(raw['Cliente'], cat.CLIENTE, propuestas, 'cliente (asignaciones)')
    a['id_cliente'] = cli_txt.map(lambda v: cli_id.get(clave(v)) if pd.notna(v) else None)
    proy_id = dict(zip(proyectos._clave, proyectos.id_proyecto))
    a['id_proyecto'] = [proy_id.get(f'{c}|{clave(p)}') for c, p in zip(a.id_cliente, raw['Proyecto'])]
    a['falta_proyecto'] = a.id_proyecto.isna().astype(int)
    log.comparar('asignacion', 'id_cliente', ids, raw['Cliente'], a.id_cliente, 'M5', 'cliente por texto → id_cliente')
    log.comparar('asignacion', 'id_proyecto', ids, raw['Proyecto'], a.id_proyecto, 'M5', 'proyecto por texto → id_proyecto')

    a['rol_interno'] = raw['Nómina/Rol Interno'].map(sin_centinela)
    a['rol_asignado'] = raw['Rol Asignado'].map(sin_centinela)
    a['tipo_asignacion'] = raw['Tipo de Asignación'].map(limpio)
    a['estatus_asignacion'] = raw['Estatus Asignación'].map(limpio)
    log.comparar('asignacion', 'rol_asignado', ids, raw['Rol Asignado'], a.rol_asignado, 'M2')
    log.comparar('asignacion', 'rol_interno', ids, raw['Nómina/Rol Interno'], a.rol_interno, 'M2')

    # Fechas (M2, regla 12): 1990-01-01 e "Indefinido" no son fechas
    a['fecha_inicio'] = a_fecha(raw['Fecha Inicio'])
    a['fecha_fin'] = a_fecha(raw['Fecha Fin'])
    a['es_indefinida'] = raw['Fecha Fin'].map(lambda v: int(pd.isna(limpio(v)) or clave(v) == 'INDEFINIDO'))
    a['falta_fecha_inicio'] = a.fecha_inicio.isna().astype(int)
    log.comparar('asignacion', 'fecha_inicio', ids, raw['Fecha Inicio'], iso(a.fecha_inicio), 'M2', 'fecha de relleno')
    log.comparar('asignacion', 'fecha_fin', ids, raw['Fecha Fin'], iso(a.fecha_fin), 'M2', 'texto en campo de fecha')

    # M10 · cierre por baja (regla 13). El estatus sale del catálogo de colaboradores, por ID
    info = colab.set_index('id_colaborador')[['estatus', 'fecha_baja', 'costo_mensual']]
    a['estatus_colab'] = a.id_colaborador.map(info.estatus)
    fecha_baja = a.id_colaborador.map(info.fecha_baja)
    cierra = (a.estatus_colab == 'Baja') & fecha_baja.notna() & (a.fecha_fin.isna() | (a.fecha_fin > fecha_baja))
    for i, antes, despues in zip(ids[cierra], a.fecha_fin[cierra], fecha_baja[cierra]):
        log.anotar('asignacion', 'fecha_fin', i, antes, despues.date(), 'M10', 'cierre por baja del colaborador')
    a.loc[cierra, 'fecha_fin'] = fecha_baja[cierra]
    a['cerrada_por_baja'] = ((a.estatus_colab == 'Baja')).astype(int)

    # Vigencia: ya inició (o no se sabe cuándo pero está "En Curso"), no ha terminado y la
    # persona sigue activa.
    inicio_ok = a.fecha_inicio.isna() | (a.fecha_inicio <= corte)
    fin_ok = a.fecha_fin.isna() | (a.fecha_fin >= corte)
    a['vigente'] = (inicio_ok & fin_ok & (a.estatus_colab == 'Activo') & (a.estatus_asignacion == 'En Curso')).astype(int)

    # M9 · dedicación. El sistema no la captura: se asume 100% por asignación y se marca
    # como estimado. Dos asignaciones vigentes = 200% → sobreasignado, para que RH lo confirme.
    a['pct_dedicacion'] = 100.0
    a['pct_dedicacion_estimado'] = 1
    total = a[a.vigente == 1].groupby('id_colaborador').pct_dedicacion.sum()
    a['dedicacion_total_pct'] = a.id_colaborador.map(total).where(a.vigente == 1)
    a['sobreasignado'] = (a.dedicacion_total_pct > 100).astype(int)
    # el costo se reparte en proporción para no contarlo dos veces
    a['pct_costo'] = (a.pct_dedicacion / a.dedicacion_total_pct.clip(lower=100) * 100).where(a.vigente == 1)
    a['costo_personal_mes'] = (a.id_colaborador.map(info.costo_mensual) * a.pct_costo / 100).round(2)

    dias = (a.fecha_fin - corte).dt.days.where(a.vigente == 1)
    a['dias_para_fin_asignacion'] = dias
    a['vence_en'] = pd.cut(dias, [-1, 30, 60, 90, 10 ** 6], labels=['0-30 días', '31-60 días', '61-90 días', 'Más de 90 días']).astype(object)
    a.loc[(a.vigente == 1) & a.fecha_fin.isna(), 'vence_en'] = 'Indefinida'
    return a


def completar_colaboradores(c, asig, activos, corte):
    """Derivados del colaborador que dependen de asignaciones y equipo."""
    vig = asig[asig.vigente == 1]
    ded = vig.groupby('id_colaborador').pct_dedicacion.sum()
    c['asignaciones_vigentes'] = c.id_colaborador.map(vig.groupby('id_colaborador').size()).fillna(0).astype(int)
    c['tiene_asignacion_vigente'] = (c.asignaciones_vigentes > 0).astype(int)
    c['dedicacion_total_pct'] = c.id_colaborador.map(ded)
    c['sobreasignado'] = (c.dedicacion_total_pct > 100).astype(int)
    activo = (c.estatus == 'Activo') & (c.es_plantilla == 1)
    c['en_banca'] = (activo & (c.tiene_asignacion_vigente == 0)).astype(int)          # regla 14
    ultima = asig[asig.vigente == 0].groupby('id_colaborador').fecha_fin.max()
    desde = pd.concat([c.id_colaborador.map(ultima), c.fecha_incorporacion], axis=1).max(axis=1)
    c['dias_en_banca'] = (corte - desde).dt.days.where(c.en_banca == 1)
    eq = activos[(activos.vigente == 1) & activos.id_colaborador.notna()]
    c['equipos_vigentes'] = c.id_colaborador.map(eq.groupby('id_colaborador').size()).fillna(0).astype(int)
    c['inversion_equipo'] = c.id_colaborador.map(eq.groupby('id_colaborador').costo.sum(min_count=1))
    return c


def acond_activos(raw, colab, log, propuestas):
    a = pd.DataFrame({
        'cod_activo': raw['Cód Activo'].map(limpio),
        'descripcion': raw['Descripción'].map(limpio),
        'tipo': raw['Tipo'].map(limpio),
        'marca': homologar(raw['Marca'], cat.MARCA, propuestas, 'marca'),
        'modelo': raw['Modelo'].map(sin_centinela),
        'serie': raw['Serie'].map(sin_centinela),
        'estatus': raw['Estatus'].map(limpio),
    })
    ids = a.cod_activo
    log.comparar('activo', 'marca', ids, raw['Marca'], a.marca, 'M3')

    costo = a_monto(raw['Costo'])
    a['costo'] = costo.where(costo > 0)                                               # M11
    a['falta_costo'] = a.costo.isna().astype(int)
    log.comparar('activo', 'costo', ids, costo, a.costo, 'M11', 'costo en $0 → nulo + falta_costo')

    # M5 · la liga venía por nombre completo: exacta primero, difusa con bandera después
    por_nombre = dict(zip(colab.nombre.map(clave), colab.id_colaborador))
    id_col, difusa = [], []
    for nombre in raw['Colaborador Asignado']:
        n = sin_centinela(nombre)
        if pd.isna(n):
            id_col.append(None); difusa.append(0); continue
        k = clave(n)
        if k in por_nombre:
            id_col.append(por_nombre[k]); difusa.append(0); continue
        prop = proponer(n, por_nombre.keys())
        id_col.append(por_nombre[prop[0]] if prop else None); difusa.append(1 if prop else 0)
    a['id_colaborador'] = id_col
    a['liga_difusa'] = difusa
    asignado = raw['Colaborador Asignado'].map(sin_centinela).notna()
    a['sin_asignar'] = (~asignado).astype(int)
    a['dueno_no_identificado'] = (asignado & a.id_colaborador.isna()).astype(int)
    for i, v in zip(ids, a.id_colaborador):
        if v:
            log.anotar('activo', 'id_colaborador', i, '(nombre completo)', v, 'M5', 'nombre → id_colaborador')

    a['fecha_inicio'] = a_fecha(raw['Fecha Inicio'])
    a['fecha_fin'] = a_fecha(raw['Fecha Fin'])
    log.comparar('activo', 'fecha_inicio', ids, raw['Fecha Inicio'], iso(a.fecha_inicio), 'M2', 'fecha de relleno')
    log.comparar('activo', 'fecha_fin', ids, raw['Fecha Fin'], iso(a.fecha_fin), 'M2', '"Activo" escrito en la fecha')
    a['vigente'] = (asignado & raw['Fecha Fin'].map(lambda v: clave(v) == 'ACTIVO')).astype(int)
    a['falta_fecha_inicio'] = (asignado & a.fecha_inicio.isna()).astype(int)

    a['estatus_colab'] = a.id_colaborador.map(colab.set_index('id_colaborador').estatus)
    a['pendiente_recuperar'] = ((a.vigente == 1) & (a.estatus_colab == 'Baja')).astype(int)   # regla 18
    return a


def acond_habilidades(raw, log):
    h = pd.DataFrame({
        'cod_habilidad': raw['codigo'].map(limpio),
        'descripcion': raw['descripcion'].map(limpio),
        'tipo': raw['tipo'].map(limpio).str.upper(),
        'estatus': raw['estatus'].map(limpio),
    })
    tec = raw['tecnologia'].map(clave).map(lambda v: cat.TECNOLOGIA.get(v, (None, None)))
    h['tecnologia'] = [x[0] for x in tec]
    corta = [x[1] for x in tec]
    log.comparar('habilidad', 'descripcion', h.cod_habilidad, raw['descripcion'], h.descripcion, 'M1')
    log.comparar('habilidad', 'tecnologia', h.cod_habilidad, raw['tecnologia'], h.tecnologia, 'M3')
    # M6 · misma descripción en dos tecnologías: clave compuesta
    h['descripcion_repetida'] = h.descripcion.map(clave).duplicated(keep=False).astype(int)
    h['habilidad'] = [f'{d} ({t})' if r else d for d, t, r in zip(h.descripcion, corta, h.descripcion_repetida)]
    for i, d, n in zip(h.cod_habilidad[h.descripcion_repetida == 1], h.descripcion[h.descripcion_repetida == 1],
                       h.habilidad[h.descripcion_repetida == 1]):
        log.anotar('habilidad', 'habilidad', i, d, n, 'M6', 'descripción repetida en EBS y Cloud')
    return h[['cod_habilidad', 'habilidad', 'descripcion', 'tecnologia', 'tipo', 'descripcion_repetida', 'estatus']]


def acond_matriz(raw, colab, habs, log):
    """M12 · de una columna por habilidad a formato largo. Vacío = no evaluado, no nivel cero."""
    cols = [c for c in raw.columns if re.match(r'^[A-Z]\d{4} - ', str(c))]
    largo = raw.melt(id_vars='ID Colaborador', value_vars=cols, var_name='columna', value_name='nivel_txt')
    largo['nivel_txt'] = largo.nivel_txt.map(sin_centinela)
    largo = largo.dropna(subset=['nivel_txt'])
    m = pd.DataFrame({
        'id_colaborador': largo['ID Colaborador'].map(limpio).values,
        'cod_habilidad': largo.columna.str.split(' - ').str[0].values,   # se une por código, no por nombre
        'nivel': largo.nivel_txt.map(titulo).values,
        'nivel_num': pd.array(largo.nivel_txt.map(clave).map(cat.NIVEL).values, dtype='Int64'),
    })
    m['nivel'] = m.nivel_num.map(cat.NIVEL_NOMBRE)
    m['fecha_evaluacion'] = None        # regla 19: el sistema aún no la captura
    m['colaborador_existe'] = m.id_colaborador.isin(colab.id_colaborador).astype(int)
    m['habilidad_existe'] = m.cod_habilidad.isin(habs.cod_habilidad).astype(int)
    log.anotar('matriz_habilidad', '(todas)', None, f'{len(raw)} filas × {len(cols)} columnas',
               f'{len(m)} filas en formato largo', 'M12')
    return m.sort_values(['id_colaborador', 'cod_habilidad']).reset_index(drop=True)


# =============================================================================================
# Calidad de datos: completitud antes y después
# =============================================================================================
MAPA_CALIDAD = {
    'colaborador': ('colaboradores', {
        'Fecha Nacimiento': 'fecha_nacimiento', 'Ciudad': 'ciudad', 'Fecha Incorporación': 'fecha_incorporacion',
        'Fecha de Baja': 'fecha_baja', 'Tipo Nómina': 'esquema_nomina', 'Departamento': 'id_departamento',
        'Puesto': 'puesto', 'Sueldo Total Integrado': 'sueldo_total_integrado', 'SGMM': 'aseguradora',
        'Seguro Vida': 'seguro_vida', 'Doc: Contrato': 'doc_contrato', 'Doc: Foto': 'doc_foto',
        'Aviso: Infonavit': 'aviso_infonavit', 'Aviso: Manutención': 'aviso_manutencion'}),
    'asignacion': ('asignaciones', {
        'Cliente': 'id_cliente', 'Proyecto': 'id_proyecto', 'Rol Asignado': 'rol_asignado',
        'Nómina/Rol Interno': 'rol_interno', 'Fecha Inicio': 'fecha_inicio', 'Fecha Fin': 'fecha_fin'}),
    'proyecto': ('clientes', {'Proyecto': 'proyecto', 'Fecha Inicio': 'fecha_inicio', 'Fecha Fin': 'fecha_fin', 'PM OTC': 'pm_otc'}),
    'activo': ('activos', {'Marca': 'marca', 'Modelo': 'modelo', 'Costo': 'costo',
                           'Colaborador Asignado': 'id_colaborador', 'Fecha Inicio': 'fecha_inicio'}),
    'departamento': ('departamentos', {'responsable': 'responsable', 'centroCostos': 'centro_costos'}),
}


def calidad(raw, tablas, log_df):
    filas = []
    for tabla, (fuente, cols) in MAPA_CALIDAD.items():
        r, t = raw[fuente], tablas[tabla]
        cambios = log_df[log_df.tabla == tabla].groupby('columna').size()
        for origen, destino in cols.items():
            s = r[origen]
            cent = int(s.map(lambda v: (not pd.isna(v)) and (clave(v) in cat.CENTINELAS or str(v)[:10] in cat.FECHAS_RELLENO)).sum())
            if origen in ('Sueldo Total Integrado', 'Costo'):
                cent = int((a_monto(s) == 0).sum())
            n = len(r)
            filas.append({
                'tabla': tabla, 'columna': destino, 'columna_fuente': origen, 'registros': n,
                'llenos_antes': int(s.notna().sum()),
                'completitud_aparente_pct': round(s.notna().mean() * 100, 1),
                'centinelas': cent,
                'validos_despues': int(t[destino].notna().sum()),
                'indice_completitud': round(t[destino].notna().sum() / n * 100, 1),
                'correcciones': int(cambios.get(destino, 0)),
            })
    return pd.DataFrame(filas)


# =============================================================================================
# Salida
# =============================================================================================
COLUMNAS_FECHA = ['fecha_nacimiento', 'fecha_incorporacion', 'fecha_baja', 'fecha_inicio', 'fecha_fin']


def _para_sql(df: pd.DataFrame) -> pd.DataFrame:
    df = df.drop(columns=[c for c in df.columns if c.startswith('_')]).copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = iso(df[c])
    return df


def acondicionar(carpeta_datos='datos', corte=CORTE_DEFECTO):
    """Corre M1–M13 y regresa (tablas, crudo). Las tablas M14 se crean al guardar."""
    corte = pd.Timestamp(corte)
    raw = cargar(carpeta_datos)
    log, propuestas = Bitacora(), []

    deptos = acond_departamentos(raw['departamentos'], log)
    colab = acond_colaboradores(raw['colaboradores'], deptos, log, propuestas, corte)
    clientes, proyectos = acond_clientes_proyectos(raw['clientes'], colab, log, propuestas, corte)
    asig = acond_asignaciones(raw['asignaciones'], colab, clientes, proyectos, log, propuestas, corte)
    activos = acond_activos(raw['activos'], colab, log, propuestas)
    colab = completar_colaboradores(colab, asig, activos, corte)
    habs = acond_habilidades(raw['habilidades'], log)
    matriz = acond_matriz(raw['matriz'], colab, habs, log)

    # Catálogos con ID (regla 2)
    cat_puesto = catalogo_de(colab.puesto, 'PU', 'puesto')
    colab.insert(colab.columns.get_loc('puesto'), 'id_puesto', colab.puesto.map(dict(zip(cat_puesto.puesto, cat_puesto.id_puesto))))
    cat_ciudad = (colab.dropna(subset=['ciudad'])[['ciudad', 'estado', 'pais', 'precision_ciudad']]
                  .drop_duplicates().sort_values('ciudad').reset_index(drop=True))
    cat_ciudad.insert(0, 'id_ciudad', [f'CI{i:03d}' for i in range(1, len(cat_ciudad) + 1)])
    colab.insert(colab.columns.get_loc('ciudad'), 'id_ciudad', colab.ciudad.map(dict(zip(cat_ciudad.ciudad, cat_ciudad.id_ciudad))))

    tablas = {
        'colaborador': colab, 'asignacion': asig, 'proyecto': proyectos, 'cliente': clientes,
        'activo': activos, 'departamento': deptos, 'habilidad': habs, 'matriz_habilidad': matriz,
    }
    # Expediente en formato largo: una fila por colaborador y documento
    docs = [d for d, _ in cat.DOCUMENTOS.values()]
    exp = colab.melt(id_vars='id_colaborador', value_vars=docs, var_name='documento', value_name='cumplido')
    exp['cumplido'] = exp.cumplido.fillna(0).astype(int)
    tablas['expediente_documento_long'] = exp

    log_df = log.tabla()
    tablas['log_correcciones'] = log_df
    tablas['calidad_datos'] = calidad(raw, tablas, log_df)
    tablas['propuestas_catalogo'] = pd.DataFrame(propuestas, columns=['campo', 'valor', 'propuesta', 'similitud']).drop_duplicates()
    tablas['cat_puesto'] = cat_puesto
    tablas['cat_ciudad'] = cat_ciudad
    tablas['cat_esquema_nomina'] = catalogo_de(colab.esquema_nomina, 'EN', 'esquema_nomina')
    tablas['cat_aseguradora'] = catalogo_de(colab.aseguradora, 'AS', 'aseguradora')
    tablas['cat_marca'] = catalogo_de(activos.marca, 'MA', 'marca')
    tablas['cat_industria'] = catalogo_de(clientes.industria, 'IN', 'industria')
    tablas['cat_causa_baja'] = pd.DataFrame(cat.CAUSA_BAJA, columns=['id_causa_baja', 'causa_baja', 'grupo'])
    tablas['cat_documento'] = pd.DataFrame(
        [{'documento': d, 'nombre': cat.DOCUMENTO_NOMBRE[d], 'obligatorio': o} for d, o in cat.DOCUMENTOS.values()])
    tablas['parametro'] = pd.DataFrame([
        {'clave': 'fecha_corte', 'valor': corte.strftime('%Y-%m-%d')},
        {'clave': 'horas_mes', 'valor': str(HORAS_MES)},
        {'clave': 'fecha_proceso', 'valor': log.fecha},
    ])
    return tablas, raw


NOMBRE_SQL = {
    'colaborador': 'colaborador_acondicionado', 'asignacion': 'asignacion_acondicionada',
    'proyecto': 'proyecto_acondicionado', 'cliente': 'cliente_acondicionado',
    'activo': 'activo_acondicionado', 'departamento': 'departamento_acondicionado',
    'habilidad': 'habilidad_acondicionada', 'matriz_habilidad': 'matriz_habilidad_long',
}

VALIDACIONES = {
    'Activos con fecha de baja':
        "SELECT COUNT(*) FROM colaborador_acondicionado WHERE estatus='Activo' AND fecha_baja IS NOT NULL",
    'Bajas anteriores al ingreso':
        'SELECT COUNT(*) FROM colaborador_acondicionado WHERE fecha_baja < fecha_incorporacion',
    'Asignaciones vigentes de personas dadas de baja':
        "SELECT COUNT(*) FROM asignacion_acondicionada WHERE vigente=1 AND estatus_colab='Baja'",
    'Sueldos en $0':
        'SELECT COUNT(*) FROM colaborador_acondicionado WHERE sueldo_total_integrado=0',
    'Equipos con costo $0':
        'SELECT COUNT(*) FROM activo_acondicionado WHERE costo=0',
    'Centinelas de texto que sobrevivieron':
        "SELECT (SELECT COUNT(*) FROM colaborador_acondicionado WHERE puesto='PENDIENTE' OR ciudad='PENDIENTE')"
        " + (SELECT COUNT(*) FROM asignacion_acondicionada WHERE rol_asignado='PENDIENTE' OR rol_interno='PENDIENTE')",
    'Fechas de relleno que sobrevivieron':
        "SELECT (SELECT COUNT(*) FROM asignacion_acondicionada WHERE fecha_inicio='1990-01-01')"
        " + (SELECT COUNT(*) FROM activo_acondicionado WHERE fecha_inicio='1990-01-01')",
    'Asignaciones sin colaborador en el catálogo':
        'SELECT COUNT(*) FROM asignacion_acondicionada a LEFT JOIN colaborador_acondicionado c USING(id_colaborador) WHERE c.id_colaborador IS NULL',
    'Asignaciones sin proyecto resuelto':
        'SELECT COUNT(*) FROM asignacion_acondicionada WHERE id_proyecto IS NULL',
    'Niveles de habilidad fuera de 1–4':
        'SELECT COUNT(*) FROM matriz_habilidad_long WHERE nivel_num NOT BETWEEN 1 AND 4 OR nivel_num IS NULL',
    'Habilidades de la matriz que no están en el catálogo':
        'SELECT COUNT(*) FROM matriz_habilidad_long m LEFT JOIN habilidad_acondicionada h USING(cod_habilidad) WHERE h.cod_habilidad IS NULL',
    'IDs de colaborador duplicados':
        'SELECT COUNT(*) - COUNT(DISTINCT id_colaborador) FROM colaborador_acondicionado',
    'Filas perdidas en colaboradores (no se borra nada)':
        "SELECT (SELECT CAST(valor AS INT) FROM parametro WHERE clave='filas_fuente_colaboradores') - (SELECT COUNT(*) FROM colaborador_acondicionado)",
}


def guardar(tablas, raw, carpeta_salida='salida'):
    """Escribe SQLite + CSV, crea las tablas de extensión (M14) y las vistas de indicadores."""
    salida = Path(carpeta_salida)
    (salida / 'csv').mkdir(parents=True, exist_ok=True)
    ruta = salida / 'otc_rh.db'
    if ruta.exists():
        ruta.unlink()

    param = pd.concat([tablas['parametro'], pd.DataFrame(
        [{'clave': f'filas_fuente_{k}', 'valor': str(len(v))} for k, v in raw.items()])], ignore_index=True)
    con = sqlite3.connect(ruta)
    try:
        for nombre, df in tablas.items():
            df = param if nombre == 'parametro' else df
            destino = NOMBRE_SQL.get(nombre, nombre)
            limpio_df = _para_sql(df)
            limpio_df.to_sql(destino, con, index=False, if_exists='replace')
            limpio_df.to_csv(salida / 'csv' / f'{destino}.csv', index=False, encoding='utf-8-sig')
        con.executescript((RAIZ / 'extension.sql').read_text(encoding='utf-8'))      # M14
        con.executescript((RAIZ / 'indicadores.sql').read_text(encoding='utf-8'))
        con.commit()
        resultado = validar(con)
    finally:
        con.close()
    return ruta, resultado


def validar(con) -> pd.DataFrame:
    filas = [{'validacion': k, 'resultado': con.execute(q).fetchone()[0]} for k, q in VALIDACIONES.items()]
    df = pd.DataFrame(filas)
    df['pasa'] = df.resultado == 0
    return df


def main():
    ap = argparse.ArgumentParser(description='Acondicionamiento de datos de RH · OT Consulting')
    ap.add_argument('--datos', default='datos', help='carpeta con los 7 archivos fuente')
    ap.add_argument('--salida', default='salida', help='carpeta de salida (no se versiona)')
    ap.add_argument('--corte', default=CORTE_DEFECTO, help='fecha de corte AAAA-MM-DD')
    args = ap.parse_args()

    tablas, raw = acondicionar(args.datos, args.corte)
    ruta, val = guardar(tablas, raw, args.salida)

    print(f'Fecha de corte: {args.corte}\nBase: {ruta}\n')
    for nombre, df in tablas.items():
        if nombre in NOMBRE_SQL:
            print(f'  {NOMBRE_SQL[nombre]:30} {len(df):5} filas · {df.shape[1]} columnas')
    log = tablas['log_correcciones']
    print(f'\nCorrecciones registradas: {len(log)}')
    print(log.groupby('metodo').size().to_string())
    prop = tablas['propuestas_catalogo']
    if len(prop):
        print(f'\nValores fuera de catálogo (quedaron nulos; agrégalos a catalogos.py):\n{prop.to_string(index=False)}')
    print('\nValidaciones (deben dar cero):')
    for _, f in val.iterrows():
        print(f"  {'OK  ' if f.pasa else 'FALLA'} {f.resultado:4}  {f.validacion}")
    if not val.pasa.all():
        raise SystemExit(1)


if __name__ == '__main__':
    main()
