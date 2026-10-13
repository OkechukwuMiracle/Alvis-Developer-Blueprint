import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test(
  "Supabase default function grants cannot expose worker leases or bypass publication",
  { skip: !process.env.ALVIS_TEST_DB_CONTAINER },
  () => {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        process.env.ALVIS_TEST_DB_CONTAINER!,
        "psql",
        "-U",
        "postgres",
        "-d",
        process.env.ALVIS_TEST_DB_NAME || "alvis_week4_verified",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        encoding: "utf8",
        input: `begin;
 do $$ declare fn record; begin
 for fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,6)='alvis_' loop
 if has_function_privilege('anon',fn.oid,'EXECUTE') and fn.proname not in ('alvis_public_library','alvis_community_visible') then raise exception 'Anonymous function exposure: %',fn.proname;end if;
 if fn.proname in ('alvis_claim_job','alvis_claim_learning_job','alvis_heartbeat','alvis_fail_job','alvis_finish_job','alvis_finish_index','alvis_finish_lesson') and (has_function_privilege('authenticated',fn.oid,'EXECUTE') or not has_function_privilege('service_role',fn.oid,'EXECUTE')) then raise exception 'Worker function ACL: %',fn.proname;end if;
 if fn.proname in ('alvis_transition','alvis_copy_draft','alvis_learning_command','alvis_admin_command','alvis_create_organization','alvis_accept_invitation','alvis_begin_capture') and (not has_function_privilege('authenticated',fn.oid,'EXECUTE') or has_function_privilege('service_role',fn.oid,'EXECUTE')) then raise exception 'User-authority function ACL: %',fn.proname;end if;
 end loop;end $$;
 rollback;select 'PASS: function permissions';`,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: function permissions/);
  },
);
