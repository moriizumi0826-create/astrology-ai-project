import React, { createContext, useCallback, useEffect, useRef, useState } from "react";
import { fetchAppVersion } from "./app-version.mjs";

export const AppVersionContext = createContext(null);

export function AppVersionProvider({ children }) {
  const [state, setState] = useState({ checking: true, checked: false, isAppOutdated: false, error: "" });
  const running = useRef(null);
  const lastCheck = useRef(0);
  const alive = useRef(false);
  const check = useCallback(async (force = false) => {
    if (running.current || (!force && Date.now() - lastCheck.current < 15000)) return;
    lastCheck.current = Date.now();
    const controller = new AbortController();
    running.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setState(previous => ({ ...previous, checking: true }));
    try {
      const result = await fetchAppVersion(__APP_BUILD_ID__, { signal: controller.signal });
      if (alive.current) setState({ ...result, checked: true, checking: false, error: "" });
    } catch {
      if (alive.current) setState(previous => ({ ...previous, checking: false, error: "更新状況を確認できません。再確認してください。" }));
    } finally {
      clearTimeout(timeout);
      running.current = null;
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    check();
    const visibleCheck = () => { if (document.visibilityState === "visible") check(); };
    const timer = setInterval(visibleCheck, 5 * 60 * 1000);
    window.addEventListener("focus", visibleCheck);
    window.addEventListener("online", visibleCheck);
    document.addEventListener("visibilitychange", visibleCheck);
    return () => {
      alive.current = false;
      running.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", visibleCheck);
      window.removeEventListener("online", visibleCheck);
      document.removeEventListener("visibilitychange", visibleCheck);
    };
  }, [check]);
  return <AppVersionContext.Provider value={{ state, check }}>{children}</AppVersionContext.Provider>;
}
