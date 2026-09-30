// Server capabilities control UI availability. They never authorize an API call.
export function featurePolicy(session, now = Date.now()) {
  const paid = session?.state === "paid" && (
    session.access_source === "owner" || session.access_source === "invite" || Date.parse(session.valid_until) > now
  );
  const caps = session?.capabilities || {};
  return {
    mapAssistant: paid,
    aspectList: paid && caps.aspect_list === true,
    compoundAspects: paid && caps.compound_aspects === true,
    stellarForecast: paid && caps.stellar_forecast === true,
    freePlayback: !(paid && caps.playback_policy === "paid_existing"),
  };
}

export function isLockedAspectMode(mode, policy) {
  return String(mode).startsWith("composite") && !policy.compoundAspects;
}
