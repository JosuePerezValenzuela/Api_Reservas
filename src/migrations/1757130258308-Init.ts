import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1757130258308 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(/* sql */ `
            /* ===== util: trigger genérico para updated_at (seguro de re-ejecución) ===== */
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

/* ===== ROLES ============================================================== */
DROP TABLE IF EXISTS roles CASCADE;
CREATE TABLE roles (
  id_role   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_name VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_role_name_nonblank CHECK (btrim(role_name) <> '')
);

/* Unicidad CI (evita duplicados por mayúsculas/minúsculas y espacios) */
DROP INDEX IF EXISTS uq_roles_name_ci;
CREATE UNIQUE INDEX uq_roles_name_ci ON roles (lower(btrim(role_name)));

/* Trigger de actualización de updated_at */
DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated
BEFORE INSERT OR UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* PEOPLE =====================================================*/
DROP TABLE IF EXISTS people CASCADE;
CREATE TABLE people (
  ci_person    VARCHAR(15) PRIMARY KEY,
  person_name  VARCHAR(50) NOT NULL,
  person_mail  VARCHAR(254) NOT NULL,
  person_phone VARCHAR(8),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Validaciones de contenido mínimas
  CONSTRAINT ck_people_ci_nonblank    CHECK (btrim(ci_person) <> ''),
  CONSTRAINT ck_people_name_nonblank  CHECK (btrim(person_name) <> ''),
  CONSTRAINT ck_people_mail_format    CHECK (person_mail ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  CONSTRAINT ck_people_phone_digits   CHECK (person_phone IS NULL OR person_phone ~ '^[0-9]{8}$')
);

-- Unicidad de email insensible a mayúsculas y espacios laterales
DROP INDEX IF EXISTS uq_people_mail_ci;
CREATE UNIQUE INDEX uq_people_mail_ci ON people (lower(btrim(person_mail)));

-- Actualiza updated_at en inserts/updates (reutiliza la función global)
DROP TRIGGER IF EXISTS trg_people_updated ON people;
CREATE TRIGGER trg_people_updated
BEFORE INSERT OR UPDATE ON people
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* PERSON_ROLES =====================================================*/
DROP TABLE IF EXISTS person_roles CASCADE;

CREATE TABLE person_roles (
  ci_person  VARCHAR(15) NOT NULL
    REFERENCES people(ci_person) ON DELETE CASCADE,
  id_role    INT NOT NULL
    REFERENCES roles(id_role) ON DELETE RESTRICT,
  id_faculty INT NULL,                                   -- NULL = global
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ci_person, id_role, id_faculty)
);

-- único rol GLOBAL por persona/rol
CREATE UNIQUE INDEX uq_person_global_role
  ON person_roles(ci_person, id_role)
  WHERE id_faculty IS NULL;

-- índices útiles
CREATE INDEX IF NOT EXISTS ix_pr_person_fac ON person_roles (ci_person, id_faculty);
CREATE INDEX IF NOT EXISTS ix_pr_fac_role   ON person_roles (id_faculty, id_role);
CREATE INDEX IF NOT EXISTS ix_pr_role       ON person_roles (id_role);

-- updated_at
DROP TRIGGER IF EXISTS trg_person_roles_updated ON person_roles;
CREATE TRIGGER trg_person_roles_updated
BEFORE INSERT OR UPDATE ON person_roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ AUTH_PEOPLE ================================== */
DROP TABLE IF EXISTS auth_people CASCADE;
CREATE TABLE auth_people (
  id_person            VARCHAR(15) PRIMARY KEY
                        REFERENCES people(ci_person) ON DELETE CASCADE,
  -- credencial de acceso
  email                VARCHAR(254) NOT NULL,
  password_hash        TEXT NOT NULL,
  password_algo        VARCHAR(20) NOT NULL DEFAULT 'argon2id'
                        CHECK (password_algo IN ('argon2id','bcrypt','scrypt')),
  -- estado de cuenta
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked            BOOLEAN NOT NULL DEFAULT FALSE,
  failed_attempts      SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  password_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- invariantes simples
  CONSTRAINT ck_auth_email_nonblank  CHECK (btrim(email) <> '')
);

-- Unicidad de email "case-insensitive" (evita duplicados Juan@ vs juan@)
DROP INDEX IF EXISTS uq_auth_email_ci;
CREATE UNIQUE INDEX uq_auth_email_ci ON auth_people (lower(btrim(email)));

-- Valida formato de email (regex razonable y portable en Postgres)
ALTER TABLE auth_people
  ADD CONSTRAINT ck_auth_email_format
  CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');

-- Trigger para normalizar email y refrescar updated_at
CREATE OR REPLACE FUNCTION auth_normalize_email_and_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auth_people_norm ON auth_people;
CREATE TRIGGER trg_auth_people_norm
BEFORE INSERT OR UPDATE OF email ON auth_people
FOR EACH ROW EXECUTE FUNCTION auth_normalize_email_and_touch();

-- Asegura updated_at también cuando cambian otros campos
DROP TRIGGER IF EXISTS trg_auth_people_touch ON auth_people;
CREATE TRIGGER trg_auth_people_touch
BEFORE UPDATE ON auth_people
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ AUTH_REFRESH_TOKENS =========================== */
DROP TABLE IF EXISTS auth_refresh_tokens CASCADE;
CREATE TABLE auth_refresh_tokens (
  id_token     BIGSERIAL PRIMARY KEY,
  ci_person    VARCHAR(15) NOT NULL
                 REFERENCES people(ci_person) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  user_agent   TEXT,
  ip           INET,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,

  -- rotación (opcional): apunta al nuevo token cuando rotas
  replaced_by  BIGINT
                 REFERENCES auth_refresh_tokens(id_token) ON DELETE SET NULL,
  -- auditoría
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- reglas temporales
  CONSTRAINT ck_art_expires CHECK (expires_at > issued_at),
  CONSTRAINT ck_art_revoked CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

-- Cada hash debe ser único (colisiones son extremadamente improbables)
DROP INDEX IF EXISTS uq_art_token_hash;
CREATE UNIQUE INDEX uq_art_token_hash ON auth_refresh_tokens(token_hash);

-- Búsquedas típicas
CREATE INDEX IF NOT EXISTS ix_art_person_expires ON auth_refresh_tokens (ci_person, expires_at);
CREATE INDEX IF NOT EXISTS ix_art_active_by_exp  ON auth_refresh_tokens (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_art_person_active  ON auth_refresh_tokens (ci_person)  WHERE revoked_at IS NULL;

-- updated_at on update
DROP TRIGGER IF EXISTS trg_auth_refresh_tokens_touch ON auth_refresh_tokens;
CREATE TRIGGER trg_auth_refresh_tokens_touch
BEFORE UPDATE ON auth_refresh_tokens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ AUTH_PASSWORD_RESETS ========================== */
DROP TABLE IF EXISTS auth_password_resets CASCADE;
CREATE TABLE auth_password_resets (
  id_reset            BIGSERIAL PRIMARY KEY,
  ci_person           VARCHAR(15) NOT NULL
                        REFERENCES people(ci_person) ON DELETE CASCADE,
  email_snapshot      VARCHAR(254) NOT NULL,
  token_hash          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,
  used_ip             INET,
  used_user_agent     TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- reglas
  CONSTRAINT ck_apr_email_nonblank   CHECK (btrim(email_snapshot) <> ''),
  CONSTRAINT ck_apr_email_format     CHECK (email_snapshot ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  CONSTRAINT ck_apr_expires          CHECK (expires_at > created_at),
  CONSTRAINT ck_apr_used_range       CHECK (used_at IS NULL OR (used_at >= created_at AND used_at <= expires_at))
);

DROP INDEX IF EXISTS uq_apr_token_hash;
CREATE UNIQUE INDEX uq_apr_token_hash ON auth_password_resets(token_hash);

-- 1 token "activo" (no usado) por persona a la vez (súper práctico)
DROP INDEX IF EXISTS uq_apr_one_active_per_person;
CREATE UNIQUE INDEX uq_apr_one_active_per_person
  ON auth_password_resets (ci_person)
  WHERE used_at IS NULL;

-- Búsquedas limpias / cron de limpieza
CREATE INDEX IF NOT EXISTS ix_apr_person   ON auth_password_resets (ci_person);
CREATE INDEX IF NOT EXISTS ix_apr_expires  ON auth_password_resets (expires_at);
CREATE INDEX IF NOT EXISTS ix_apr_active   ON auth_password_resets (expires_at)
  WHERE used_at IS NULL;

-- Normaliza email_snapshot y toca updated_at
CREATE OR REPLACE FUNCTION apr_normalize_email_and_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email_snapshot := lower(btrim(NEW.email_snapshot));
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apr_norm ON auth_password_resets;
CREATE TRIGGER trg_apr_norm
BEFORE INSERT OR UPDATE OF email_snapshot ON auth_password_resets
FOR EACH ROW EXECUTE FUNCTION apr_normalize_email_and_touch();

-- Tocar updated_at en cualquier update
DROP TRIGGER IF EXISTS trg_apr_touch ON auth_password_resets;
CREATE TRIGGER trg_apr_touch
BEFORE UPDATE ON auth_password_resets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Evita "re-usar" un token ya consumido (protección adicional)
CREATE OR REPLACE FUNCTION apr_lock_used_once()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'Este token ya fue utilizado el %; no puede modificarse.', OLD.used_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apr_lock_used_once ON auth_password_resets;
CREATE TRIGGER trg_apr_lock_used_once
BEFORE UPDATE OF used_at ON auth_password_resets
FOR EACH ROW EXECUTE FUNCTION apr_lock_used_once();

/* ============ FACULTIES ==================================== */
DROP TABLE IF EXISTS faculties CASCADE;
CREATE TABLE faculties (
  id_faculty   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  faculty_name VARCHAR(50) NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_faculty_name_nonblank CHECK (btrim(faculty_name) <> '')
);

/* Unicidad case-insensitive por nombre (evita “FCyT” vs “fcyt”) */
DROP INDEX IF EXISTS uq_faculty_name_ci;
CREATE UNIQUE INDEX uq_faculty_name_ci ON faculties (lower(btrim(faculty_name)));

/* Opcional: consultas rápidas de activas */
CREATE INDEX IF NOT EXISTS ix_faculties_active ON faculties (active);

/* Touch updated_at en inserts/updates (usa la función global) */
DROP TRIGGER IF EXISTS trg_faculties_updated ON faculties;
CREATE TRIGGER trg_faculties_updated
BEFORE INSERT OR UPDATE ON faculties
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ FK en PERSON_ROLES -> FACULTIES ============== */
/* Quita la vieja si existiera y crea la FK (id_faculty puede ser NULL = rol global) */
ALTER TABLE person_roles
  DROP CONSTRAINT IF EXISTS fk_person_roles_faculty;

ALTER TABLE person_roles
  ADD CONSTRAINT fk_person_roles_faculty
  FOREIGN KEY (id_faculty)
  REFERENCES faculties(id_faculty)
  ON DELETE CASCADE;   -- si se elimina una facultad, se borran sus roles por-facultad

/* ============ BLOCKS (por facultad) ======================== */
DROP TABLE IF EXISTS blocks CASCADE;
CREATE TABLE blocks (
  id_block    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_faculty  INT NOT NULL
    REFERENCES faculties(id_faculty) ON DELETE CASCADE,
  block_name  VARCHAR(30) NOT NULL,
  block_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_block_name_nonblank CHECK (btrim(block_name) <> '')
);

-- Unicidad por facultad (case-insensitive, ignora espacios laterales)
DROP INDEX IF EXISTS uq_block_per_fac_ci;
CREATE UNIQUE INDEX uq_block_per_fac_ci
  ON blocks (id_faculty, lower(btrim(block_name)));

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_blocks_fac         ON blocks (id_faculty);
CREATE INDEX IF NOT EXISTS ix_blocks_fac_active  ON blocks (id_faculty)
  WHERE block_active = TRUE;

-- Mantener updated_at
DROP TRIGGER IF EXISTS trg_blocks_updated ON blocks;
CREATE TRIGGER trg_blocks_updated
BEFORE INSERT OR UPDATE ON blocks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ AMBIENT_TYPES ================================= */
DROP TABLE IF EXISTS ambient_types CASCADE;
CREATE TABLE ambient_types (
  id_ambient_type INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name_ambient_type VARCHAR(30) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_at_name_nonblank CHECK (btrim(name_ambient_type) <> '')
);

-- Unicidad case-insensitive
DROP INDEX IF EXISTS uq_at_name_ci;
CREATE UNIQUE INDEX uq_at_name_ci
  ON ambient_types (lower(btrim(name_ambient_type)));

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_at_updated ON ambient_types;
CREATE TRIGGER trg_at_updated
BEFORE INSERT OR UPDATE ON ambient_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ AMBIENTS ====================================== */
DROP TABLE IF EXISTS ambients CASCADE;
CREATE TABLE ambients (
  id_ambient       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_block         INT NOT NULL
    REFERENCES blocks(id_block) ON DELETE CASCADE,
  id_ambient_type  INT NOT NULL
    REFERENCES ambient_types(id_ambient_type) ON DELETE RESTRICT, -- no borrar tipo en uso
  ambient_name     VARCHAR(30) NOT NULL,
  capacity         INT2 NOT NULL,
  level            INT2 NOT NULL,
  ambient_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_amb_name_nonblank CHECK (btrim(ambient_name) <> ''),
  CONSTRAINT ck_amb_capacity     CHECK (capacity BETWEEN 1 AND 32767)
);

-- Unicidad por bloque (case-insensitive)
DROP INDEX IF EXISTS uq_ambient_in_block_ci;
CREATE UNIQUE INDEX uq_ambient_in_block_ci
  ON ambients (id_block, lower(btrim(ambient_name)));

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_amb_block         ON ambients (id_block);
CREATE INDEX IF NOT EXISTS ix_amb_type          ON ambients (id_ambient_type);
CREATE INDEX IF NOT EXISTS ix_amb_block_active  ON ambients (id_block) WHERE ambient_active = TRUE;

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_ambients_updated ON ambients;
CREATE TRIGGER trg_ambients_updated
BEFORE INSERT OR UPDATE ON ambients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ SUBJECTS ===================================== */
DROP TABLE IF EXISTS subjects CASCADE;

CREATE TABLE subjects (
  id_subjects   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_name  VARCHAR(50) NOT NULL,
  subject_code  VARCHAR(20),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_subject_name_nonblank CHECK (btrim(subject_name) <> '')
);

DROP INDEX IF EXISTS uq_subject_code_ci;
CREATE UNIQUE INDEX uq_subject_code_ci
  ON subjects (lower(btrim(subject_code)))
  WHERE subject_code IS NOT NULL;

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_subjects_active ON subjects (active);

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_subjects_updated ON subjects;
CREATE TRIGGER trg_subjects_updated
BEFORE INSERT OR UPDATE ON subjects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ CAREERS (por facultad) ======================= */
DROP TABLE IF EXISTS careers CASCADE;
CREATE TABLE careers (
  id_career   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_faculty  INT NOT NULL
    REFERENCES faculties(id_faculty) ON DELETE CASCADE,
  career_name VARCHAR(50) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_career_name_nonblank CHECK (btrim(career_name) <> '')
);

-- Unicidad por facultad (case-insensitive, ignora espacios)
DROP INDEX IF EXISTS uq_career_per_fac_ci;
CREATE UNIQUE INDEX uq_career_per_fac_ci
  ON careers (id_faculty, lower(btrim(career_name)));

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_careers_fac        ON careers (id_faculty);
CREATE INDEX IF NOT EXISTS ix_careers_fac_active ON careers (id_faculty) WHERE active = TRUE;

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_careers_updated ON careers;
CREATE TRIGGER trg_careers_updated
BEFORE INSERT OR UPDATE ON careers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ SUBJECT_CAREERS (subjects ↔ careers) ========= */
DROP TABLE IF EXISTS subject_careers CASCADE;
CREATE TABLE subject_careers (
  id_subjects INT NOT NULL
    REFERENCES subjects(id_subjects) ON DELETE CASCADE,
  id_career   INT NOT NULL
    REFERENCES careers(id_career)   ON DELETE CASCADE,
  PRIMARY KEY (id_subjects, id_career),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índice inverso para consultas por carrera → materias
CREATE INDEX IF NOT EXISTS ix_sc_career ON subject_careers (id_career);

/* ============ GROUPS (por materia) ========================= */
DROP TABLE IF EXISTS groups CASCADE;
CREATE TABLE groups (
  id_group     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_subjects  INT NOT NULL
    REFERENCES subjects(id_subjects) ON DELETE RESTRICT,  -- no borrar materia si tiene grupos
  group_name   VARCHAR(15) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_group_name_nonblank CHECK (btrim(group_name) <> '')
);

-- Unicidad por materia (case-insensitive, ignora espacios)
DROP INDEX IF EXISTS uq_group_per_subject_ci;
CREATE UNIQUE INDEX uq_group_per_subject_ci
  ON groups (id_subjects, lower(btrim(group_name)));

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_groups_subject ON groups (id_subjects);

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_groups_updated ON groups;
CREATE TRIGGER trg_groups_updated
BEFORE INSERT OR UPDATE ON groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ TIME_MODELS ================================== */
DROP TABLE IF EXISTS time_models CASCADE;
CREATE TABLE time_models (
  id_time_model  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           VARCHAR(80) NOT NULL,   -- ej: 'UMSS-45m-06:45', 'UMSS-60m-07:00'
  description    TEXT,
  slot_minutes   INT  NOT NULL CHECK (slot_minutes > 0),
  day_start      TIME NOT NULL,          -- hora de inicio del primer slot
  slots_per_day  INT  NOT NULL CHECK (slots_per_day > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_tm_name_nonblank CHECK (btrim(name) <> '')
);

DROP INDEX IF EXISTS uq_time_models_name_ci;
CREATE UNIQUE INDEX uq_time_models_name_ci
  ON time_models (lower(btrim(name)));

DROP TRIGGER IF EXISTS trg_time_models_updated ON time_models;
CREATE TRIGGER trg_time_models_updated
BEFORE INSERT OR UPDATE ON time_models
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ TIME_SLOTS =================================== */
DROP TABLE IF EXISTS time_slots CASCADE;
CREATE TABLE time_slots (
  id_time_model  INT  NOT NULL REFERENCES time_models(id_time_model) ON DELETE CASCADE,
  id_slot        INT2 NOT NULL,  -- ordinal dentro del modelo (1..slots_per_day)
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_time_model, id_slot),
  CONSTRAINT ck_ts_range CHECK (end_time > start_time)
);

DROP TRIGGER IF EXISTS trg_time_slots_updated ON time_slots;
CREATE TRIGGER trg_time_slots_updated
BEFORE INSERT OR UPDATE ON time_slots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ ACADEMIC_PERIODS ============================= */
DROP TABLE IF EXISTS academic_periods CASCADE;
CREATE TABLE academic_periods (
  id_academic_period INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_faculty   INT  NOT NULL REFERENCES faculties(id_faculty) ON DELETE CASCADE,
  id_time_model INT NOT NULL REFERENCES time_models(id_time_model),
  season       SMALLINT NOT NULL,        -- 1,2,3,4
  year         SMALLINT NOT NULL,        -- año calendario (ej. 2025)
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'PLANNED'
                 CHECK (status IN ('PLANNED','ACTIVE','CLOSED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ap_dates    CHECK (start_date <= end_date),
  CONSTRAINT ck_ap_season   CHECK (season BETWEEN 1 AND 4)
);

-- Unicidad por facultad/año/temporada
DROP INDEX IF EXISTS uq_ap_fac_year_season;
CREATE UNIQUE INDEX uq_ap_fac_year_season
  ON academic_periods (id_faculty, year, season);

-- Asegurar a lo sumo 1 período ACTIVO por facultad
DROP INDEX IF EXISTS uq_one_active_period_per_fac;
CREATE UNIQUE INDEX uq_one_active_period_per_fac
  ON academic_periods (id_faculty) WHERE status = 'ACTIVE';

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_ap_fac         ON academic_periods (id_faculty);
CREATE INDEX IF NOT EXISTS ix_ap_model       ON academic_periods (id_time_model);
CREATE INDEX IF NOT EXISTS ix_ap_range       ON academic_periods (start_date, end_date);

DROP TRIGGER IF EXISTS trg_academic_periods_updated ON academic_periods;
CREATE TRIGGER trg_academic_periods_updated
BEFORE INSERT OR UPDATE ON academic_periods
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ TEACHER_ASSIGNMENTS ========================== */
DROP TABLE IF EXISTS teacher_assignments CASCADE;
CREATE TABLE teacher_assignments (
  id_academic_period INT NOT NULL
    REFERENCES academic_periods(id_academic_period) ON DELETE CASCADE,
  id_group           INT NOT NULL
    REFERENCES groups(id_group) ON DELETE CASCADE,
  ci_person          VARCHAR(15) NOT NULL
    REFERENCES people(ci_person) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Regla clave: 1 docente por grupo en el período
  PRIMARY KEY (id_academic_period, id_group)
);

-- Índices útiles (portal docente / reportes)
CREATE INDEX IF NOT EXISTS ix_ta_teacher_period ON teacher_assignments (ci_person, id_academic_period);
CREATE INDEX IF NOT EXISTS ix_ta_group          ON teacher_assignments (id_group);
CREATE INDEX IF NOT EXISTS ix_ta_period         ON teacher_assignments (id_academic_period);

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_ta_updated ON teacher_assignments;
CREATE TRIGGER trg_ta_updated
BEFORE INSERT OR UPDATE ON teacher_assignments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ WEEKLY_OFFICIAL_SCHEDULE ===================== */
DROP TABLE IF EXISTS weekly_official_schedule CASCADE;
CREATE TABLE weekly_official_schedule (
  id_weekly          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_academic_period INT  NOT NULL
    REFERENCES academic_periods(id_academic_period) ON DELETE CASCADE,
  id_ambient         INT  NOT NULL
    REFERENCES ambients(id_ambient) ON DELETE RESTRICT,
  day_of_week        INT2 NOT NULL,  -- 1=Lun ... 6=Sáb
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_wos_dow CHECK (day_of_week BETWEEN 1 AND 6)
);

-- Un encabezado por (período, ambiente, día)
DROP INDEX IF EXISTS uq_wos_period_ambient_day;
CREATE UNIQUE INDEX uq_wos_period_ambient_day
  ON weekly_official_schedule (id_academic_period, id_ambient, day_of_week);

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_wos_period_day ON weekly_official_schedule (id_academic_period, day_of_week);
CREATE INDEX IF NOT EXISTS ix_wos_ambient    ON weekly_official_schedule (id_ambient);

-- touch updated_at
DROP TRIGGER IF EXISTS trg_wos_updated ON weekly_official_schedule;
CREATE TRIGGER trg_wos_updated
BEFORE INSERT OR UPDATE ON weekly_official_schedule
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ WEEKLY_SLOTS ================================= */
DROP TABLE IF EXISTS weekly_slots CASCADE;
CREATE TABLE weekly_slots (
  id_weekly     INT  NOT NULL
    REFERENCES weekly_official_schedule(id_weekly) ON DELETE CASCADE,
  id_time_model INT  NOT NULL, -- debe coincidir con el del período
  id_slot       INT2 NOT NULL,
  id_group      INT  NOT NULL REFERENCES groups(id_group) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id_weekly, id_slot),

  -- Slot válido del modelo horario
  CONSTRAINT fk_ws_timeslot
    FOREIGN KEY (id_time_model, id_slot)
    REFERENCES time_slots(id_time_model, id_slot)
);

CREATE INDEX IF NOT EXISTS ix_ws_weekly_slot ON weekly_slots (id_weekly, id_slot);
CREATE INDEX IF NOT EXISTS ix_ws_group       ON weekly_slots (id_group);

DROP TRIGGER IF EXISTS trg_ws_updated ON weekly_slots;
CREATE TRIGGER trg_ws_updated
BEFORE INSERT OR UPDATE ON weekly_slots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION tg_ws_check_period_time_model()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period_model INT;
BEGIN
  SELECT ap.id_time_model INTO v_period_model
  FROM weekly_official_schedule w
  JOIN academic_periods ap ON ap.id_academic_period = w.id_academic_period
  WHERE w.id_weekly = NEW.id_weekly;

  IF v_period_model IS NULL THEN
    RAISE EXCEPTION 'No se encontró período para id_weekly=%', NEW.id_weekly;
  END IF;

  IF NEW.id_time_model <> v_period_model THEN
    RAISE EXCEPTION
      'weekly_slots.id_time_model(%) no coincide con el del período(%) para id_weekly=%',
      NEW.id_time_model, v_period_model, NEW.id_weekly;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ws_check_period_time_model ON weekly_slots;
CREATE TRIGGER trg_ws_check_period_time_model
BEFORE INSERT OR UPDATE OF id_weekly, id_time_model ON weekly_slots
FOR EACH ROW EXECUTE FUNCTION tg_ws_check_period_time_model();

/* ============ RESERVATIONS ================================= */
DROP TABLE IF EXISTS reservations CASCADE;
CREATE TABLE reservations (
  id_reservation     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_academic_period INT  NOT NULL
    REFERENCES academic_periods(id_academic_period) ON DELETE CASCADE,
  ci_person          VARCHAR(15) NOT NULL
    REFERENCES people(ci_person) ON DELETE RESTRICT,
  status             VARCHAR(12)  NOT NULL DEFAULT 'CONFIRMADO'
                      CHECK (status IN ('CONFIRMADO','CANCELADO')),
  reason             TEXT NOT NULL,        -- motivo de la reserva (requerido)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at       TIMESTAMPTZ
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_res_period   ON reservations(id_academic_period);
CREATE INDEX IF NOT EXISTS ix_res_person   ON reservations(ci_person);
CREATE INDEX IF NOT EXISTS ix_res_status   ON reservations(status);

-- Touch updated_at
DROP TRIGGER IF EXISTS trg_reservations_touch ON reservations;
CREATE TRIGGER trg_reservations_touch
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE reservations
  ADD CONSTRAINT uq_reservation_period
  UNIQUE (id_reservation, id_academic_period);

/* ============ RESERVATIONS_GROUPS ========================== */
DROP TABLE IF EXISTS reservations_groups CASCADE;
CREATE TABLE reservations_groups (
  id_reservation     INT NOT NULL,
  id_academic_period INT NOT NULL,
  id_group           INT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_reservation, id_group),

  /* 1) Coherencia con el período de la reserva */
  FOREIGN KEY (id_reservation, id_academic_period)
    REFERENCES reservations(id_reservation, id_academic_period) ON DELETE CASCADE,

  /* 2) El grupo debe existir en ese período (docente↔grupo↔período) */
  FOREIGN KEY (id_academic_period, id_group)
    REFERENCES teacher_assignments(id_academic_period, id_group) ON DELETE CASCADE,

  /* 3) Seguridad por si borran el grupo */
  FOREIGN KEY (id_group)
    REFERENCES groups(id_group) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_rg_period   ON reservations_groups (id_academic_period);
CREATE INDEX IF NOT EXISTS ix_rg_group    ON reservations_groups (id_group);
CREATE INDEX IF NOT EXISTS ix_rg_res      ON reservations_groups (id_reservation);

/* ============ RESERVED_DATES ================================ */
DROP TABLE IF EXISTS reserved_dates CASCADE;
CREATE TABLE reserved_dates (
  id_reservation  INT  NOT NULL
    REFERENCES reservations(id_reservation) ON DELETE CASCADE,
  reserved_date   DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_reservation, reserved_date)
);

-- búsquedas por fecha / limpieza
CREATE INDEX IF NOT EXISTS ix_rd_date ON reserved_dates (reserved_date);

-- touch updated_at
DROP TRIGGER IF EXISTS trg_rd_touch ON reserved_dates;
CREATE TRIGGER trg_rd_touch
BEFORE UPDATE ON reserved_dates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ RESERVATION_AMBIENTS ========================= */
DROP TABLE IF EXISTS reservation_ambients CASCADE;
CREATE TABLE reservation_ambients (
  id_reservation INT NOT NULL,
  id_ambient     INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_reservation, id_ambient),
  FOREIGN KEY (id_reservation)
    REFERENCES reservations(id_reservation) ON DELETE CASCADE,
  FOREIGN KEY (id_ambient)
    REFERENCES ambients(id_ambient) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_ra_ambient ON reservation_ambients (id_ambient);

-- touch updated_at
DROP TRIGGER IF EXISTS trg_ra_touch ON reservation_ambients;
CREATE TRIGGER trg_ra_touch
BEFORE UPDATE ON reservation_ambients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ============ RESERVATIONS_SLOTS =========================== */
DROP TABLE IF EXISTS reservations_slots CASCADE;
CREATE TABLE reservations_slots (
  id_reservation INT  NOT NULL,
  id_ambient     INT  NOT NULL,
  reserved_date  DATE NOT NULL,
  id_time_model  INT  NOT NULL,
  id_slot        INT2 NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- PK natural para la reserva
  PRIMARY KEY (id_reservation, id_ambient, reserved_date, id_slot),

  -- 1) El slot debe existir en el modelo horario
  FOREIGN KEY (id_time_model, id_slot)
    REFERENCES time_slots(id_time_model, id_slot),

  -- 2) Debe existir la fecha para la reserva (y ya está validada vs período)
  FOREIGN KEY (id_reservation, reserved_date)
    REFERENCES reserved_dates(id_reservation, reserved_date) ON DELETE CASCADE,

  -- 3) El ambiente debe pertenecer a la reserva
  FOREIGN KEY (id_reservation, id_ambient)
    REFERENCES reservation_ambients(id_reservation, id_ambient) ON DELETE CASCADE,

  -- 4) Anti–doble booking (mismo ambiente, misma fecha y mismo slot)
  CONSTRAINT uq_no_double_booking
    UNIQUE (id_ambient, reserved_date, id_time_model, id_slot)
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS ix_rs_by_reservation ON reservations_slots (id_reservation);
CREATE INDEX IF NOT EXISTS ix_rs_by_date_amb    ON reservations_slots (reserved_date, id_ambient);

-- updated_at
DROP TRIGGER IF EXISTS trg_rs_touch ON reservations_slots;
CREATE TRIGGER trg_rs_touch
BEFORE UPDATE ON reservations_slots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {}
}
