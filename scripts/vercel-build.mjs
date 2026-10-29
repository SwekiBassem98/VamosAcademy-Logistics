// Build Vercel : migrations appliquées uniquement pour la production (jamais depuis une prévisualisation), puis build Next.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.VERCEL_ENV === "production") run("npx prisma migrate deploy");
else console.log(`VERCEL_ENV=${process.env.VERCEL_ENV ?? "?"} : migrations ignorées`);
run("npx next build");
