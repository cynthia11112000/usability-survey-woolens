const STORAGE_KEY = "ux-research-survey-responses";
const DASHBOARD_PASSWORD = "woolens";
const AI_SETTINGS_KEY = "ux-research-openai-settings";
const AI_INSIGHTS_KEY = "ux-research-openai-insights";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const SUPABASE_TABLE = "survey_responses";
const STORAGE_MODE_LOCAL = "local";
const STORAGE_MODE_SUPABASE = "supabase";
const SHARED_REFRESH_INTERVAL_MS = 15000;
const adminState = {
  aiInsights: null,
  editingResponseId: null,
  refreshTimerId: null,
  isDashboardUnlocked: false
};
let responseCache = [];
let responsesLoaded = false;
const comfortScoreMap = {
  "Very uncomfortable": 1,
  "Somewhat uncomfortable": 2,
  Neutral: 3,
  "Somewhat comfortable": 4,
  "Very comfortable": 5
};
const familiarityScoreMap = {
  "Never heard of them": 1,
  "Heard of them": 2,
  "Some familiarity": 3,
  "Worked with them directly": 4
};
const taskDefinitions = [
  {
    id: "task1",
    title: "Task 1: First impression",
    responseKeys: ["task1Response", "task1Notes"],
    statusKey: "task1Clarity",
    statusLabel: "Clarity score 4-5",
    successValues: [4, 5]
  },
  {
    id: "task2",
    title: "Task 2: Internal communications",
    responseKeys: ["task2Finding", "task2Notes"],
    statusKey: "task2Outcome",
    statusLabel: "Completed",
    successValues: ["Completed"]
  },
  {
    id: "task3",
    title: "Task 3: Email correspondence",
    responseKeys: ["task3Finding", "task3Notes"],
    statusKey: "task3MetadataUnderstanding",
    statusLabel: "Metadata understood",
    successValues: ["Yes"]
  },
  {
    id: "task4",
    title: "Task 4: Timeline",
    responseKeys: ["task4Narrative", "task4Notes"],
    statusKey: "task4Summaries",
    statusLabel: "Summaries used",
    successValues: ["Yes"]
  },
  {
    id: "task5",
    title: "Task 5: Document exploration",
    responseKeys: ["task5Response", "task5Notes"],
    statusKey: "task5LabelUnderstanding",
    statusLabel: "Label understood",
    successValues: ["Yes"]
  },
  {
    id: "task6",
    title: "Task 6: Redaction analysis",
    responseKeys: ["task6Response", "task6Notes"],
    statusKey: "task6Stats",
    statusLabel: "Stats found",
    successValues: ["Yes"]
  }
];
const themeLexicon = {
  timeline: ["timeline", "day summary", "summary", "chronology"],
  navigation: ["navigate", "navigation", "where", "find", "discover", "locate"],
  chat: ["chat", "conversation", "contact", "message"],
  email: ["email", "mail", "sender", "receiver", "metadata"],
  redactions: ["redaction", "withheld", "legal grounds", "black", "hidden"],
  documents: ["document", "source", "original source", "position document"],
  clarity: ["clear", "purpose", "understand", "overview"],
  search: ["search", "query", "filter", "findability"],
  confidence: ["confident", "confidence", "comfortable", "uncertain"],
  sensitivity: ["sensitive", "political", "minister", "prime minister", "rotterdam", "un"],
  summaries: ["ai", "summary", "summaries"],
  friction: ["confusing", "hesitate", "hard", "difficult", "cumbersome"]
};

const susStatements = [
  "I think I would like to use this tool frequently.",
  "I found the tool unnecessarily complex.",
  "I thought the tool was easy to use.",
  "I think I would need support to use this tool.",
  "I found the functions well integrated.",
  "I thought there was too much inconsistency.",
  "Most people would learn this quickly.",
  "I found the tool cumbersome to use.",
  "I felt confident using the tool.",
  "I needed to learn a lot before I could get going."
];

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  if (page === "survey") {
    initializeSurveyPage();
  }

  if (page === "admin") {
    initializeAdminPage();
  }
});

function initializeSurveyPage() {
  renderSusTable();

  const form = document.getElementById("survey-form");
  const status = document.getElementById("form-status");
  const sessionDateField = form.elements.sessionDate;
  const submitButton = form.querySelector('button[type="submit"]');

  bindRangeOutputs(form);

  if (sessionDateField && !sessionDateField.value) {
    sessionDateField.value = new Date().toISOString().slice(0, 10);
  }

  status.textContent = getStorageMode() === STORAGE_MODE_SUPABASE
    ? "Shared storage is active. Responses will be saved across devices."
    : "Local-only mode is active. Add Supabase settings in config.js for shared saving.";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = collectFormData(form);
    if (submitButton) {
      submitButton.disabled = true;
    }

    status.textContent = getStorageMode() === STORAGE_MODE_SUPABASE ? "Saving response to shared storage..." : "Saving response in this browser...";
    status.className = "status-text";

    try {
      await saveResponse(payload);
      status.textContent = getStorageMode() === STORAGE_MODE_SUPABASE
        ? `Saved response for ${payload.participantId} to shared storage.`
        : `Saved response for ${payload.participantId} in this browser.`;
      status.className = "status-text success";
      form.dataset.preserveStatus = "true";
      form.reset();
      if (sessionDateField) {
        sessionDateField.value = new Date().toISOString().slice(0, 10);
      }
      setDefaultRanges(form);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Unable to save the response.";
      status.className = "status-text error";
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  form.addEventListener("reset", () => {
    window.requestAnimationFrame(() => {
      setDefaultRanges(form);
      if (form.dataset.preserveStatus === "true") {
        form.dataset.preserveStatus = "false";
      } else {
        status.textContent = "";
        status.className = "status-text";
      }
      if (sessionDateField) {
        sessionDateField.value = new Date().toISOString().slice(0, 10);
      }
    });
  });

  setDefaultRanges(form);
}

function initializeAdminPage() {
  const loginForm = document.getElementById("login-form");
  const loginStatus = document.getElementById("login-status");
  const loginPanel = document.getElementById("login-panel");
  const dashboardPanel = document.getElementById("dashboard-panel");
  const storageStatus = document.getElementById("storage-status");

  setupAiControls();
  adminState.aiInsights = loadAiInsights();
  updateStorageStatus(storageStatus);

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = loginForm.elements.password.value;

    if (password !== DASHBOARD_PASSWORD) {
      loginStatus.textContent = "Incorrect password.";
      loginStatus.className = "status-text error";
      return;
    }

    loginPanel.classList.add("hidden");
    dashboardPanel.classList.remove("hidden");
    adminState.isDashboardUnlocked = true;

    try {
      updateStorageStatus(storageStatus, "Loading responses...");
      await hydrateResponses();
      updateStorageStatus(storageStatus);
      renderDashboard();
      startSharedResponsesAutoRefresh(storageStatus);
    } catch (error) {
      loginPanel.classList.remove("hidden");
      dashboardPanel.classList.add("hidden");
      adminState.isDashboardUnlocked = false;
      stopSharedResponsesAutoRefresh();
      loginStatus.textContent = error instanceof Error ? error.message : "Unable to load saved responses.";
      loginStatus.className = "status-text error";
      updateStorageStatus(storageStatus);
    }
  });

  document.getElementById("export-json").addEventListener("click", exportResponses);
  document.getElementById("export-csv").addEventListener("click", exportResponsesCsv);
  document.getElementById("clear-data").addEventListener("click", clearResponses);
  document.getElementById("responses-list").addEventListener("click", handleResponseActions);
}

