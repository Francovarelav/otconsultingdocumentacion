-- Vistas de indicadores de RH sobre las tablas acondicionadas.
-- Regla de lectura: cada indicador dice sobre cuántos registros confiables se calculó.
-- Todas las uniones son por ID (regla 1).

DROP VIEW IF EXISTS v_corte;
CREATE VIEW v_corte AS SELECT valor AS corte FROM parametro WHERE clave = 'fecha_corte';

-- Plantilla: los familiares asegurados no cuentan (regla 8)
DROP VIEW IF EXISTS v_plantilla;
CREATE VIEW v_plantilla AS SELECT * FROM colaborador_acondicionado WHERE es_plantilla = 1;

DROP VIEW IF EXISTS v_plantilla_activa;
CREATE VIEW v_plantilla_activa AS SELECT * FROM v_plantilla WHERE estatus = 'Activo';

-- ============================================================================================
-- 1 · Rotación y permanencia
-- ============================================================================================
-- Rotación mensual = bajas del mes / promedio de activos al inicio y al cierre × 100.
-- Las bajas sin fecha no se pueden ubicar en un mes: quedan fuera y se cuentan aparte.
DROP VIEW IF EXISTS v_rotacion_mensual;
CREATE VIEW v_rotacion_mensual AS
WITH RECURSIVE meses(inicio) AS (
    SELECT date((SELECT corte FROM v_corte), 'start of month', '-11 months')
    UNION ALL
    SELECT date(inicio, '+1 month') FROM meses
    WHERE inicio < date((SELECT corte FROM v_corte), 'start of month')
),
base AS (
    SELECT id_colaborador, fecha_incorporacion, fecha_baja FROM v_plantilla
    WHERE fecha_incorporacion IS NOT NULL AND NOT (estatus = 'Baja' AND fecha_baja IS NULL)
),
conteo AS (
    SELECT m.inicio,
        (SELECT COUNT(*) FROM base b WHERE b.fecha_incorporacion < m.inicio
            AND (b.fecha_baja IS NULL OR b.fecha_baja >= m.inicio)) AS activos_inicio,
        (SELECT COUNT(*) FROM base b WHERE b.fecha_incorporacion < date(m.inicio, '+1 month')
            AND (b.fecha_baja IS NULL OR b.fecha_baja >= date(m.inicio, '+1 month'))) AS activos_cierre,
        (SELECT COUNT(*) FROM base b WHERE b.fecha_baja >= m.inicio
            AND b.fecha_baja < date(m.inicio, '+1 month')) AS bajas_mes,
        (SELECT COUNT(*) FROM base b WHERE b.fecha_incorporacion >= m.inicio
            AND b.fecha_incorporacion < date(m.inicio, '+1 month')) AS ingresos_mes
    FROM meses m
)
SELECT strftime('%Y-%m', inicio) AS mes, activos_inicio, activos_cierre, ingresos_mes, bajas_mes,
       ROUND(bajas_mes * 100.0 / NULLIF((activos_inicio + activos_cierre) / 2.0, 0), 2) AS rotacion_mensual_pct
FROM conteo;

DROP VIEW IF EXISTS v_rotacion_anual;
CREATE VIEW v_rotacion_anual AS
SELECT
    (SELECT SUM(bajas_mes) FROM v_rotacion_mensual) AS bajas_12m_con_fecha,
    (SELECT ROUND(AVG((activos_inicio + activos_cierre) / 2.0), 1) FROM v_rotacion_mensual) AS plantilla_promedio_12m,
    (SELECT ROUND(SUM(bajas_mes) * 100.0 / AVG((activos_inicio + activos_cierre) / 2.0), 1) FROM v_rotacion_mensual) AS rotacion_anual_pct,
    (SELECT COUNT(*) FROM v_plantilla WHERE estatus = 'Baja') AS bajas_totales,
    (SELECT COUNT(*) FROM v_plantilla WHERE estatus = 'Baja' AND fecha_baja IS NOT NULL) AS bajas_con_fecha,
    (SELECT COUNT(*) FROM v_plantilla WHERE estatus = 'Baja' AND fecha_baja IS NULL) AS bajas_sin_fecha;

