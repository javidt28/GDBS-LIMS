import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const databaseDir = path.join(process.cwd(), ".data", "pg");
const port = 54329;

export async function startPostgres() {
  mkdirSync(databaseDir, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "gdbs",
    password: "gdbs",
    port,
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  });

  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    await pg.initialise();
  }

  try {
    await pg.start();
  } catch (error) {
    const client = pg.getPgClient("postgres");
    try {
      await client.connect();
      await client.end();
    } catch {
      throw error;
    }
  }

  for (const name of ["gdbs_lims", "gdbs_lims_test"]) {
    try {
      await pg.createDatabase(name);
    } catch {
      // The database already exists.
    }
  }

  const devUrl = `postgresql://gdbs:gdbs@127.0.0.1:${port}/gdbs_lims`;
  const testUrl = `postgresql://gdbs:gdbs@127.0.0.1:${port}/gdbs_lims_test`;
  mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
  writeFileSync(path.join(process.cwd(), ".data", "database-url"), devUrl);
  writeFileSync(path.join(process.cwd(), ".data", "test-database-url"), testUrl);
  if (!existsSync(path.join(process.cwd(), ".env"))) {
    writeFileSync(
      path.join(process.cwd(), ".env"),
      `DATABASE_URL="${devUrl}"\nSESSION_SECRET="dev-only-change-in-production"\nAPP_URL="http://localhost:3000"\n`,
    );
  }
  return pg;
}
