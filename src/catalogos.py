"""Catálogos y diccionarios de equivalencias (método M3).

Las llaves están en forma de *clave*: mayúsculas, sin acentos y con espacios colapsados
(ver `acondicionamiento_rh.clave`). El valor es la forma canónica.

`rapidfuzz` solo se usa para PROPONER equivalencias de valores que no estén aquí; la
asignación final siempre queda escrita en estos diccionarios para que el resultado sea
reproducible. Un valor que no esté en el diccionario no se adivina: queda nulo con bandera.
"""

# --- M2 · Centinelas: textos que ocupan el lugar de un dato que en realidad no existe -------
CENTINELAS = {
    'PENDIENTE', 'PENDIENTE LLAMAR', 'NO LO ENVIO', 'XXXX', 'XXXXXXXXX', 'XXXXXXXXXX',
    'N/A', 'NA', '-', '', 'INDEFINIDO', 'SIN ASIGNAR', 'CONOCIDA', 'NAN', 'NONE',
}
FECHAS_RELLENO = {'1990-01-01'}

# --- Ciudad: clave -> (ciudad, estado, país, precisión) -------------------------------------
# precisión = 'ciudad' cuando el dato identifica la ciudad; 'estado' o 'pais' cuando el
# sistema solo capturó eso (se conserva lo que sí se sabe, no se inventa la ciudad).
CIUDAD = {
    'MONTERREY': ('Monterrey', 'Nuevo León', 'México', 'ciudad'),
    'MTY': ('Monterrey', 'Nuevo León', 'México', 'ciudad'),
    'CDMX': ('Ciudad de México', 'Ciudad de México', 'México', 'ciudad'),
    'PUEBLA': ('Puebla', 'Puebla', 'México', 'ciudad'),
    'TLAXCALA': ('Tlaxcala', 'Tlaxcala', 'México', 'ciudad'),
    'QUERETARO': ('Querétaro', 'Querétaro', 'México', 'ciudad'),
    'CUERNAVACA': ('Cuernavaca', 'Morelos', 'México', 'ciudad'),
    'ZACATEPEC': ('Zacatepec', 'Morelos', 'México', 'ciudad'),
    'SALTILLO (VILLAS DE ARANJUEZ)': ('Saltillo', 'Coahuila', 'México', 'ciudad'),
    'MUGICA, MICHOACAN': ('Múgica', 'Michoacán', 'México', 'ciudad'),
    'CHIHUAHUA': ('Chihuahua', 'Chihuahua', 'México', 'ciudad'),
    'TUXTLA GUTIERREZ CHIAPAS': ('Tuxtla Gutiérrez', 'Chiapas', 'México', 'ciudad'),
    'CANANEA': ('Cananea', 'Sonora', 'México', 'ciudad'),
    'CIUDAD OBREGON': ('Ciudad Obregón', 'Sonora', 'México', 'ciudad'),
    'TOLUCA': ('Toluca', 'Estado de México', 'México', 'ciudad'),
    'SAN LUIS POTOSI': ('San Luis Potosí', 'San Luis Potosí', 'México', 'ciudad'),
    'ENSENADA': ('Ensenada', 'Baja California', 'México', 'ciudad'),
    'ENSENADA, BAJA CALIFORNIA': ('Ensenada', 'Baja California', 'México', 'ciudad'),
    'GUADALAJARA': ('Guadalajara', 'Jalisco', 'México', 'ciudad'),
    'EDO DE MEXICO': (None, 'Estado de México', 'México', 'estado'),
    'HIDALGO': (None, 'Hidalgo', 'México', 'estado'),
    'TAMAULIPAS': (None, 'Tamaulipas', 'México', 'estado'),
    'JALISCO': (None, 'Jalisco', 'México', 'estado'),
    'COLOMBIA': (None, None, 'Colombia', 'pais'),
}
# Valores capturados en el campo Ciudad que no son un lugar: nulo + bandera.
CIUDAD_NO_VALIDA = {'MATRIZ COPORATIVA', 'MATRIZ CORPORATIVA'}

