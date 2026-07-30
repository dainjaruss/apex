// tests/integration/profilesRlsLockdown.test.ts
//
// The real proof for migration 009. Applies the actual 001..009 chain to a
// throwaway postgres:17 container and asserts the three properties the migration
// exists to guarantee, as the `authenticated` role:
//
//   1. escalating preferred_role / assigned_roles -> 42501
//   2. select from public.profiles                -> own row only
//   3. select from public.profiles_directory      -> all rows, 4 columns, no PII
//
// This replaces nine regex-the-migration-file assertions that a previous
// revision used. Those passed on eight different broken migrations — including
// one that simply appended `grant update on public.profiles to authenticated;`,
// re-opening the exact P0 the file exists to close — while failing on the
// equivalent-but-differently-spelled `REVOKE UPDATE ON TABLE ...`. Asserting
// privilege state instead of source text closes all of that at once.
//
// SKIPS CLEANLY when Docker is unavailable (CI without a daemon, sandboxes):
// the suite reports as skipped, never failed. `npm run verify` therefore stays
// green either way — but then this proof has NOT run, and the migration is
// covered only by the behavioural tests in tests/unit/profileRoleLockdown.test.ts.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";

// Unique per run. vitest runs files in worker THREADS, so process.pid alone is
// not unique across a full-suite run, and a crashed earlier run can leave a
// container squatting the name — both surfaced as an intermittent beforeAll
// failure in `npm run verify` while the file passed in isolation.
const CONTAINER = `apex-rls-test-${process.pid}-${Date.now().toString(36)}`;
const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");

const hasDocker = (() => {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
})();

if (!hasDocker) {
  console.warn(
    "[profilesRlsLockdown] Docker unavailable — migration 009 privilege checks SKIPPED, not passed.",
  );
}

// Supabase-shaped environment: the roles, the auth schema, and the storage stubs
// the real migrations reference. auth.uid() reads a GUC so a test can "become" a
// given user. Inlined rather than a fixture file — it is only used here.
const BOOTSTRAP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid as $f$
  select nullif(current_setting('apex.test_uid', true), '')::uuid;
$f$ language sql stable;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, metadata jsonb);
create function storage.foldername(name text) returns text[] as $f$
  select string_to_array(name, '/');
$f$ language sql immutable;

create extension if not exists "uuid-ossp";
`;

const SEED = `
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','sailor@x',
  '{"first_name":"John","last_name":"Doe","dod_id":"1234567890","preferred_role":"Admin"}'),
 ('22222222-2222-2222-2222-222222222222','co@x',
  '{"first_name":"Alan","last_name":"Senior","dod_id":"0987654321"}');
update public.profiles set preferred_role='Reporting Senior'
 where id='22222222-2222-2222-2222-222222222222';