-- Cohortes por año de ingreso: cuántos entraron, cuántos siguen y cuántos salieron
DROP VIEW IF EXISTS v_cohorte_ingreso;
CREATE VIEW v_cohorte_ingreso AS
SELECT anio_ingreso,
       COUNT(*) AS ingresos,
       SUM(estatus = 'Activo') AS activos,
       SUM(estatus = 'Baja') AS bajas,
       ROUND(SUM(estatus = 'Baja') * 100.0 / COUNT(*), 1) AS pct_baja,
       SUM(baja_primer_anio = 1) AS bajas_primer_anio,
       SUM(estatus = 'Baja' AND baja_primer_anio IS NULL) AS bajas_sin_dato_de_permanencia,
       ROUND(AVG(CASE WHEN estatus = 'Baja' THEN antiguedad_meses END), 1) AS permanencia_meses,
       SUM(estatus = 'Baja' AND antiguedad_meses IS NOT NULL) AS bajas_con_permanencia
FROM v_plantilla
WHERE anio_ingreso IS NOT NULL
GROUP BY anio_ingreso;

-- Antigüedad de la plantilla activa por rangos
DROP VIEW IF EXISTS v_antiguedad_activos;
CREATE VIEW v_antiguedad_activos AS
SELECT CASE WHEN antiguedad_meses < 12 THEN '1 · Menos de 1 año'
            WHEN antiguedad_meses < 36 THEN '2 · 1 a 3 años'
            WHEN antiguedad_meses < 60 THEN '3 · 3 a 5 años'
            ELSE '4 · Más de 5 años' END AS rango,
       COUNT(*) AS personas
FROM v_plantilla_activa WHERE antiguedad_meses IS NOT NULL
GROUP BY 1;

-- ============================================================================================
-- 2 · Asignación y utilización
-- ============================================================================================
DROP VIEW IF EXISTS v_utilizacion;
CREATE VIEW v_utilizacion AS
SELECT COUNT(*) AS plantilla_activa,
       SUM(tiene_asignacion_vigente) AS con_asignacion,
       SUM(en_banca) AS en_banca,
       ROUND(SUM(en_banca) * 100.0 / COUNT(*), 1) AS pct_en_banca,
       SUM(sobreasignado) AS sobreasignados,
       ROUND(SUM(costo_mensual), 2) AS costo_nomina_mes,
       SUM(costo_mensual IS NOT NULL) AS personas_con_sueldo,
       ROUND(SUM(CASE WHEN en_banca = 1 THEN costo_mensual END), 2) AS costo_banca_mes,
       SUM(en_banca = 1 AND costo_mensual IS NOT NULL) AS banca_con_sueldo
FROM v_plantilla_activa;

DROP VIEW IF EXISTS v_banca;
CREATE VIEW v_banca AS
SELECT id_colaborador, nombre, puesto, departamento, esquema_nomina, fecha_incorporacion,
       dias_en_banca, costo_mensual
FROM v_plantilla_activa WHERE en_banca = 1
ORDER BY dias_en_banca DESC;

DROP VIEW IF EXISTS v_banca_por_puesto;
CREATE VIEW v_banca_por_puesto AS
SELECT COALESCE(puesto, 'Sin puesto capturado') AS puesto,
       COUNT(*) AS personas, SUM(en_banca) AS en_banca, SUM(tiene_asignacion_vigente) AS asignados
FROM v_plantilla_activa GROUP BY 1 ORDER BY personas DESC;

