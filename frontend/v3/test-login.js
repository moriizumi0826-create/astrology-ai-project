// Explicit local-test backend only; never used with Supabase authentication.
import { getJson, postJson } from "./api.mjs";
import { configureStorage, getStoredReadingForm, getStoredReadingResult, storeReadingForm, storeReadingResult } from "./reading-storage.js";

const form = document.querySelector("#login-form");
const button = form.querySelector('button[type="submit"]');
const errorBox = document.querySelector("#error");
const status = document.querySelector("#status");
let anonymousForm = null;
let anonymousResult = null;
const destination = () => getStoredReadingForm() ? "/index.html#forecast" : "/entry.html";

getJson("/api/v3/session").then(session => {
  configureStorage(session);
  if (session.state === "paid") { location.replace(destination()); return; }
  if (!session.user_id) {
    anonymousForm = getStoredReadingForm();
    anonymousResult = getStoredReadingResult({ allowStale: true });
    document.querySelector("#transfer-row").hidden = !anonymousForm;
  }
  status.hidden = true;
  button.disabled = false;
}).catch(error => { status.textContent = `検証APIを起動して再読み込みしてください。${error.message}`; });

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorBox.hidden = true;
  button.disabled = true;
  status.textContent = "ログインしています…";
  status.hidden = false;
  try {
    const session = await postJson("/api/v3/test-auth/login", {
      login_id: document.querySelector("#login-id").value,
      password: document.querySelector("#login-password").value,
    });
    document.querySelector("#login-password").value = "";
    configureStorage(session);
    if (document.querySelector("#transfer").checked && anonymousForm && !getStoredReadingForm()) {
      storeReadingForm(anonymousForm);
      if (anonymousResult) await storeReadingResult(anonymousResult);
    }
    location.assign(destination());
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    status.hidden = true;
    button.disabled = false;
  }
});
