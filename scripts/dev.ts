import { spawn } from "node:child_process";
import { startPostgres } from "./postgres";

async function main() {
  const pg = await startPostgres();
  process.env.DATABASE_URL = "postgresql://gdbs:gdbs@127.0.0.1:54329/gdbs_lims";

  await new Promise<void>((resolve, reject) => {
    const migrate = spawn("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
    migrate.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`migrate exited ${code}`))));
  });

  const next = spawn("npx", ["next", "dev"], { stdio: "inherit", env: process.env });
  next.on("exit", (code) => {
    void pg.stop().finally(() => process.exit(code ?? 0));
  });
}

void main();
