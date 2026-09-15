import assert from "node:assert/strict";
import { randomUsername } from "./popup.js";

const draws = Array.from({ length: 1000 }, randomUsername);

for (const name of draws) {
  assert.match(name, /^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/, `bad format: ${name}`);
}
assert.ok(new Set(draws).size > 950, "too many collisions in 1000 draws");

console.log("ok —", draws[0]);
