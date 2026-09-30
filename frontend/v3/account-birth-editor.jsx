import React from "react";
import { createRoot } from "react-dom/client";
import { BirthDataEditor } from "./birth-data-editor.jsx";
import { postJson, searchBirthLocations } from "./api.mjs";
import { prepareSession, saveMemberProfile } from "./profile.mjs";
import { getStoredReadingForm, storeReadingForm, clearReadingResult } from "./reading-storage.js";
import "./account-editor.css";

export async function mountBirthEditor(container, { onSaved, onBusyChange }) {
  const session = await prepareSession();
  if (!String(session.user_id || "").startsWith("supabase:")) throw new Error("会員ログインが必要です。");
  const root = createRoot(container);
  let savedForm = getStoredReadingForm() || {};
  let version = 0;
  const render = () => root.render(<BirthDataEditor key={version} purpose="account" initialForm={savedForm} meta={{ birthplace: savedForm.birthplace }}
    onSearchLocations={searchBirthLocations} onBusyChange={onBusyChange}
    onRecalculate={async ({ request, snapshot }) => {
      // Validate the birth time (including DST ambiguity) with the same calculation as the chart.
      await postJson("/api/readings", request);
      await saveMemberProfile(snapshot);
      savedForm = snapshot;
      storeReadingForm(snapshot);
      clearReadingResult();
      onSaved();
      render();
    }} />);
  render();
  return { reset() { savedForm = {}; version += 1; render(); } };
}
