import { readFileSync } from "node:fs";

process.env.DATABASE_URL = readFileSync(new URL("../.data/test-database-url", import.meta.url), "utf8").trim();
