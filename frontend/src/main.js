const API_BASE_URL = __APP_API_BASE_URL__;

const form = document.querySelector("#reading-form");
const submitLabel = document.querySelector("#submit-label");
const errorBox = document.querySelector("#error-box");
const readingGrid = document.querySelector("#reading-grid");
const metaCard = document.querySelector("#meta-card");
const chartCard = document.querySelector("#chart-card");
const metaName = document.querySelector("#meta-name");
const metaBirth = document.querySelector("#meta-birth");
const metaPlace = document.querySelector("#meta-place");
const chartDataNode = document.querySelector("#chart-data");

function setError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function renderReadings(payload) {
  metaCard.classList.remove("hidden");
  chartCard.classList.remove("hidden");

  metaName.textContent = payload.meta.full_name;
  metaBirth.textContent = `${payload.meta.birth_date} ${payload.meta.birth_time} / UTC${payload.meta.timezone_offset >= 0 ? "+" : ""}${payload.meta.timezone_offset}`;
  metaPlace.textContent = payload.meta.birthplace;
  chartDataNode.textContent = Object.entries(payload.chart_data)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  readingGrid.innerHTML = payload.readings
    .map(
      (item) => `
        <article class="bg-surface-container-lowest p-10 flex flex-col gap-6 reveal">
          <div>
            <p class="text-[10px] uppercase tracking-[0.3em] text-secondary font-bold mb-4">${item.type}</p>
            <h3 class="font-notoSerif text-2xl text-primary mb-4">${item.title}</h3>
            <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap">${item.content}</p>
          </div>
        </article>
      `
    )
    .join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.latitude = Number(payload.latitude);
  payload.longitude = Number(payload.longitude);
  payload.timezone_offset = Number(payload.timezone_offset);

  submitLabel.textContent = "Calculating...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/readings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Failed to generate reading.");
    }

    renderReadings(data);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setError(error.message || "Unknown error");
  } finally {
    submitLabel.textContent = "ホロスコープを算出する";
  }
});