DROP VIEW IF EXISTS v_concentracion_cliente;
CREATE VIEW v_concentracion_cliente AS
SELECT cl.id_cliente, cl.cliente, cl.industria,
       COUNT(DISTINCT a.id_colaborador) AS colaboradores,
       ROUND(COUNT(DISTINCT a.id_colaborador) * 100.0 / (SELECT COUNT(*) FROM v_plantilla_activa), 1) AS concentracion_cliente_pct,
       ROUND(COUNT(DISTINCT a.id_colaborador) * 100.0 /
             (SELECT COUNT(DISTINCT id_colaborador) FROM asignacion_acondicionada WHERE vigente = 1), 1) AS pct_de_asignados,
       ROUND(SUM(a.costo_personal_mes), 2) AS costo_personal_mes
FROM asignacion_acondicionada a
JOIN cliente_acondicionado cl ON cl.id_cliente = a.id_cliente
WHERE a.vigente = 1
GROUP BY cl.id_cliente
ORDER BY colaboradores DESC;

DROP VIEW IF EXISTS v_proyecto;
CREATE VIEW v_proyecto AS
SELECT p.id_proyecto, p.proyecto, cl.cliente, p.estatus_proyecto, p.fecha_inicio, p.fecha_fin,
       p.falta_pm, p.falta_fecha_inicio, p.fin_vencido_en_curso,
       COUNT(a.id_asignacion) AS asignaciones_vigentes,
       ROUND(SUM(a.costo_personal_mes), 2) AS costo_personal_proyecto,
       SUM(a.costo_personal_mes IS NOT NULL) AS asignaciones_con_costo
FROM proyecto_acondicionado p
JOIN cliente_acondicionado cl ON cl.id_cliente = p.id_cliente
LEFT JOIN asignacion_acondicionada a ON a.id_proyecto = p.id_proyecto AND a.vigente = 1
GROUP BY p.id_proyecto
ORDER BY asignaciones_vigentes DESC, cl.cliente;

DROP VIEW IF EXISTS v_vencimiento_asignacion;
CREATE VIEW v_vencimiento_asignacion AS
SELECT vence_en, COUNT(*) AS asignaciones
FROM asignacion_acondicionada WHERE vigente = 1 GROUP BY vence_en;

DROP VIEW IF EXISTS v_sobreasignados;
CREATE VIEW v_sobreasignados AS
SELECT id_colaborador, nombre, puesto, asignaciones_vigentes, dedicacion_total_pct
FROM v_plantilla_activa WHERE sobreasignado = 1;

-- ============================================================================================
-- 3 · Costo
-- ============================================================================================
DROP VIEW IF EXISTS v_costo_por_esquema;
CREATE VIEW v_costo_por_esquema AS
SELECT COALESCE(esquema_nomina, 'Sin esquema capturado') AS esquema_nomina,
       COUNT(*) AS personas,
       SUM(costo_mensual IS NOT NULL) AS personas_con_sueldo,
       ROUND(SUM(costo_mensual), 2) AS costo_nomina_por_esquema,
       ROUND(AVG(costo_mensual), 2) AS costo_promedio
FROM v_plantilla_activa GROUP BY 1 ORDER BY costo_nomina_por_esquema DESC;

DROP VIEW IF EXISTS v_composicion_sueldo;
CREATE VIEW v_composicion_sueldo AS
SELECT ROUND(SUM(sueldo_neto_imss), 2) AS neto_imss,
       ROUND(SUM(sueldo_asimilados_sindicato), 2) AS asimilados_sindicato,
       ROUND(SUM(sueldo_complementos), 2) AS complementos,
       ROUND(SUM(comision_nomina), 2) AS comision_nomina,
       ROUND(SUM(impuestos_imss), 2) AS impuestos_imss,
       ROUND(SUM(sueldo_total_integrado), 2) AS total_integrado
FROM v_plantilla_activa;