function setupAiControls() {
  const savedSettings = loadAiSettings();
  const keyInput = document.getElementById("openai-api-key");
  const modelInput = document.getElementById("openai-model");
  const status = document.getElementById("ai-config-status");

  keyInput.value = savedSettings.apiKey || "";
  modelInput.value = savedSettings.model || DEFAULT_OPENAI_MODEL;

  document.getElementById("save-openai-settings").addEventListener("click", () => {
    saveAiSettings({
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim() || DEFAULT_OPENAI_MODEL
    });
    status.textContent = keyInput.value.trim() ? "AI settings saved in this browser." : "Model preference saved. Add a key to run OpenAI analysis.";
    status.className = "status-text success";
  });

  document.getElementById("clear-openai-settings").addEventListener("click", () => {
    localStorage.removeItem(AI_SETTINGS_KEY);
    localStorage.removeItem(AI_INSIGHTS_KEY);
    adminState.aiInsights = null;
    keyInput.value = "";
    modelInput.value = DEFAULT_OPENAI_MODEL;
    status.textContent = "AI settings cleared from this browser.";
    status.className = "status-text success";
    renderDashboard();
  });

  document.getElementById("run-openai-analysis").addEventListener("click", async () => {
    const apiKey = keyInput.value.trim();
    const model = modelInput.value.trim() || DEFAULT_OPENAI_MODEL;

    if (!apiKey) {
      status.textContent = "Add an OpenAI API key first.";
      status.className = "status-text error";
      return;
    }

    const responses = readResponses().map(normalizeResponse);
    if (!responses.length) {
      status.textContent = "Add at least one response before running AI analysis.";
      status.className = "status-text error";
      return;
    }

    saveAiSettings({ apiKey, model });
    status.textContent = "Generating OpenAI summaries...";
    status.className = "status-text";

    try {
      const insights = await generateOpenAiInsights(responses, { apiKey, model });
      adminState.aiInsights = {
        ...insights,
        generatedAt: new Date().toISOString(),
        model,
        fingerprint: buildResponsesFingerprint(responses),
        provider: "openai"
      };
      localStorage.setItem(AI_INSIGHTS_KEY, JSON.stringify(adminState.aiInsights));
      status.textContent = `OpenAI analysis updated using ${model}.`;
      status.className = "status-text success";
      renderDashboard();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "OpenAI analysis failed.";
      status.className = "status-text error";
    }
  });
}

