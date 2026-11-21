"""Exporta las vistas de indicadores de `otc_rh.db` al JSON que lee el tablero.

Uso:
    python src/exportar_tablero.py                  # solo IDs, sin nombres
    python src/exportar_tablero.py --con-nombres    # para uso interno de RH

El JSON se escribe en `tablero/public/datos.json`, que no se versiona.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import pandas as pd

from acondicionamiento_rh import VALIDACIONES

RAIZ = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(RAIZ / 'salida' / 'otc_rh.db'))
    ap.add_argument('--destino', default=str(RAIZ / 'tablero' / 'public' / 'datos.json'))
    ap.add_argument('--con-nombres', action='store_true', help='incluye el nombre de cada persona')
    args = ap.parse_args()

    con = sqlite3.connect(args.db)

    def filas(sql):
        df = pd.read_sql(sql, con)
        if not args.con_nombres and 'nombre' in df.columns and 'id_colaborador' in df.columns:
            df['nombre'] = None
        return json.loads(df.to_json(orient='records'))

    def una(sql):
        r = filas(sql)
        return r[0] if r else {}

    param = dict(con.execute('SELECT clave, valor FROM parametro').fetchall())
    datos = {
        'meta': {'corte': param['fecha_corte'], 'fecha_proceso': param['fecha_proceso'],
                 'con_nombres': args.con_nombres,
                 'filas_fuente': {k.replace('filas_fuente_', ''): int(v) for k, v in param.items() if k.startswith('filas_fuente_')}},
        'plantilla': una("""SELECT (SELECT COUNT(*) FROM colaborador_acondicionado) AS registros,
                                   (SELECT COUNT(*) FROM v_plantilla) AS plantilla,
                                   (SELECT COUNT(*) FROM v_plantilla_activa) AS activos,
                                   (SELECT COUNT(*) FROM v_plantilla WHERE estatus='Baja') AS bajas,
                                   (SELECT COUNT(*) FROM colaborador_acondicionado WHERE es_plantilla=0) AS familiares,
                                   (SELECT COUNT(*) FROM v_plantilla WHERE anio_ingreso >= 2024) AS ingresos_desde_2024,
                                   (SELECT COUNT(*) FROM v_plantilla WHERE anio_ingreso >= 2024 AND estatus='Baja') AS bajas_desde_2024,
                                   (SELECT COUNT(*) FROM v_plantilla WHERE baja_primer_anio = 1) AS bajas_primer_anio,
                                   (SELECT COUNT(*) FROM v_plantilla WHERE estatus='Baja' AND baja_primer_anio IS NOT NULL) AS bajas_con_permanencia"""),
        'rotacion': {
            'mensual': filas('SELECT * FROM v_rotacion_mensual'),
            'anual': una('SELECT * FROM v_rotacion_anual'),
            'cohortes': filas('SELECT * FROM v_cohorte_ingreso'),
            'antiguedad': filas('SELECT * FROM v_antiguedad_activos'),
            'genero': filas('SELECT genero, COUNT(*) AS personas FROM v_plantilla_activa GROUP BY genero'),
        },
        'utilizacion': {
            'resumen': una('SELECT * FROM v_utilizacion'),
            'banca': filas('SELECT * FROM v_banca'),
            'por_puesto': filas('SELECT * FROM v_banca_por_puesto'),
            'clientes': filas('SELECT * FROM v_concentracion_cliente'),
            'proyectos': filas('SELECT * FROM v_proyecto'),
            'vencimientos': filas('SELECT * FROM v_vencimiento_asignacion'),
            'sobreasignados': filas('SELECT * FROM v_sobreasignados'),
        },
        'costos': {
            'esquema': filas('SELECT * FROM v_costo_por_esquema'),
            'composicion': una('SELECT * FROM v_composicion_sueldo'),
        },
        'habilidades': {
            'cobertura': una('SELECT * FROM v_cobertura_matriz'),
            'lista': filas('SELECT * FROM v_expertos_por_habilidad'),
            'niveles': filas('SELECT * FROM v_nivel_por_tecnologia'),
        },
        'cumplimiento': {
            'resumen': una('SELECT * FROM v_expediente_resumen'),
            'documentos': filas('SELECT * FROM v_expediente_documento'),
        },
        'activos': {
            'resumen': una('SELECT * FROM v_activos_resumen'),
            'marcas': filas('SELECT * FROM v_activos_por_marca'),
            'pendientes': filas('SELECT * FROM v_equipo_pendiente_recuperar'),
        },
        'calidad': {
            'columnas': filas('SELECT * FROM calidad_datos'),
            'metodos': filas('SELECT metodo, COUNT(*) AS correcciones FROM log_correcciones GROUP BY metodo'),
            'validaciones': [{'validacion': k, 'resultado': con.execute(q).fetchone()[0]} for k, q in VALIDACIONES.items()],
        },
        'bloqueados': filas('SELECT * FROM v_indicador_bloqueado'),
        'captura': filas('SELECT * FROM v_captura_pendiente'),
    }
    con.close()

    destino = Path(args.destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Tablero: {destino} ({destino.stat().st_size / 1024:.0f} KB) · nombres: {"sí" if args.con_nombres else "no"}')


if __name__ == '__main__':
    main()