# --- Aseguradora de gastos médicos mayores: clave -> (aseguradora, tiene_sgmm) -------------
# 'SI' confirma que hay seguro pero no dice con quién: tiene_sgmm = 1 y aseguradora nula.
# 'PLAN ATLAS' es ambiguo (¿Plan Seguro o Seguros Atlas?): no se adivina.
ASEGURADORA = {
    'METLIFE': ('MetLife', 1),
    'SEGUROS ATLAS': ('Seguros Atlas', 1),
    'PLAN SEGURO': ('Plan Seguro', 1),
    'PLAN SEGUROS': ('Plan Seguro', 1),
    'SI': (None, 1),
    'PLAN ATLAS': (None, 1),
    'NO': (None, 0),
}

# --- Esquema de nómina -----------------------------------------------------------------------
ESQUEMA_NOMINA = {
    'SMR': 'SMR',
    'OTC 100%': 'OTC 100%',
    'OTC-SINDICATO (SMR)': 'OTC-SINDICATO (SMR)',
    'MAGNESON-SINDICATO': 'MAGNESON-SINDICATO',
    'XERES OT-SINDICATO': 'XERES OT-SINDICATO',
    'MODALIDAD 40-SMR': 'MODALIDAD 40-SMR',
    'ADMINISTRATIVA': 'ADMINISTRATIVA',
    'IRAZU/ASIMILADOS': 'IRAZU/ASIMILADOS',
    'EXTRANJERO': 'EXTRANJERO',
}

# --- Marca de equipo -------------------------------------------------------------------------
MARCA = {'DELL': 'Dell', 'HP': 'HP', 'LENOVO': 'Lenovo', 'ACER': 'Acer', 'ASUS': 'Asus'}

# --- Industria del cliente -------------------------------------------------------------------
INDUSTRIA = {
    'MANUFACTURA': 'Manufactura',
    'AUTOMOTRIZ': 'Automotriz',
    'CONSULTORIA': 'Consultoría',
    'RENTAS DE EQUIPO': 'Renta de equipo',
    'RENTA DE EQUIPO': 'Renta de equipo',
}

# --- Clientes y proyectos: corrige errores de dedo sin fusionar registros -------------------
CLIENTE = {
    'METALSA': 'Metalsa',
    'GRUPO DALTILE': 'Grupo Daltile',
    'ALLEGION': 'Allegion',
    'CITI': 'Citi',
    'PARKER SERVICIOS DE MEXICO': 'Parker Servicios de México',
    'RENT A CENTER (RAC MEXICO OPERACIONES)': 'Rent A Center (RAC México Operaciones)',
    'FANOSA': 'Fanosa',
    'NOVOCAST': 'Novocast',
}
PROYECTO = {
    'AMS MANUFACTURA': 'AMS Manufactura',
    'SOPORTE AMS MANUFACTA': 'Soporte AMS Manufactura',
    'ASIGNACION INDEFINIDA': 'Asignación indefinida',
    'MARAZZI': 'Marazzi',
    'ASIGNACION EBS TEMPORAL (3 MESES)': 'Asignación EBS temporal (3 meses)',
    'ASIGNACION FUNCIONAL-TECNICO (4 MESES)': 'Asignación Funcional-Técnico (4 meses)',
    'MIGRACION EBS': 'Migración EBS',
    'SOPORTE ORACLE CLOUD': 'Soporte Oracle Cloud',
    'DESARROLLO DE INDICADORES': 'Desarrollo de Indicadores',
    'SHINE - ASIGANCI´NON DE RECURSOS DE APOYO': 'SHINE - Asignación de recursos de apoyo',
    'SOPORTE DBA': 'Soporte DBA',
    'HOSTING EBS': 'Hosting EBS',
}