function renderSusTable() {
  const container = document.getElementById("sus-grid");
  if (!container) {
    return;
  }

  const table = document.createElement("table");
  table.className = "sus-table";

  const headRow = document.createElement("tr");
  headRow.innerHTML = `
    <th>Statement</th>
    ${[1, 2, 3, 4, 5].map((score) => `<th class="rating-cell">${score}</th>`).join("")}
  `;

  const thead = document.createElement("thead");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  susStatements.forEach((statement, index) => {
    const row = document.createElement("tr");
    const options = [1, 2, 3, 4, 5]
      .map((score) => {
        const checked = score === 3 ? "checked" : "";
        return `
          <td class="rating-cell">
            <input type="radio" name="sus${index + 1}" value="${score}" ${checked} aria-label="${statement} rating ${score}" />
          </td>
        `;
      })
      .join("");

    row.innerHTML = `<td>${statement}</td>${options}`;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function collectFormData(form) {
  const formData = new FormData(form);
  const payload = {
    submittedAt: new Date().toISOString()
  };

  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === "string" ? value.trim() : value;
  }

  payload.susResponses = susStatements.map((statement, index) => ({
    statement,
    score: Number(payload[`sus${index + 1}`] || 3)
  }));
  payload.susScore = calculateSusScore(payload.susResponses);

  return payload;
}

function calculateSusScore(susResponses) {
  const adjustedScore = susResponses.reduce((total, item, index) => {
    if (index % 2 === 0) {
      return total + (item.score - 1);
    }

    return total + (5 - item.score);
  }, 0);

  return adjustedScore * 2.5;
}

function setDefaultRanges(form) {
  Array.from(form.querySelectorAll('input[type="range"]')).forEach((field) => {
    if (!field.value) {
      field.value = field.defaultValue || 3;
    }
  });

  updateRangeOutputs(form);
}

function bindRangeOutputs(form) {
  Array.from(form.querySelectorAll('input[type="range"]')).forEach((field) => {
    field.addEventListener("input", () => updateRangeOutput(field));
  });

  updateRangeOutputs(form);
}

function updateRangeOutputs(form) {
  Array.from(form.querySelectorAll('input[type="range"]')).forEach(updateRangeOutput);
}

function updateRangeOutput(field) {
  const output = document.querySelector(`[data-range-output="${field.name}"]`);
  if (!output) {
    return;
  }

  output.textContent = `${field.value}/5`;
}

function readResponses() {
  if (responsesLoaded) {
    return responseCache.slice();
  }

  if (getStorageMode() === STORAGE_MODE_LOCAL) {
    return readLocalResponses();
  }

  return [];
}

function readLocalResponses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalResponses(responses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
  responseCache = responses.slice();
  responsesLoaded = true;
}

function getStorageConfig() {
  const config = typeof window.uxResearchConfig === "object" && window.uxResearchConfig ? window.uxResearchConfig : {};
  const supabaseUrl = String(config.supabaseUrl || "").trim().replace(/\/$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey || "").trim();

  return { supabaseUrl, supabaseAnonKey };
}

function getStorageMode() {
  const { supabaseUrl, supabaseAnonKey } = getStorageConfig();
  return supabaseUrl && supabaseAnonKey ? STORAGE_MODE_SUPABASE : STORAGE_MODE_LOCAL;
}

function getStorageStatusMessage(overrideMessage = "") {
  if (overrideMessage) {
    return overrideMessage;
  }

  return getStorageMode() === STORAGE_MODE_SUPABASE
    ? "Shared Supabase storage is active. Dashboard data is loaded from the hosted database and auto-refreshes while open."
    : "Local-only mode is active. Add Supabase settings in config.js to share responses across devices.";
}

function updateStorageStatus(element, overrideMessage = "") {
  if (!element) {
    return;
  }

  element.textContent = getStorageStatusMessage(overrideMessage);
  element.className = "status-text";
}

async function hydrateResponses() {
  responseCache = getStorageMode() === STORAGE_MODE_SUPABASE ? await loadSupabaseResponses() : readLocalResponses();
  responsesLoaded = true;
  return responseCache.slice();
}

function startSharedResponsesAutoRefresh(statusElement) {
  stopSharedResponsesAutoRefresh();

  if (getStorageMode() !== STORAGE_MODE_SUPABASE) {
    return;
  }

  adminState.refreshTimerId = window.setInterval(() => {
    void refreshSharedResponses(statusElement);
  }, SHARED_REFRESH_INTERVAL_MS);
}

function stopSharedResponsesAutoRefresh() {
  if (adminState.refreshTimerId) {
    window.clearInterval(adminState.refreshTimerId);
    adminState.refreshTimerId = null;
  }
}

async function refreshSharedResponses(statusElement) {
  if (!adminState.isDashboardUnlocked || getStorageMode() !== STORAGE_MODE_SUPABASE) {
    stopSharedResponsesAutoRefresh();
    return;
  }

  if (adminState.editingResponseId) {
    return;
  }

  const previousFingerprint = buildResponsesFingerprint(readResponses().map(normalizeResponse));

  try {
    const nextResponses = await loadSupabaseResponses();
    responseCache = nextResponses;
    responsesLoaded = true;
    updateStorageStatus(statusElement);

    const nextFingerprint = buildResponsesFingerprint(nextResponses.map(normalizeResponse));
    if (nextFingerprint !== previousFingerprint) {
      renderDashboard();
    }
  } catch (error) {
    updateStorageStatus(statusElement, error instanceof Error ? error.message : "Unable to refresh shared responses.");
  }
}

async function saveResponse(response) {
  const payload = { ...response };

  if (getStorageMode() === STORAGE_MODE_SUPABASE) {
    const saved = await createSupabaseResponse(payload);
    if (responsesLoaded) {
      responseCache = responseCache.concat(saved);
    }
    clearAiInsightsCache();
    return saved;
  }

  const responses = readLocalResponses();
  responses.push(payload);
  writeLocalResponses(responses);
  clearAiInsightsCache();
  return payload;
}

async function updateStoredResponse(responseId, updates) {
  const responses = readResponses();
  const target = responses.find((response) => getResponseRecordId(response) === responseId);

  if (!target) {
    throw new Error("Response not found.");
  }

  const nextResponse = {
    ...target,
    ...updates
  };

  if (getStorageMode() === STORAGE_MODE_SUPABASE) {
    const saved = await updateSupabaseResponse(responseId, nextResponse);
    responseCache = responses.map((response) => (getResponseRecordId(response) === responseId ? saved : response));
    responsesLoaded = true;
    clearAiInsightsCache();
    return saved;
  }

  const nextResponses = responses.map((response) => (getResponseRecordId(response) === responseId ? nextResponse : response));
  writeLocalResponses(nextResponses);
  clearAiInsightsCache();
  return nextResponse;
}

async function deleteStoredResponse(responseId) {
  if (getStorageMode() === STORAGE_MODE_SUPABASE) {
    await deleteSupabaseResponse(responseId);
    responseCache = readResponses().filter((response) => getResponseRecordId(response) !== responseId);
    responsesLoaded = true;
    clearAiInsightsCache();
    return;
  }

  const nextResponses = readResponses().filter((response) => getResponseRecordId(response) !== responseId);
  writeLocalResponses(nextResponses);
  clearAiInsightsCache();
}

async function clearStoredResponses() {
  if (getStorageMode() === STORAGE_MODE_SUPABASE) {
    await deleteAllSupabaseResponses();
    responseCache = [];
    responsesLoaded = true;
    clearAiInsightsCache();
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  responseCache = [];
  responsesLoaded = true;
  clearAiInsightsCache();
}

function clearAiInsightsCache() {
  localStorage.removeItem(AI_INSIGHTS_KEY);
  adminState.aiInsights = null;
}

function getSupabaseBaseUrl() {
  const { supabaseUrl } = getStorageConfig();
  return `${supabaseUrl}/rest/v1`;
}

function buildSupabaseHeaders(prefer = "") {
  const { supabaseAnonKey } = getStorageConfig();
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json"
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${getSupabaseBaseUrl()}/${path}`, {
    ...options,
    headers: {
      ...buildSupabaseHeaders(options.prefer || ""),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function serializeResponseForStorage(response) {
  const payload = { ...response };
  delete payload.remoteId;
  delete payload.responseId;
  delete payload.familiarityScore;
  delete payload.comfortScore;
  delete payload.backgroundScore;

  return {
    submitted_at: payload.submittedAt || null,
    participant_id: payload.participantId || null,
    session_date: payload.sessionDate || null,
    researcher_name: payload.researcherName || null,
    payload
  };
}

function mapSupabaseRow(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    ...payload,
    submittedAt: payload.submittedAt || row.submitted_at || "",
    participantId: payload.participantId || row.participant_id || "",
    sessionDate: payload.sessionDate || row.session_date || "",
    researcherName: payload.researcherName || row.researcher_name || "",
    remoteId: row.id
  };
}

async function loadSupabaseResponses() {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=id,submitted_at,participant_id,session_date,researcher_name,payload,created_at&order=created_at.asc`, {
    method: "GET"
  });

  return Array.isArray(rows) ? rows.map(mapSupabaseRow) : [];
}

async function createSupabaseResponse(response) {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=id,submitted_at,participant_id,session_date,researcher_name,payload`, {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify(serializeResponseForStorage(response))
  });

  return mapSupabaseRow(Array.isArray(rows) ? rows[0] : rows);
}

async function updateSupabaseResponse(responseId, response) {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(responseId)}&select=id,submitted_at,participant_id,session_date,researcher_name,payload`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(serializeResponseForStorage(response))
  });

  return mapSupabaseRow(Array.isArray(rows) ? rows[0] : rows);
}

