import { spawn } from "node:child_process";
import { startPostgres } from "./postgres";

const database = process.argv[2] === "test" ? "gdbs_lims_test" : "gdbs_lims";

async function main() {
  const pg = await startPostgres();
  const url = `postgresql://gdbs:gdbs@127.0.0.1:54329/${database}`;
  process.env.DATABASE_URL = url;

  const command = process.argv.includes("--deploy") ? "migrate deploy" : "migrate dev --name init";
  const child = spawn("npx", ["prisma", ...command.split(" ")], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    void pg.stop().finally(() => process.exit(code ?? 1));
  });
}

void main();