-- ============================================================================================
-- 4 · Habilidades
-- ============================================================================================
DROP VIEW IF EXISTS v_cobertura_matriz;
CREATE VIEW v_cobertura_matriz AS
SELECT COUNT(*) AS plantilla_activa,
       SUM(id_colaborador IN (SELECT id_colaborador FROM matriz_habilidad_long)) AS con_matriz,
       SUM(id_colaborador NOT IN (SELECT id_colaborador FROM matriz_habilidad_long)) AS sin_matriz,
       (SELECT COUNT(*) FROM matriz_habilidad_long) AS evaluaciones,
       (SELECT COUNT(*) FROM matriz_habilidad_long WHERE fecha_evaluacion IS NULL) AS evaluaciones_sin_fecha
FROM v_plantilla_activa;

-- Experto disponible = activo de plantilla con nivel Avanzado o Experto
DROP VIEW IF EXISTS v_expertos_por_habilidad;
CREATE VIEW v_expertos_por_habilidad AS
SELECT h.cod_habilidad, h.habilidad, h.tecnologia, h.tipo,
       COUNT(m.id_colaborador) AS evaluados,
       COALESCE(SUM(m.nivel_num >= 3), 0) AS expertos_por_habilidad,
       COALESCE(SUM(m.nivel_num = 4), 0) AS nivel_experto,
       COALESCE(SUM(m.nivel_num >= 3), 0) <= 1 AS riesgo_persona_clave
FROM habilidad_acondicionada h
LEFT JOIN (SELECT m.* FROM matriz_habilidad_long m
           JOIN v_plantilla_activa c ON c.id_colaborador = m.id_colaborador) m
       ON m.cod_habilidad = h.cod_habilidad
GROUP BY h.cod_habilidad
ORDER BY expertos_por_habilidad, h.cod_habilidad;

DROP VIEW IF EXISTS v_nivel_por_tecnologia;
CREATE VIEW v_nivel_por_tecnologia AS
SELECT h.tecnologia, m.nivel_num, m.nivel, COUNT(*) AS evaluaciones
FROM matriz_habilidad_long m
JOIN habilidad_acondicionada h ON h.cod_habilidad = m.cod_habilidad
JOIN v_plantilla_activa c ON c.id_colaborador = m.id_colaborador
GROUP BY h.tecnologia, m.nivel_num;

-- ============================================================================================
-- 5 · Cumplimiento (expediente) y activos
-- ============================================================================================
DROP VIEW IF EXISTS v_expediente_resumen;
CREATE VIEW v_expediente_resumen AS
SELECT COUNT(*) AS plantilla_activa,
       SUM(expediente_completo) AS expedientes_completos,
       ROUND(AVG(pct_expediente), 1) AS pct_expediente_promedio,
       SUM(falta_puesto) AS falta_puesto, SUM(falta_departamento) AS falta_departamento,
       SUM(falta_esquema_nomina) AS falta_esquema_nomina, SUM(falta_sueldo) AS falta_sueldo,
       SUM(cumple_regla_5) AS cumple_regla_5
FROM v_plantilla_activa;

DROP VIEW IF EXISTS v_expediente_documento;
CREATE VIEW v_expediente_documento AS
SELECT d.documento, d.nombre, d.obligatorio,
       COUNT(*) AS plantilla_activa,
       SUM(e.cumplido = 1) AS cumplidos,
       ROUND(SUM(e.cumplido = 1) * 100.0 / COUNT(*), 1) AS pct_cumplido
FROM expediente_documento_long e
JOIN cat_documento d ON d.documento = e.documento
JOIN v_plantilla_activa c ON c.id_colaborador = e.id_colaborador
GROUP BY d.documento
ORDER BY d.obligatorio DESC, pct_cumplido;