async function deleteSupabaseResponse(responseId) {
  await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(responseId)}`, {
    method: "DELETE"
  });
}

async function deleteAllSupabaseResponses() {
  await supabaseRequest(`${SUPABASE_TABLE}?id=not.is.null`, {
    method: "DELETE"
  });
}

function renderDashboard() {
  const responses = readResponses().map(normalizeResponse);
  const aiInsights = getUsableAiInsights(responses);
  renderMetrics(responses);
  renderAiSummary(responses, aiInsights);
  renderSusChart(responses);
  renderSusSummary(responses);
  renderVisualCharts(responses);
  renderTaskSummary(responses);
  renderTaskThemes(responses, aiInsights);
  renderResponses(responses);
}

function getUsableAiInsights(responses) {
  if (!adminState.aiInsights) {
    return null;
  }

  if (adminState.aiInsights.fingerprint !== buildResponsesFingerprint(responses)) {
    return null;
  }

  return adminState.aiInsights;
}

function normalizeResponse(response) {
  const familiarityScore = familiarityScoreMap[response.backgroundWooFamiliarity] || inferFamiliarityScore(response.backgroundWoo || "");
  const comfortScore = comfortScoreMap[response.backgroundComfort] || 0;
  const backgroundScore = average([familiarityScore, comfortScore].filter(Boolean));
  const susResponses = response.susResponses && response.susResponses.length
    ? response.susResponses
    : susStatements.map((statement, index) => ({
        statement,
        score: Number(response[`sus${index + 1}`] || 3)
      }));

  return {
    ...response,
    responseId: getResponseRecordId(response),
    familiarityScore,
    comfortScore,
    backgroundScore,
    susResponses,
    susScore: Number(response.susScore || calculateSusScore(susResponses))
  };
}

function inferFamiliarityScore(value) {
  const text = String(value || "").toLowerCase();

  if (!text) {
    return 0;
  }

  if (/(worked|use often|regularly|expert)/.test(text)) {
    return 4;
  }

  if (/(some familiarity|familiar|have used)/.test(text)) {
    return 3;
  }

  if (/(heard|know of|aware)/.test(text)) {
    return 2;
  }

  return 1;
}

function renderMetrics(responses) {
  const metricGrid = document.getElementById("metric-grid");
  const susScores = responses.map((response) => Number(response.susScore) || 0);
  const averageSus = susScores.length ? (susScores.reduce((sum, score) => sum + score, 0) / susScores.length).toFixed(1) : "0.0";
  const averageBackground = responses.length ? average(responses.map((response) => response.backgroundScore)).toFixed(2) : "0.00";
  const completionRate = responses.length
    ? `${Math.round((responses.filter((response) => response.task2Outcome === "Completed").length / responses.length) * 100)}%`
    : "0%";
  const averageTask2Time = responses.length ? average(responses.map((response) => Number(response.task2Time)).filter((value) => !Number.isNaN(value))).toFixed(1) : "0.0";
  const adoptionRate = responses.length ? `${Math.round((responses.filter((response) => isPositiveAdoption(response.closingAdoption)).length / responses.length) * 100)}%` : "0%";
  const frictionFlags = responses.reduce((count, response) => {
    return count + Number(response.task2Outcome !== "Completed") + Number(response.task5LabelUnderstanding === "No") + Number(response.task6Stats === "No");
  }, 0);

  const metrics = [
    { label: "Responses", value: responses.length },
    { label: "Average SUS", value: averageSus },
    {
      label: "Avg. Background Score",
      value: averageBackground,
      detail: "Mean of Woo familiarity and official-doc comfort. About 2 is low familiarity, 3 is moderate, 4+ is strong."
    },
    { label: "Task 2 Completion", value: completionRate },
    { label: "Avg. Task 2 Time", value: `${averageTask2Time} min` },
    { label: "Likely Adoption", value: adoptionRate, detail: `${frictionFlags} friction flags logged` }
  ];

  metricGrid.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <span>${metric.label}</span>
          <strong>${metric.value}</strong>
          ${metric.detail ? `<p class="metric-caption">${metric.detail}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function renderAiSummary(responses, aiInsights) {
  const container = document.getElementById("ai-summary");

  if (!responses.length) {
    container.innerHTML = emptyState("Add survey responses to generate automated summaries.");
    return;
  }

  const gainsThemes = extractThemes(
    responses.flatMap((response) => [response.closingUseful, response.sessionSummary, response.task4Narrative, response.closingAdoption])
  );
  const painThemes = extractThemes(
    responses.flatMap((response) => [response.closingConfusing, response.task2Notes, response.task3Notes, response.task5Notes, response.task6Notes])
  );
  const overallSummary = aiInsights?.overallSummary || buildOverallSummary(responses, gainsThemes, painThemes);
  const gainsSummary = aiInsights?.gainsSummary || buildThemeSentence("Main gains", gainsThemes);
  const painsSummary = aiInsights?.painsSummary || buildThemeSentence("Main pains", painThemes);
  const sourceMarkup = renderInsightSource(aiInsights);

  container.innerHTML = `
    <article class="insight-card">
      <h3>AI overall summary</h3>
      ${sourceMarkup}
      <p class="muted-copy">${escapeHtml(overallSummary)}</p>
    </article>
    <article class="insight-card">
      <h3>AI gains summary</h3>
      ${sourceMarkup}
      <p class="muted-copy">${escapeHtml(gainsSummary)}</p>
      ${renderThemeChips(gainsThemes)}
    </article>
    <article class="insight-card">
      <h3>AI pains summary</h3>
      ${sourceMarkup}
      <p class="muted-copy">${escapeHtml(painsSummary)}</p>
      ${renderThemeChips(painThemes)}
    </article>
  `;
}

