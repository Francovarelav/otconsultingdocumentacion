-- M14 · Tablas de extensión
-- Estructuras vacías, con llave y dominio, para los datos que el negocio necesita y que el
-- sistema todavía no captura. Los 6 indicadores bloqueados (ver indicadores.sql) leen de aquí:
-- en cuanto RH capture, se activan solos.

CREATE TABLE IF NOT EXISTS baja (
    id_baja         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_colaborador  TEXT NOT NULL REFERENCES colaborador_acondicionado(id_colaborador),
    fecha_baja      TEXT NOT NULL,                                   -- AAAA-MM-DD
    tipo_baja       TEXT NOT NULL CHECK (tipo_baja IN ('Renuncia', 'Despido', 'Fin de contrato', 'Otro')),
    id_causa_baja   TEXT NOT NULL REFERENCES cat_causa_baja(id_causa_baja),
    costo_reclutamiento REAL CHECK (costo_reclutamiento >= 0),
    costo_capacitacion  REAL CHECK (costo_capacitacion >= 0),
    dias_vacante    INTEGER CHECK (dias_vacante >= 0),
    recontratable   INTEGER CHECK (recontratable IN (0, 1)),
    comentario      TEXT,
    UNIQUE (id_colaborador, fecha_baja)                              -- un reingreso crea un periodo nuevo
);

CREATE TABLE IF NOT EXISTS registro_horas (
    id_registro     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_asignacion   TEXT NOT NULL REFERENCES asignacion_acondicionada(id_asignacion),
    semana_inicio   TEXT NOT NULL,                                   -- lunes de la semana
    horas           REAL NOT NULL CHECK (horas >= 0 AND horas <= 80),
    facturable      INTEGER NOT NULL CHECK (facturable IN (0, 1)),
    UNIQUE (id_asignacion, semana_inicio, facturable)
);

CREATE TABLE IF NOT EXISTS tarifa_proyecto (
    id_tarifa       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_proyecto     TEXT NOT NULL REFERENCES proyecto_acondicionado(id_proyecto),
    rol             TEXT,
    tarifa_hora     REAL NOT NULL CHECK (tarifa_hora > 0),
    moneda          TEXT NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN', 'USD')),
    vigente_desde   TEXT NOT NULL,
    vigente_hasta   TEXT
);

CREATE TABLE IF NOT EXISTS certificacion (
    id_certificacion  INTEGER PRIMARY KEY AUTOINCREMENT,
    id_colaborador    TEXT NOT NULL REFERENCES colaborador_acondicionado(id_colaborador),
    cod_habilidad     TEXT REFERENCES habilidad_acondicionada(cod_habilidad),
    certificacion     TEXT NOT NULL,
    emisor            TEXT,
    fecha_obtencion   TEXT NOT NULL,
    fecha_vencimiento TEXT,                                          -- nula = no vence
    CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_obtencion)
);