DROP VIEW IF EXISTS v_activos_resumen;
CREATE VIEW v_activos_resumen AS
SELECT COUNT(*) AS equipos,
       SUM(vigente) AS en_uso,
       SUM(sin_asignar) AS sin_asignar,
       SUM(falta_costo) AS sin_costo,
       SUM(costo IS NOT NULL) AS con_costo,
       ROUND(SUM(costo), 2) AS valor_inventario_conocido,
       SUM(pendiente_recuperar) AS pendientes_recuperar,
       ROUND(SUM(CASE WHEN pendiente_recuperar = 1 THEN costo END), 2) AS valor_equipo_no_recuperado,
       SUM(pendiente_recuperar = 1 AND costo IS NOT NULL) AS pendientes_con_costo,
       SUM(dueno_no_identificado) AS dueno_no_identificado
FROM activo_acondicionado;

DROP VIEW IF EXISTS v_equipo_pendiente_recuperar;
CREATE VIEW v_equipo_pendiente_recuperar AS
SELECT a.cod_activo, a.tipo, a.marca, a.modelo, a.costo, a.id_colaborador, c.nombre, c.fecha_baja
FROM activo_acondicionado a
JOIN colaborador_acondicionado c ON c.id_colaborador = a.id_colaborador
WHERE a.pendiente_recuperar = 1
ORDER BY a.costo DESC;

DROP VIEW IF EXISTS v_activos_por_marca;
CREATE VIEW v_activos_por_marca AS
SELECT marca, COUNT(*) AS equipos, SUM(falta_costo) AS sin_costo, ROUND(SUM(costo), 2) AS valor_conocido
FROM activo_acondicionado GROUP BY marca ORDER BY equipos DESC;

-- ============================================================================================
-- Indicadores bloqueados: programados contra las tablas M14. Hoy regresan vacío o nulo;
-- se activan en cuanto RH capture el dato.
-- ============================================================================================
DROP VIEW IF EXISTS v_bajas_por_causa;
CREATE VIEW v_bajas_por_causa AS
SELECT cb.grupo, cb.causa_baja, COUNT(*) AS bajas,
       SUM(cb.grupo = 'Voluntaria') AS es_baja_voluntaria
FROM baja b JOIN cat_causa_baja cb ON cb.id_causa_baja = b.id_causa_baja
GROUP BY cb.id_causa_baja ORDER BY bajas DESC;

DROP VIEW IF EXISTS v_costo_reemplazo;
CREATE VIEW v_costo_reemplazo AS
SELECT b.id_colaborador, b.fecha_baja,
       COALESCE(b.costo_reclutamiento, 0) + COALESCE(b.costo_capacitacion, 0)
         + (b.dias_vacante / 30.0) * c.costo_mensual AS costo_reemplazo
FROM baja b JOIN colaborador_acondicionado c ON c.id_colaborador = b.id_colaborador;

DROP VIEW IF EXISTS v_horas_facturables;
CREATE VIEW v_horas_facturables AS
SELECT a.id_proyecto, strftime('%Y-%m', h.semana_inicio) AS mes,
       SUM(h.horas) AS horas_totales,
       SUM(CASE WHEN h.facturable = 1 THEN h.horas ELSE 0 END) AS horas_facturables,
       ROUND(SUM(CASE WHEN h.facturable = 1 THEN h.horas ELSE 0 END) * 100.0 / NULLIF(SUM(h.horas), 0), 1) AS pct_horas_facturables
FROM registro_horas h JOIN asignacion_acondicionada a ON a.id_asignacion = h.id_asignacion
GROUP BY a.id_proyecto, mes;

DROP VIEW IF EXISTS v_margen_proyecto;
CREATE VIEW v_margen_proyecto AS
WITH ingreso AS (
    SELECT a.id_proyecto, SUM(h.horas * t.tarifa_hora) AS ingreso_proyecto
    FROM registro_horas h
    JOIN asignacion_acondicionada a ON a.id_asignacion = h.id_asignacion
    JOIN tarifa_proyecto t ON t.id_proyecto = a.id_proyecto
         AND h.semana_inicio >= t.vigente_desde AND (t.vigente_hasta IS NULL OR h.semana_inicio <= t.vigente_hasta)
    WHERE h.facturable = 1
    GROUP BY a.id_proyecto
)
SELECT p.id_proyecto, p.proyecto, i.ingreso_proyecto, p.costo_personal_proyecto,
       ROUND((i.ingreso_proyecto - p.costo_personal_proyecto) * 100.0 / NULLIF(i.ingreso_proyecto, 0), 1) AS margen_proyecto_pct