function buildOverallSummary(responses, gainsThemes, painThemes) {
  const averageSus = average(responses.map((response) => response.susScore));
  const highKnowledge = responses.filter((response) => response.backgroundScore >= 3.5);
  const lowKnowledge = responses.filter((response) => response.backgroundScore < 3.5);
  const highKnowledgeSus = highKnowledge.length ? average(highKnowledge.map((response) => response.susScore)).toFixed(1) : "n/a";
  const lowKnowledgeSus = lowKnowledge.length ? average(lowKnowledge.map((response) => response.susScore)).toFixed(1) : "n/a";
  const topGain = gainsThemes[0] ? gainsThemes[0].label : "general findability";
  const topPain = painThemes[0] ? painThemes[0].label : "task-specific friction";

  return `Across ${responses.length} sessions, the average SUS score is ${averageSus.toFixed(1)}. The strongest positive pattern centers on ${humanizeTheme(topGain)}, while the most repeated friction relates to ${humanizeTheme(topPain)}. Participants with stronger background knowledge averaged ${highKnowledgeSus} SUS, compared with ${lowKnowledgeSus} for participants with lower background knowledge.`;
}

function renderSusChart(responses) {
  const container = document.getElementById("sus-chart");

  if (!responses.length) {
    container.innerHTML = emptyState("SUS averages will appear after the first response.");
    return;
  }

  const rows = susStatements
    .map((statement, index) => {
      const averageScore = average(
        responses
          .map((response) => Number(response[`sus${index + 1}`]))
          .filter((score) => !Number.isNaN(score))
      );

      return {
        label: `Q${index + 1}`,
        detail: statement,
        value: averageScore,
        max: 5
      };
    });

  container.innerHTML = `
    <h3>SUS average per question</h3>
    <p class="muted-copy">Each bar shows the average rating from 1 to 5.</p>
    ${renderBarChart(rows, { decimals: 2 })}
  `;
}

function renderSusSummary(responses) {
  const susSummary = document.getElementById("sus-summary");
  if (!responses.length) {
    susSummary.innerHTML = "";
    return;
  }

  const scoresByStatement = susStatements.map((statement, index) => {
    const scores = responses
      .map((response) => Number(response[`sus${index + 1}`]))
      .filter((score) => !Number.isNaN(score));
    const average = scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2) : "0.00";

    return { statement, average };
  });

  susSummary.innerHTML = scoresByStatement
    .map(
      (item) => `
        <article class="sus-stat-card">
          <span>${item.statement}</span>
          <strong>${item.average}</strong>
        </article>
      `
    )
    .join("");
}

function renderVisualCharts(responses) {
  renderBackgroundSusScatter(responses);
  renderBackgroundDistribution(responses);
  renderSusDistribution(responses);
  renderTaskOutcomeChart(responses);
}

