import { execSync } from "node:child_process";
import type EmbeddedPostgres from "embedded-postgres";
import { startPostgres } from "../scripts/postgres";

let pg: EmbeddedPostgres;

export async function setup() {
  pg = await startPostgres();
  const url = "postgresql://gdbs:gdbs@127.0.0.1:54329/gdbs_lims_test";
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}

export async function teardown() {
  await pg.stop();
}
