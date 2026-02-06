const fields = [
  "fullName",
  "email",
  "phone",
  "city",
  "linkedinUrl",
  "portfolioUrl",
  "yearsExperience",
  "currentSalary",
  "expectedSalary",
  "noticePeriod",
  "workAuthorization",
  "disabilityStatus",
  "gender",
  "raceEthnicity",
  "veteranStatus",
  "dataConsent",
  "customAnswers",
  "maxApplications",
  "autoSubmit"
];

const statusEl = document.getElementById("status");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#b91c1c" : "#065f46";
}

function readForm() {
  const data = {};
  for (const id of fields) {
    const el = document.getElementById(id);
    data[id] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  return data;
}

function fillForm(data) {
  for (const id of fields) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = Boolean(data[id]);
    } else {
      el.value = data[id] ?? "";
    }
  }
}

async function getActiveLinkedInTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes("linkedin.com/jobs")) {
    return null;
  }
  return tab;
}

async function sendMessageToActiveTab(type, payload = {}) {
  const tab = await getActiveLinkedInTab();
  if (!tab) {
    setStatus("Open a LinkedIn Jobs tab first.", true);
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const data = readForm();
  if (!data.dataConsent) {
    setStatus("Please accept Data Notice before saving.", true);
    return;
  }
  try {
    if (data.customAnswers) {
      JSON.parse(data.customAnswers);
    }
  } catch {
    setStatus("Custom Answers must be valid JSON.", true);
    return;
  }

  await chrome.storage.local.set({ easyApplyAssistant: data });
  setStatus("Saved.");
});

document.getElementById("startBtn").addEventListener("click", async () => {
  const data = readForm();
  if (!data.dataConsent) {
    setStatus("Please accept Data Notice before starting.", true);
    return;
  }
  await chrome.storage.local.set({ easyApplyAssistant: data });
  await sendMessageToActiveTab("START_AUTOMATION", { config: data });
  setStatus("Automation started.");
});

document.getElementById("stopBtn").addEventListener("click", async () => {
  await sendMessageToActiveTab("STOP_AUTOMATION");
  setStatus("Automation stopped.");
});

async function init() {
  const { easyApplyAssistant } = await chrome.storage.local.get("easyApplyAssistant");
  fillForm({
    disabilityStatus: "No",
    gender: "Male",
    raceEthnicity: "Asian (Non Hispanic or Latino)",
    veteranStatus: "I am not a protected veteran",
    dataConsent: false,
    maxApplications: 10,
    autoSubmit: false,
    ...easyApplyAssistant
  });
}

init();