function renderBackgroundSusScatter(responses) {
  const container = document.getElementById("background-sus-scatter");

  if (!responses.length) {
    container.innerHTML = emptyState("Background knowledge versus SUS will appear after the first response.");
    return;
  }

  const width = 520;
  const height = 240;
  const margin = { top: 18, right: 16, bottom: 34, left: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xTicks = [1, 2, 3, 4, 5];
  const yTicks = [0, 20, 40, 60, 80, 100];

  const points = responses
    .map((response, index) => ({
      label: response.participantId || `P${index + 1}`,
      x: response.backgroundScore || 0,
      y: response.susScore || 0,
      offset: index % 3
    }))
    .filter((point) => point.x > 0);

  const svg = `
    <svg class="scatter-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Background score versus SUS scatter plot">
      ${yTicks
        .map((tick) => {
          const y = margin.top + plotHeight - (tick / 100) * plotHeight;
          return `
            <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}"></line>
            <text class="axis-tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11">${tick}</text>
          `;
        })
        .join("")}
      ${xTicks
        .map((tick) => {
          const x = margin.left + ((tick - 1) / 4) * plotWidth;
          return `
            <line class="grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotHeight}"></line>
            <text class="axis-tick" x="${x}" y="${height - 10}" text-anchor="middle" font-size="11">${tick}</text>
          `;
        })
        .join("")}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}"></line>
      <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}"></line>
      <text class="axis-label" x="${margin.left + plotWidth / 2}" y="${height}" text-anchor="middle" font-size="12">Background knowledge score</text>
      <text class="axis-label" x="14" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${margin.top + plotHeight / 2})" font-size="12">SUS score</text>
      ${points
        .map((point) => {
          const x = margin.left + ((point.x - 1) / 4) * plotWidth;
          const y = margin.top + plotHeight - (point.y / 100) * plotHeight - point.offset * 6;
          return `
            <circle class="point-dot" cx="${x}" cy="${y}" r="6">
              <title>${escapeHtml(`${point.label}: background ${point.x.toFixed(2)}, SUS ${point.y.toFixed(1)}`)}</title>
            </circle>
            <text class="point-label" x="${x + 8}" y="${y - 8}" font-size="11">${escapeHtml(point.label)}</text>
          `;
        })
        .join("")}
    </svg>
  `;

  container.innerHTML = `
    <h3>Background knowledge vs. SUS</h3>
    <p class="muted-copy">Structured background familiarity and reading comfort are averaged into a knowledge score from 1 to 5.</p>
    ${svg}
  `;
}

function renderBackgroundDistribution(responses) {
  const container = document.getElementById("background-distribution");
  const levels = Object.keys(comfortScoreMap);

  if (!responses.length) {
    container.innerHTML = emptyState("Background knowledge distribution will appear after the first response.");
    return;
  }

  const rows = levels.map((label) => ({
    label,
    value: responses.filter((response) => response.backgroundComfort === label).length,
    max: responses.length
  }));

  container.innerHTML = `
    <h3>Background comfort distribution</h3>
    <p class="muted-copy">How comfortable participants are with official documents and government communication.</p>
    ${renderBarChart(rows, { soft: true, integer: true })}
  `;
}

function renderSusDistribution(responses) {
  const container = document.getElementById("sus-distribution");
  const buckets = [
    { label: "0-49", min: 0, max: 49.99 },
    { label: "50-67", min: 50, max: 67.99 },
    { label: "68-79", min: 68, max: 79.99 },
    { label: "80-100", min: 80, max: 100 }
  ];

  if (!responses.length) {
    container.innerHTML = emptyState("SUS distribution will appear after the first response.");
    return;
  }

  const rows = buckets.map((bucket) => ({
    label: bucket.label,
    value: responses.filter((response) => response.susScore >= bucket.min && response.susScore <= bucket.max).length,
    max: responses.length
  }));

  container.innerHTML = `
    <h3>SUS score distribution</h3>
    <p class="muted-copy">A quick view of how responses cluster across lower and higher usability bands.</p>
    ${renderBarChart(rows, { integer: true })}
  `;
}

function renderTaskOutcomeChart(responses) {
  const container = document.getElementById("task-outcome-chart");

  if (!responses.length) {
    container.innerHTML = emptyState("Task outcome trends will appear after the first response.");
    return;
  }

  const rows = taskDefinitions.map((task) => {
    const matched = responses.filter((response) => matchesSuccess(task, response[task.statusKey])).length;
    return {
      label: task.title.replace("Task ", "T"),
      detail: task.statusLabel,
      value: matched,
      max: responses.length
    };
  });

  container.innerHTML = `
    <h3>Task outcome rates</h3>
    <p class="muted-copy">Share of participants who met the strongest success signal for each task.</p>
    ${renderBarChart(rows, { integer: true })}
  `;
}

function renderTaskSummary(responses) {
  const taskSummary = document.getElementById("task-summary");

  if (!responses.length) {
    taskSummary.innerHTML = emptyState("Task outcome cards will appear after the first response.");
    return;
  }

  const cards = taskDefinitions.map((task) => {
    const matched = responses.filter((response) => matchesSuccess(task, response[task.statusKey])).length;
    const themes = extractThemes(responses.flatMap((response) => task.responseKeys.map((key) => response[key]))).slice(0, 3);

    return {
      title: task.title,
      value: `${matched} / ${responses.length}`,
      detail: `${task.statusLabel}. Themes: ${themes.length ? themes.map((theme) => humanizeTheme(theme.label)).join(", ") : "none yet"}.`
    };
  });

  taskSummary.innerHTML = cards
    .map(
      (card) => `
        <article class="task-card">
          <h3>${card.title}</h3>
          <strong>${card.value}</strong>
          <p>${card.detail}</p>
        </article>
      `
    )
    .join("");
}

function renderTaskThemes(responses, aiInsights) {
  const container = document.getElementById("task-themes");

  if (!responses.length) {
    container.innerHTML = emptyState("Task-level theme analysis will appear after the first response.");
    return;
  }

  container.innerHTML = taskDefinitions
    .map((task) => {
      const texts = responses.flatMap((response) => task.responseKeys.map((key) => response[key]));
      const themes = extractThemes(texts).slice(0, 4);
      const matched = responses.filter((response) => matchesSuccess(task, response[task.statusKey])).length;
      const summary = aiInsights?.taskThemes?.[task.id] || buildTaskThemeSummary(task, themes, matched, responses.length);

      return `
        <article class="task-theme-card">
          <h3>${task.title}</h3>
          ${renderInsightSource(aiInsights)}
          <p class="muted-copy">${escapeHtml(summary)}</p>
          ${renderThemeChips(themes)}
        </article>
      `;
    })
    .join("");
}

function buildTaskThemeSummary(task, themes, matched, total) {
  const themeSummary = themes.length ? themes.map((theme) => humanizeTheme(theme.label)).join(", ") : "no clear themes yet";
  return `${matched} of ${total} participants hit the strongest success signal for ${task.statusLabel.toLowerCase()}. Dominant themes: ${themeSummary}.`;
}

