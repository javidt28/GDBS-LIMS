const email = process.env.STAFF_BOOTSTRAP_EMAIL;
const password = process.env.STAFF_BOOTSTRAP_PASSWORD;
const fullName = process.env.STAFF_BOOTSTRAP_NAME;

if (!email || !password || !fullName) {
  console.error("Set STAFF_BOOTSTRAP_EMAIL, STAFF_BOOTSTRAP_PASSWORD, and STAFF_BOOTSTRAP_NAME.");
  process.exit(1);
}

process.env.DATABASE_URL ??= "postgresql://gdbs:gdbs@127.0.0.1:54329/gdbs_lims";

async function main() {
  const { startPostgres } = await import("./postgres");
  const pg = await startPostgres();
  try {
    const { bootstrapAdministrator } = await import("../src/server/accounts");
    const staff = await bootstrapAdministrator({ email: email!, password: password!, fullName: fullName! });
    console.log(`Created administrator ${staff.email}`);
  } finally {
    await pg.stop();
  }
}

void main();