# --- Tecnología de la habilidad (y su forma corta para la clave compuesta, M6) --------------
TECNOLOGIA = {
    'ORACLE EBS': ('Oracle EBS', 'EBS'),
    'ORACLE FUSION CLOUD': ('Oracle Fusion Cloud', 'Cloud'),
    'PLATAFORMAS TECNOLOGICAS': ('Plataformas Tecnológicas', 'Plataformas'),
    'IDIOMAS': ('Idiomas', 'Idiomas'),
    'CERTIFICACIONES': ('Certificaciones', 'Certificaciones'),
    'OTROS': ('Otros', 'Otros'),
}

# --- Nivel de habilidad (regla 19) ----------------------------------------------------------
NIVEL = {'BASICO': 1, 'INTERMEDIO': 2, 'AVANZADO': 3, 'EXPERTO': 4}
NIVEL_NOMBRE = {1: 'Básico', 2: 'Intermedio', 3: 'Avanzado', 4: 'Experto'}

# --- Puestos que no son plantilla (regla 8, M7) ----------------------------------------------
PUESTOS_NO_PLANTILLA = {'FAMILIAR COLABORADOR'}

# --- Documentación del expediente (regla 9, M4) ----------------------------------------------
# columna fuente -> (columna acondicionada, ¿obligatorio?)
DOCUMENTOS = {
    'Doc: Acta': ('doc_acta', 1),
    'Doc: INE': ('doc_ine', 1),
    'Doc: CURP': ('doc_curp', 1),
    'Doc: Pasaporte': ('doc_pasaporte', 0),
    'Doc: Visa': ('doc_visa', 0),
    'Doc: Const. Situación Fiscal': ('doc_csf', 1),
    'Doc: NSS': ('doc_nss', 1),
    'Doc: Comprobante Domicilio': ('doc_comprobante_domicilio', 1),
    'Doc: Banco': ('doc_banco', 1),
    'Doc: Foto': ('doc_foto', 1),
    'Doc: Contrato': ('doc_contrato', 1),
    'Aviso: Infonavit': ('aviso_infonavit', 1),
    'Aviso: Manutención': ('aviso_manutencion', 1),
    'Formato: RH': ('formato_rh', 1),
}
DOCUMENTO_NOMBRE = {
    'doc_acta': 'Acta de nacimiento', 'doc_ine': 'INE', 'doc_curp': 'CURP',
    'doc_pasaporte': 'Pasaporte', 'doc_visa': 'Visa',
    'doc_csf': 'Constancia de situación fiscal', 'doc_nss': 'NSS',
    'doc_comprobante_domicilio': 'Comprobante de domicilio', 'doc_banco': 'Cuenta bancaria',
    'doc_foto': 'Foto', 'doc_contrato': 'Contrato', 'aviso_infonavit': 'Aviso Infonavit',
    'aviso_manutencion': 'Aviso de manutención', 'formato_rh': 'Formato de RH',
}
# valor -> 1 (cumplido), 0 (no entregado), None (pendiente / desconocido)
DOCUMENTO_VALOR = {'SI': 1, 'PLANTA': 1, 'POR PROYECTO': 1, 'NO APLICA': 1, 'NO': 0, 'PENDIENTE': None}
TIPO_CONTRATO = {'PLANTA': 'Planta', 'POR PROYECTO': 'Por proyecto'}

# --- Catálogo de causa de baja (M14): hoy no existe el dato; este es el dominio propuesto ---
CAUSA_BAJA = [
    ('CB01', 'Mejor oferta económica', 'Voluntaria'),
    ('CB02', 'Crecimiento profesional', 'Voluntaria'),
    ('CB03', 'Motivos personales o familiares', 'Voluntaria'),
    ('CB04', 'Cambio de residencia', 'Voluntaria'),
    ('CB05', 'Clima laboral o liderazgo', 'Voluntaria'),
    ('CB06', 'Fin de proyecto o contrato', 'Involuntaria'),
    ('CB07', 'Desempeño', 'Involuntaria'),
    ('CB08', 'Reestructura', 'Involuntaria'),
    ('CB09', 'Abandono de trabajo', 'Involuntaria'),
    ('CB10', 'Jubilación o fallecimiento', 'Otra'),
]