function summarizeCount(responses, key, expectedValue) {
  if (!responses.length) {
    return "0 / 0";
  }

  const hits = responses.filter((response) => response[key] === expectedValue).length;
  return `${hits} / ${responses.length}`;
}

function renderResponses(responses) {
  const container = document.getElementById("responses-list");

  if (!responses.length) {
    container.innerHTML = '<article class="response-card"><h3>No responses yet</h3><p>Submit the survey to start collecting session data.</p></article>';
    return;
  }

  container.innerHTML = responses
    .slice()
    .reverse()
    .map((response) => {
      const candidateTaskRow = taskDefinitions
        .map((task) => `
          <div class="task-pill">
            <strong>${task.title.replace(":", "")}</strong>
            <span>${escapeHtml(formatTaskValue(response[task.statusKey]))}</span>
          </div>
        `)
        .join("");

      const highlights = [response.closingUseful, response.closingConfusing, response.sessionSummary]
        .filter(Boolean)
        .map((value) => `<li>${escapeHtml(value)}</li>`)
        .join("");

      return `
        <article class="response-card">
          <div class="candidate-header">
            <div>
              ${renderParticipantNameEditor(response)}
              <p class="muted-copy">${escapeHtml(response.researcherName || "Unknown researcher")} • ${escapeHtml(response.sessionDate || "No date")}</p>
            </div>
            <div class="candidate-actions">
              ${renderParticipantNameActions(response)}
              <button type="button" class="small-danger-button" data-action="delete-response" data-response-id="${escapeHtml(response.responseId)}">Delete score</button>
            </div>
          </div>
          <div class="candidate-metrics">
            <div class="mini-metric">
              <span>SUS</span>
              <strong>${Number(response.susScore || 0).toFixed(1)}</strong>
            </div>
            <div class="mini-metric">
              <span>Background score</span>
              <strong>${Number(response.backgroundScore || 0).toFixed(2)}</strong>
            </div>
            <div class="mini-metric">
              <span>Task 2 time</span>
              <strong>${response.task2Time ? `${escapeHtml(response.task2Time)} min` : "n/a"}</strong>
            </div>
          </div>
          <div class="candidate-task-row">${candidateTaskRow}</div>
          <div>
            <h3>Research highlights</h3>
            <ul>${highlights || "<li>No highlights recorded.</li>"}</ul>
          </div>
        </article>
      `;
    })
    .join("");
}

function handleResponseActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const responseId = button.dataset.responseId;
  if (!responseId) {
    return;
  }

  if (button.dataset.action === "edit-participant-name") {
    adminState.editingResponseId = responseId;
    renderDashboard();
    return;
  }

  if (button.dataset.action === "cancel-participant-name") {
    adminState.editingResponseId = null;
    renderDashboard();
    return;
  }

  if (button.dataset.action === "save-participant-name") {
    void saveParticipantName(responseId, button);
    return;
  }

  if (button.dataset.action === "delete-response") {
    void deleteSingleResponse(responseId);
  }
}

async function saveParticipantName(responseId, button) {
  const card = button.closest(".response-card");
  const input = card?.querySelector("[data-role='participant-name-input']");
  if (!input) {
    return;
  }

  const responses = readResponses();
  const target = responses.find((response) => getResponseRecordId(response) === responseId);

  if (!target) {
    return;
  }

  try {
    await updateStoredResponse(responseId, {
      ...target,
      participantId: input.value.trim() || "Unnamed participant"
    });
    adminState.editingResponseId = null;
    renderDashboard();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to save the participant name.");
  }
}

async function deleteSingleResponse(responseId) {
  const responses = readResponses();
  const target = responses.find((response) => getResponseRecordId(response) === responseId);
  const label = target?.participantId || "this submission";
  const confirmed = window.confirm(`Delete saved score for ${label}?`);

  if (!confirmed) {
    return;
  }

  try {
    await deleteStoredResponse(responseId);
    adminState.editingResponseId = null;
    renderDashboard();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to delete the response.");
  }
}

function renderParticipantNameEditor(response) {
  const currentName = escapeHtml(response.participantId || "Unnamed participant");
  if (adminState.editingResponseId !== response.responseId) {
    return `<h3>${currentName}</h3>`;
  }

  return `<label class="inline-edit-field">Participant name<input data-role='participant-name-input' type='text' value='${currentName}' /></label>`;
}

function renderParticipantNameActions(response) {
  if (adminState.editingResponseId !== response.responseId) {
    return `<button type="button" class="small-secondary-button" data-action="edit-participant-name" data-response-id="${escapeHtml(response.responseId)}">Edit name</button>`;
  }

  return `
    <button type="button" class="small-secondary-button" data-action="save-participant-name" data-response-id="${escapeHtml(response.responseId)}">Save name</button>
    <button type="button" class="small-secondary-button" data-action="cancel-participant-name" data-response-id="${escapeHtml(response.responseId)}">Cancel</button>
  `;
}

