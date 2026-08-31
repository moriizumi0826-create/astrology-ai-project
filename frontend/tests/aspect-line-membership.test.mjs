import test from "node:test";
import assert from "node:assert/strict";

import {
  aspectHasCompoundMembership,
  compoundMembershipColor,
  mergeAspectLineMemberships,
} from "../src/aspect-line-membership.mjs";

function lineKey(aspect) {
  return [aspect.scope, aspect.from, aspect.to, aspect.angle].join(":");
}

test("keeps every compound membership when a physical line is shared", () => {
  const sharedLineFromOtherGroup = {
    scope: "mixed",
    from: "A",
    to: "B",
    angle: 180,
    compoundKey: "grand-cross-c",
    color: "#cc0000",
  };
  const tSquareLines = [
    { ...sharedLineFromOtherGroup, compoundKey: "t-square-a", color: "#ff0000" },
    { scope: "mixed", from: "A", to: "C", angle: 90, compoundKey: "t-square-a", color: "#ff0000" },
    { scope: "mixed", from: "B", to: "C", angle: 90, compoundKey: "t-square-a", color: "#ff0000" },
  ];

  const merged = mergeAspectLineMemberships([sharedLineFromOtherGroup, ...tSquareLines], lineKey);

  assert.equal(merged.length, 3);
  assert.equal(merged.filter((aspect) => aspectHasCompoundMembership(aspect, "t-square-a")).length, 3);
  assert.equal(merged.filter((aspect) => aspectHasCompoundMembership(aspect, "grand-cross-c")).length, 1);
  assert.equal(compoundMembershipColor(merged[0], "t-square-a"), "#ff0000");
});