FROM ingreso i JOIN v_proyecto p ON p.id_proyecto = i.id_proyecto;

DROP VIEW IF EXISTS v_certificacion_vigencia;
CREATE VIEW v_certificacion_vigencia AS
SELECT ce.*, CAST(julianday(ce.fecha_vencimiento) - julianday((SELECT corte FROM v_corte)) AS INT) AS dias_vencim_cert,
       ce.fecha_vencimiento IS NULL OR ce.fecha_vencimiento >= (SELECT corte FROM v_corte) AS vigente
FROM certificacion ce;

DROP VIEW IF EXISTS v_matriz_actualizada;
CREATE VIEW v_matriz_actualizada AS
SELECT id_colaborador, cod_habilidad, nivel_num, fecha_evaluacion,
       fecha_evaluacion >= date((SELECT corte FROM v_corte), '-12 months') AS matriz_actualizada
FROM matriz_habilidad_long WHERE fecha_evaluacion IS NOT NULL;

DROP VIEW IF EXISTS v_indicador_bloqueado;
CREATE VIEW v_indicador_bloqueado AS
SELECT 'es_baja_voluntaria' AS indicador, 'Causa de baja' AS dato_que_falta, 'baja' AS tabla, 'id_causa_baja' AS campo,
       (SELECT COUNT(*) FROM baja) AS registros_capturados
UNION ALL SELECT 'costo_reemplazo', 'Costo de reclutamiento, capacitación y días de vacante', 'baja', 'costo_reclutamiento · costo_capacitacion · dias_vacante', (SELECT COUNT(*) FROM baja WHERE dias_vacante IS NOT NULL)
UNION ALL SELECT 'pct_horas_facturables', 'Registro de horas por semana', 'registro_horas', 'horas · facturable', (SELECT COUNT(*) FROM registro_horas)
UNION ALL SELECT 'ingreso_proyecto · margen_proyecto_pct', 'Tarifas por proyecto', 'tarifa_proyecto', 'tarifa_hora', (SELECT COUNT(*) FROM tarifa_proyecto)
UNION ALL SELECT 'dias_vencim_cert', 'Certificaciones con vencimiento', 'certificacion', 'fecha_obtencion · fecha_vencimiento', (SELECT COUNT(*) FROM certificacion)
UNION ALL SELECT 'matriz_actualizada', 'Fecha de evaluación de habilidades', 'matriz_habilidad_long', 'fecha_evaluacion', (SELECT COUNT(*) FROM matriz_habilidad_long WHERE fecha_evaluacion IS NOT NULL);

-- ============================================================================================
-- Lista de captura pendiente para RH: campo exacto, tabla y cuántos registros faltan
-- ============================================================================================
DROP VIEW IF EXISTS v_captura_pendiente;
CREATE VIEW v_captura_pendiente AS
SELECT 'Rotación' AS bloque, 'baja' AS tabla, 'id_causa_baja' AS campo, 'Causa de baja de cada salida' AS descripcion,
       (SELECT COUNT(*) FROM v_plantilla WHERE estatus = 'Baja') AS registros_faltantes, 'Alta' AS prioridad