function exportResponses() {
  const responses = readResponses();
  const blob = new Blob([JSON.stringify(responses, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ux-research-responses-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportResponsesCsv() {
  const responses = readResponses().map(normalizeResponse);
  const rows = responses.map((response) => flattenResponseForCsv(response));
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );
  const csv = [headers.join(",")]
    .concat(rows.map((row) => headers.map((header) => escapeCsv(row[header] ?? "")).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ux-research-responses-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function flattenResponseForCsv(response) {
  const flattened = {};

  Object.entries(response).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      return;
    }

    if (value && typeof value === "object") {
      return;
    }

    flattened[key] = value;
  });

  flattened.backgroundScore = Number(response.backgroundScore || 0).toFixed(2);
  flattened.familiarityScore = response.familiarityScore || 0;
  flattened.comfortScore = response.comfortScore || 0;

  return flattened;
}

async function clearResponses() {
  const confirmed = window.confirm(
    getStorageMode() === STORAGE_MODE_SUPABASE
      ? "Delete all stored survey responses from shared storage?"
      : "Delete all stored survey responses from this browser?"
  );
  if (!confirmed) {
    return;
  }

  try {
    await clearStoredResponses();
    renderDashboard();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to clear responses.");
  }
}

function renderBarChart(rows, options = {}) {
  const { decimals = 0, integer = false, soft = false } = options;

  return `
    <div class="bar-chart">
      ${rows
        .map((row) => {
          const max = row.max || 1;
          const percentage = Math.min(100, (row.value / max) * 100);
          const formattedValue = integer ? Math.round(row.value) : Number(row.value || 0).toFixed(decimals);

          return `
            <div class="bar-row">
              <div class="bar-meta">
                <span>${escapeHtml(row.detail ? `${row.label} - ${row.detail}` : row.label)}</span>
                <strong>${formattedValue}</strong>
              </div>
              <div class="bar-track">
                <span class="bar-fill${soft ? " soft" : ""}" style="width: ${percentage}%"></span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderThemeChips(themes) {
  if (!themes.length) {
    return '<div class="chip-list"><span class="chip">No strong themes yet</span></div>';
  }

  return `
    <div class="chip-list">
      ${themes.map((theme) => `<span class="chip">${escapeHtml(humanizeTheme(theme.label))} (${theme.count})</span>`).join("")}
    </div>
  `;
}

function extractThemes(values) {
  const counts = new Map();

  values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .forEach((text) => {
      Object.entries(themeLexicon).forEach(([label, terms]) => {
        if (terms.some((term) => text.includes(term))) {
          counts.set(label, (counts.get(label) || 0) + 1);
        }
      });
    });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
}

function buildThemeSentence(prefix, themes) {
  if (!themes.length) {
    return `${prefix.toLowerCase()} are not strong enough to summarize yet.`;
  }

  const names = themes.slice(0, 3).map((theme) => humanizeTheme(theme.label));
  return `${prefix} cluster around ${names.join(", ")}.`;
}

function humanizeTheme(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (match) => match.toLowerCase())
    .replace(/\bai\b/, "AI")
    .trim();
}

function matchesSuccess(task, value) {
  return task.successValues.includes(typeof value === "string" ? value : Number(value));
}

function formatTaskValue(value) {
  if (value === undefined || value === null || value === "") {
    return "No data";
  }

  return String(value);
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function isPositiveAdoption(value) {
  return /(yes|would use|likely|useful|helpful|definitely|probably)/i.test(String(value || ""));
}

function escapeCsv(value) {
  const normalized = String(value).replaceAll('"', '""');
  return `"${normalized}"`;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderInsightSource(aiInsights) {
  if (aiInsights?.provider === "openai") {
    const generatedAt = aiInsights.generatedAt ? new Date(aiInsights.generatedAt).toLocaleString() : "recently";
    return `<div class="insight-meta"><span class="source-pill">OpenAI</span><span>Generated ${escapeHtml(generatedAt)} with ${escapeHtml(aiInsights.model || DEFAULT_OPENAI_MODEL)}</span></div>`;
  }

  return '<div class="insight-meta"><span class="source-pill">Local</span><span>Built-in heuristic summary without API usage</span></div>';
}

function loadAiSettings() {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { apiKey: "", model: DEFAULT_OPENAI_MODEL };
  } catch {
    return { apiKey: "", model: DEFAULT_OPENAI_MODEL };
  }
}

function saveAiSettings(settings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

function loadAiInsights() {
  try {
    const raw = localStorage.getItem(AI_INSIGHTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildResponsesFingerprint(responses) {
  return responses
    .map((response) => [response.participantId || "", response.sessionDate || "", response.submittedAt || ""].join("|"))
    .sort()
    .join("::");
}

function buildResponseId(response) {
  return [response.submittedAt || "", response.participantId || "", response.sessionDate || "", response.researcherName || ""]
    .join("|")
    .replaceAll('"', "");
}

function getResponseRecordId(response) {
  return response.remoteId || buildResponseId(response);
}

async function generateOpenAiInsights(responses, { apiKey, model }) {
  const dataset = responses.map((response) => ({
    participantId: response.participantId || "Unknown",
    background: {
      familiarity: response.backgroundWooFamiliarity || response.backgroundWoo || "",
      comfort: response.backgroundComfort || "",
      score: Number(response.backgroundScore || 0).toFixed(2)
    },
    susScore: Number(response.susScore || 0).toFixed(1),
    closingUseful: response.closingUseful || "",
    closingConfusing: response.closingConfusing || "",
    closingAdoption: response.closingAdoption || "",
    sessionSummary: response.sessionSummary || "",
    tasks: taskDefinitions.map((task) => ({
      taskId: task.id,
      title: task.title,
      status: response[task.statusKey] || "",
      notes: task.responseKeys.map((key) => response[key]).filter(Boolean)
    }))
  }));

  const prompt = [
    "You are a UX research analyst.",
    "Summarize the dataset into concise research insights.",
    "Return valid JSON only.",
    "Use this exact schema:",
    '{"overallSummary":"string","gainsSummary":"string","painsSummary":"string","taskThemes":{"task1":"string","task2":"string","task3":"string","task4":"string","task5":"string","task6":"string"}}',
    "Each summary should be 2-4 sentences, evidence-based, and specific to the dataset.",
    "Do not invent quotes or metrics that are not present.",
    `Dataset: ${JSON.stringify(dataset)}`
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You analyze UX research results and output strict JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }

  return {
    overallSummary: parsed.overallSummary || "",
    gainsSummary: parsed.gainsSummary || "",
    painsSummary: parsed.painsSummary || "",
    taskThemes: parsed.taskThemes || {}
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}