`;

const SAILOR = "11111111-1111-1111-1111-111111111111";

function docker(args: string[], input?: string) {
  return execFileSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 120_000,
  });
}

/**
 * Run SQL as `authenticated`, impersonating `uid`. Returns stdout on success, or
 * stdout+stderr on failure. ON_ERROR_STOP is what makes psql exit non-zero on a
 * SQL error — without it psql returns 0 and the error text goes to stderr
 * unnoticed, which silently turns every "expect permission denied" assertion
 * into a comparison against empty output.
 */
function asAuthenticated(uid: string, sql: string): string {
  const wrapped = `set apex.test_uid = '${uid}'; set role authenticated; ${sql}`;
  try {
    return docker(
      [
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-tA",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "apex",
      ],
      wrapped,
    );
  } catch (err: any) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}

describe.skipIf(!hasDocker)("migration 009 — profiles privilege state", () => {
  beforeAll(() => {
    // Clear a squatter from a previous crashed run before claiming the name.
    try {
      docker(["rm", "-f", CONTAINER]);
    } catch {
      /* nothing to remove */
    }
    try {
      docker([
        "run",
        "--rm",
        "-d",
        "--name",
        CONTAINER,
        "-e",
        "POSTGRES_PASSWORD=probe",
        "postgres:17-alpine",
      ]);
    } catch (err: any) {
      throw new Error(
        `docker run failed: ${err.stdout ?? ""}${err.stderr ?? err.message}`,
      );
    }

    // Wait for readiness by retrying the first real piece of work, rather than
    // probing and then assuming. Generous, because this competes with the rest
    // of the suite for CPU during `npm run verify`.
    //
    // No cheap probe is trustworthy here: the postgres entrypoint runs a
    // TEMPORARY local server on the same PGDATA and unix socket to finish
    // initdb, so both `pg_isready` and a plain `select 1` answer successfully on
    // it — then the entrypoint stops that server and starts the real one.
    // Winning either probe and moving straight to `create database` races that
    // restart, failing as "the database system is starting up" or, once the
    // socket is briefly gone, "No such file or directory". This suite's
    // long-standing flake; it surfaces whenever another suite is heavy enough to
    // slow the container down. Retrying the create until it sticks is immune to
    // both, and the database persists either way — same PGDATA.
    let created = false;
    let lastErr = "";
    for (let i = 0; i < 120 && !created; i++) {
      try {
        docker([
          "exec",
          CONTAINER,
          "psql",
          "-U",
          "postgres",
          "-c",
          "create database apex",
        ]);
        created = true;
      } catch (err: any) {
        lastErr = `${err.stdout ?? ""}${err.stderr ?? err.message}`;
        execFileSync("sleep", ["1"]);
      }
    }
    if (!created)
      throw new Error(`postgres container never became ready: ${lastErr}`);
    docker(["cp", MIGRATIONS, `${CONTAINER}:/migrations`]);

    const psql = (extra: string[], input?: string) =>
      docker(
        [
          "exec",
          "-i",
          CONTAINER,
          "psql",
          "-q",
          "-U",
          "postgres",
          "-d",
          "apex",
          "-v",
          "ON_ERROR_STOP=1",
          ...extra,
        ],
        input,
      );

    psql([], BOOTSTRAP);
    // Every migration must apply cleanly; ON_ERROR_STOP makes a failure throw.
    for (const f of [
      "001_initial_schema",
      "002_routing_workflow",
      "003_form_types",
      "004_board_confidence",
      "005_board_docs_storage",
      "006_brag_sheet",
      "007_board_rubric_config",
      "008_summary_group_report_type_parity",
      "009_profile_role_and_pii_lockdown",
      "009_profile_role_and_pii_lockdown", // twice: 009 must be idempotent
      "010_chiefeval_trait_correction",
      "011_fitrep_trait_correction",
      "011_fitrep_trait_correction", // twice: 011 must be idempotent
    ]) {
      psql(["-f", `/migrations/${f}.sql`]);
    }
    psql([], SEED);
  }, 180_000);

  afterAll(() => {
    try {
      docker(["rm", "-f", CONTAINER]);
    } catch {
      /* container already gone */
    }
  });

  describe("1. roles cannot be self-assigned", () => {
    it("denies escalating your own preferred_role", () => {
      const out = asAuthenticated(
        SAILOR,
        `update public.profiles set preferred_role='Reporting Senior' where id=auth.uid();`,
      );
      expect(out).toMatch(/permission denied/i);
      // and the value really did not move
      expect(
        asAuthenticated(SAILOR, `select preferred_role from public.profiles;`),
      ).toContain("Sailor");
    });

    it("denies granting yourself assigned_roles", () => {
      const out = asAuthenticated(
        SAILOR,
        `update public.profiles set assigned_roles=array['GroupManager'] where id=auth.uid();`,
      );
      expect(out).toMatch(/permission denied/i);
    });

    it("denies a mixed payload that also touches a safe column", () => {
      const out = asAuthenticated(
        SAILOR,
        `update public.profiles set navy_rank='CPO', preferred_role='Admin' where id=auth.uid();`,
      );
      expect(out).toMatch(/permission denied/i);
    });

    it("still allows the columns the profile page actually writes", () => {
      const out = asAuthenticated(
        SAILOR,
        `update public.profiles set navy_rank='PO1', command='USS NEVERSAIL' where id=auth.uid();
         select navy_rank || '/' || command from public.profiles where id=auth.uid();`,
      );
      expect(out.trim()).toBe("PO1/USS NEVERSAIL");
    });

    it("ignores a client-supplied role at signup", () => {
      // The seeded sailor's raw_user_meta_data claims preferred_role=Admin.
      expect(
        asAuthenticated(
          SAILOR,
          `select preferred_role from public.profiles;`,
        ).trim(),
      ).toBe("Sailor");
    });
  });

  describe("2. profile reads are own-row", () => {
    it("returns only the caller's row from the base table", () => {
      expect(
        asAuthenticated(SAILOR, `select count(*) from public.profiles;`).trim(),
      ).toBe("1");
    });

    it("does not leak another user's DoD ID", () => {
      const out = asAuthenticated(
        SAILOR,
        `select dod_id from public.profiles;`,
      );
      expect(out).toContain("1234567890"); // own
      expect(out).not.toContain("0987654321"); // the CO's
    });
  });

  describe("3. profiles_directory is a narrow, read-only roster", () => {
    it("shows every user", () => {
      expect(
        asAuthenticated(
          SAILOR,
          `select count(*) from public.profiles_directory;`,
        ).trim(),
      ).toBe("2");
    });

    it("exposes exactly four columns", () => {
      const cols = asAuthenticated(
        SAILOR,
        `select string_agg(column_name, ',' order by ordinal_position)
           from information_schema.columns
          where table_schema='public' and table_name='profiles_directory';`,
      ).trim();
      expect(cols).toBe("id,first_name,last_name,preferred_role");
    });

    it("carries no PII column", () => {
      for (const col of ["dod_id", "email", "uic", "command"]) {
        expect(
          asAuthenticated(
            SAILOR,
            `select ${col} from public.profiles_directory;`,
          ),
        ).toMatch(/does not exist/i);
      }
    });

    it("is the ONLY view exposing profile PII to authenticated", () => {
      // Asserting only about profiles_directory left the barn door open: adding
      // a second, wide-open view (`create view profiles_full as select * from
      // profiles`) re-leaks every DoD ID and passes every other test here.
      // Restricted to views/matviews on purpose — a base table that happens to
      // own a dod_id column (public.evaluations does) is not a profiles leak.
      const leaking = docker([
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-tA",
        "-U",
        "postgres",
        "-d",
        "apex",
        "-c",
        `select c.relname || '.' || a.attname
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid
                and not a.attisdropped and a.attnum > 0
          where n.nspname = 'public'
            and c.relkind in ('v','m')
            and a.attname in ('dod_id','email','uic','command','assigned_roles')
            and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT');`,
      ]).trim();
      expect(leaking).toBe("");
    });

    it("cannot be written through, even if someone re-grants ALL on it", () => {
      // The realistic regression: editing the column list forces DROP + CREATE
      // (Postgres refuses to drop a column via CREATE OR REPLACE VIEW), and
      // Supabase's `alter default privileges` re-grants ALL on the new view.
      // `offset 0` keeps it non-auto-updatable regardless.
      docker([
        "exec",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        "apex",
        "-c",
        "grant all on public.profiles_directory to authenticated",
      ]);
      const out = asAuthenticated(
        SAILOR,
        `update public.profiles_directory set preferred_role='Admin'
          where id='22222222-2222-2222-2222-222222222222';`,
      );
      expect(out).toMatch(/cannot update view/i);

      docker([
        "exec",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        "apex",
        "-c",
        "revoke all on public.profiles_directory from authenticated; grant select on public.profiles_directory to authenticated",
      ]);
    });
  });

  describe("4. hardening", () => {
    it("leaves anon with no privileges on profiles", () => {
      const out = docker([
        "exec",
        CONTAINER,
        "psql",
        "-tA",
        "-U",
        "postgres",
        "-d",
        "apex",
        "-c",
        `select count(*) from information_schema.role_table_grants
          where grantee='anon' and table_name='profiles';`,
      ]).trim();
      expect(out).toBe("0");
    });

    it("pins search_path on every SECURITY DEFINER function", () => {
      const out = docker([
        "exec",
        CONTAINER,
        "psql",
        "-tA",
        "-U",
        "postgres",
        "-d",
        "apex",
        "-c",
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.prosecdef
            and (p.proconfig is null
                 or not exists (select 1 from unnest(p.proconfig) c
                                 where c like 'search_path=%'));`,
      ]).trim();
      expect(out).toBe(""); // no definer function left with a mutable search_path
    });
  });
});
