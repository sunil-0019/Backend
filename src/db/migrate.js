import { db } from '../config/db.js';

export async function runMigrations() {
  console.log('Running database migrations...');
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS citext;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             citext NOT NULL UNIQUE,
      email               citext NOT NULL UNIQUE,
      name                text   NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
      about               text   NOT NULL DEFAULT 'Hey there, using ChatLeaf' CHECK (char_length(about) <= 139),
      photo_key           text   NULL,
      password_hash       text   NOT NULL,
      password_changed_at timestamptz NOT NULL DEFAULT now(),
      status              text   NOT NULL DEFAULT 'ACTIVE',
      token_version       int    NOT NULL DEFAULT 0,
      user_id_changed_at  timestamptz NULL,
      user_id_change_count int   NOT NULL DEFAULT 0,
      failed_login_count  int    NOT NULL DEFAULT 0,
      locked_until        timestamptz NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      first_login_at      timestamptz NULL,
      last_login_at       timestamptz NULL,
      CONSTRAINT user_id_format CHECK (char_length(user_id::text) BETWEEN 8 AND 100 AND user_id::text ~ '^[a-z][a-z0-9_]*$')
    );
    CREATE INDEX IF NOT EXISTS users_user_id_trgm ON users USING gin ((user_id::text) gin_trgm_ops);

    CREATE OR REPLACE FUNCTION forbid_email_update() RETURNS trigger AS $$ BEGIN
      IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'EMAIL_IMMUTABLE'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS users_email_immutable ON users;
    CREATE TRIGGER users_email_immutable BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION forbid_email_update();

    CREATE TABLE IF NOT EXISTS user_id_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_uuid uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      old_user_id citext NOT NULL, new_user_id citext NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT now(), reserved_until timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_id_history_old_user_id ON user_id_history (old_user_id);

    -- Clean up legacy OTP tables (all OTPs and limits are 100% managed in Redis with auto-TTL)
    DROP TABLE IF EXISTS email_otps CASCADE;
    DROP TABLE IF EXISTS otp_limits CASCADE;

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_uuid uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id text, device_name text, model text, platform text, app_version text,
      ip inet, geo_city text, geo_country text, user_agent text,
      refresh_hash bytea NOT NULL, prev_refresh_hash bytea,
      created_at timestamptz NOT NULL DEFAULT now(), last_active_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id bigserial PRIMARY KEY, user_uuid uuid REFERENCES users(id) ON DELETE CASCADE, email citext,
      session_id uuid, kind text NOT NULL,
      success bool NOT NULL, reason text, ip inet, geo_city text, geo_country text,
      device_name text, platform text, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_login_events_user_uuid ON login_events (user_uuid, created_at DESC);

    CREATE TABLE IF NOT EXISTS email_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), to_email citext NOT NULL, template text NOT NULL,
      payload jsonb NOT NULL, status text NOT NULL DEFAULT 'QUEUED',
      attempts int NOT NULL DEFAULT 0, provider_message_id text, error text,
      created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz NULL
    );
  `;

  await db.query(ddl);
  console.log('Database migrations completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await db.close();
      process.exit(1);
    });
}
