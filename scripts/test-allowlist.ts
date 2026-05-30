import { isSenderAllowed } from "../src/lib/sender-allowlist.ts";

const allowed = ["@dribbble.com"];
const cases: [string, boolean][] = [
  ["no-reply@m.dribbble.com", true],
  ["noreply@dribbble.com", true],
  ["evil@notdribbble.com", false],
];

let failed = 0;
for (const [from, want] of cases) {
  const got = isSenderAllowed(from, allowed);
  if (got !== want) {
    console.error(`FAIL ${from}: got ${got}, want ${want}`);
    failed++;
  } else {
    console.log(`ok ${from}`);
  }
}
process.exit(failed ? 1 : 0);
