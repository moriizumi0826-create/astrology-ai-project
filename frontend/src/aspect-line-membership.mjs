function membershipFromAspect(aspect) {
  if (!aspect?.compoundKey) return [];
  return [{
    key: aspect.compoundKey,
    kind: aspect.compoundKind || "",
    category: aspect.compoundCategory || "",
    description: aspect.compoundDescription || "",
    groupIds: Array.isArray(aspect.compoundGroupIds) ? [...aspect.compoundGroupIds] : [],
    color: aspect.color || "",
  }];
}

export function compoundMembershipsForAspect(aspect) {
  const memberships = Array.isArray(aspect?.compoundMemberships)
    ? aspect.compoundMemberships
    : membershipFromAspect(aspect);
  return memberships.filter((membership) => membership?.key);
}

export function mergeAspectLineMemberships(aspects = [], lineKeyForAspect) {
  if (typeof lineKeyForAspect !== "function") return [...aspects];
  const merged = [];
  const lineIndexByKey = new Map();

  aspects.forEach((aspect) => {
    const lineKey = lineKeyForAspect(aspect);
    const memberships = compoundMembershipsForAspect(aspect);
    if (!lineKey || !lineIndexByKey.has(lineKey)) {
      lineIndexByKey.set(lineKey, merged.length);
      merged.push({ ...aspect, compoundMemberships: memberships });
      return;
    }

    const existing = merged[lineIndexByKey.get(lineKey)];
    const membershipByKey = new Map(
      compoundMembershipsForAspect(existing).map((membership) => [membership.key, membership])
    );
    memberships.forEach((membership) => {
      if (!membershipByKey.has(membership.key)) membershipByKey.set(membership.key, membership);
    });
    existing.compoundMemberships = Array.from(membershipByKey.values());
  });

  return merged;
}

export function aspectHasCompoundMembership(aspect, compoundKey) {
  if (!compoundKey) return false;
  return compoundMembershipsForAspect(aspect).some((membership) => membership.key === compoundKey);
}

export function compoundMembershipColor(aspect, compoundKey) {
  return compoundMembershipsForAspect(aspect).find((membership) => membership.key === compoundKey)?.color
    || aspect?.color
    || "";
}

export function compoundMembershipSignature(aspect) {
  return compoundMembershipsForAspect(aspect)
    .map((membership) => `${membership.key}@${membership.color || ""}`)
    .sort()
    .join(",");
}
