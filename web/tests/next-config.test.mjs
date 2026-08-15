import assert from "node:assert/strict";
import test from "node:test";

import { parseAllowedDevOrigins } from "../next-config-utils.mjs";

test("parseAllowedDevOrigins returns no origins when unset", () => {
  assert.deepEqual(parseAllowedDevOrigins(undefined), []);
});

test("parseAllowedDevOrigins parses comma-separated hostnames", () => {
  assert.deepEqual(
    parseAllowedDevOrigins("192.168.31.245, my-dev-host.local ,,"),
    ["192.168.31.245", "my-dev-host.local"],
  );
});