UNION ALL SELECT 'Rotación', 'colaborador_acondicionado', 'fecha_baja', 'Fecha de baja', (SELECT SUM(falta_fecha_baja) FROM v_plantilla), 'Alta'
UNION ALL SELECT 'Rotación', 'colaborador_acondicionado', 'estatus', 'Activos que traían fecha de baja: confirmar si siguen', (SELECT SUM(inconsistencia_estatus_fecha) FROM v_plantilla), 'Alta'
UNION ALL SELECT 'Utilización', 'registro_horas', 'horas · facturable', 'Horas por semana y asignación', (SELECT COUNT(*) FROM asignacion_acondicionada WHERE vigente = 1), 'Alta'
UNION ALL SELECT 'Utilización', 'asignacion_acondicionada', 'fecha_inicio', 'Fecha real de inicio de la asignación', (SELECT SUM(falta_fecha_inicio) FROM asignacion_acondicionada), 'Media'
UNION ALL SELECT 'Utilización', 'asignacion_acondicionada', 'pct_dedicacion', 'Porcentaje de dedicación (hoy estimado al 100%)', (SELECT SUM(pct_dedicacion_estimado) FROM asignacion_acondicionada WHERE vigente = 1), 'Media'
UNION ALL SELECT 'Utilización', 'asignacion_acondicionada', 'rol_asignado', 'Rol en el proyecto', (SELECT COUNT(*) FROM asignacion_acondicionada WHERE rol_asignado IS NULL), 'Media'
UNION ALL SELECT 'Costos', 'tarifa_proyecto', 'tarifa_hora', 'Tarifa por hora de cada proyecto', (SELECT COUNT(*) FROM proyecto_acondicionado), 'Alta'
UNION ALL SELECT 'Costos', 'colaborador_acondicionado', 'sueldo_total_integrado', 'Sueldo de activos que hoy está en $0', (SELECT SUM(falta_sueldo) FROM v_plantilla), 'Alta'
UNION ALL SELECT 'Costos', 'proyecto_acondicionado', 'pm_otc', 'PM de OT Consulting del proyecto', (SELECT SUM(falta_pm) FROM proyecto_acondicionado), 'Media'
UNION ALL SELECT 'Costos', 'departamento_acondicionado', 'responsable · centro_costos', 'Responsable y centro de costos', (SELECT SUM(falta_responsable) FROM departamento_acondicionado), 'Media'
UNION ALL SELECT 'Habilidades', 'certificacion', 'fecha_obtencion · fecha_vencimiento', 'Certificaciones con vencimiento', NULL, 'Media'
UNION ALL SELECT 'Habilidades', 'matriz_habilidad_long', 'fecha_evaluacion', 'Fecha de evaluación de cada habilidad', (SELECT COUNT(*) FROM matriz_habilidad_long WHERE fecha_evaluacion IS NULL), 'Media'
UNION ALL SELECT 'Habilidades', 'matriz_habilidad_long', 'nivel', 'Activos sin ninguna habilidad evaluada', (SELECT sin_matriz FROM v_cobertura_matriz), 'Media'
UNION ALL SELECT 'Cumplimiento', 'colaborador_acondicionado', 'id_puesto', 'Puesto de activos', (SELECT SUM(falta_puesto) FROM v_plantilla), 'Alta'
UNION ALL SELECT 'Cumplimiento', 'colaborador_acondicionado', 'id_departamento', 'Departamento de activos', (SELECT SUM(falta_departamento) FROM v_plantilla), 'Alta'
UNION ALL SELECT 'Cumplimiento', 'colaborador_acondicionado', 'doc_contrato', 'Contrato en el expediente', (SELECT COUNT(*) FROM v_plantilla_activa WHERE COALESCE(doc_contrato, 0) = 0), 'Alta'
UNION ALL SELECT 'Activos', 'activo_acondicionado', 'costo', 'Costo de compra del equipo', (SELECT SUM(falta_costo) FROM activo_acondicionado), 'Media'
UNION ALL SELECT 'Activos', 'activo_acondicionado', 'fecha_fin', 'Equipo de personas dadas de baja: recuperar o marcar', (SELECT SUM(pendiente_recuperar) FROM activo_acondicionado), 'Alta';
