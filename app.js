const DATA_URL = "./data/questions_unique.json";
const STORAGE_KEY = "canmed-mcqs-progress-v1";
const NAV_PAGE_SIZE = 49;
const PIE_COLORS = {
  accuracy: "#147a42",
  remaining: "#637178",
  saved: "#b7791f",
  attempts: "#0f766e",
};

const state = {
  raw: null,
  questions: [],
  filtered: [],
  currentIndex: 0,
  selectedValue: "",
  activeFilter: "all",
  activeTab: "explanation",
  activeView: "questions",
  navPage: 0,
  progress: {
    version: 1,
    answers: {},
    bookmarks: {},
    notes: {},
    confidence: {},
    lastQuestionKey: "",
  },
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadProgress();
  loadQuestions();
});

function cacheElements() {
  [
    "app",
    "questionTools",
    "questionsView",
    "dashboardView",
    "loadStatus",
    "metricTotal",
    "metricDone",
    "metricCorrect",
    "metricWrong",
    "progressFill",
    "searchInput",
    "categoryFilter",
    "filteredCount",
    "previousTenPageButton",
    "previousPageButton",
    "pageLabel",
    "nextPageButton",
    "nextTenPageButton",
    "questionGrid",
    "randomButton",
    "questionEyebrow",
    "questionTitle",
    "bookmarkButton",
    "resetQuestionButton",
    "questionBody",
    "answerState",
    "answerOptions",
    "submitButton",
    "revealButton",
    "resultPanel",
    "resultBanner",
    "explanationPanel",
    "detailsPanel",
    "referencesPanel",
    "previousButton",
    "nextButton",
    "positionLabel",
    "accuracyMetric",
    "remainingMetric",
    "bookmarkedMetric",
    "attemptMetric",
    "performancePie",
    "categoryStats",
    "confidenceSelect",
    "noteInput",
    "exportProgressButton",
    "importProgressInput",
    "resetAllButton",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
  els.viewButtons = Array.from(document.querySelectorAll(".view-button"));
  els.segments = Array.from(document.querySelectorAll(".segment"));
  els.tabs = Array.from(document.querySelectorAll(".tab"));
}

function bindEvents() {
  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  els.searchInput.addEventListener("input", () => {
    applyFilters();
    renderAll();
  });
  els.categoryFilter.addEventListener("change", () => {
    applyFilters();
    renderAll();
  });
  els.previousTenPageButton.addEventListener("click", () => shiftNavigatorPages(-10));
  els.previousPageButton.addEventListener("click", () => shiftNavigatorPages(-1));
  els.nextPageButton.addEventListener("click", () => shiftNavigatorPages(1));
  els.nextTenPageButton.addEventListener("click", () => shiftNavigatorPages(10));
  els.segments.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter;
      els.segments.forEach((item) => item.classList.toggle("active", item === button));
      applyFilters();
      renderAll();
    });
  });
  els.randomButton.addEventListener("click", goRandom);
  els.previousButton.addEventListener("click", () => goRelative(-1));
  els.nextButton.addEventListener("click", () => goRelative(1));
  els.submitButton.addEventListener("click", submitAnswer);
  els.revealButton.addEventListener("click", revealAnswer);
  els.bookmarkButton.addEventListener("click", toggleBookmark);
  els.resetQuestionButton.addEventListener("click", resetCurrentQuestion);
  els.tabs.forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });
  els.confidenceSelect.addEventListener("change", saveCurrentMeta);
  els.noteInput.addEventListener("input", debounce(saveCurrentMeta, 250));
  els.exportProgressButton.addEventListener("click", exportProgress);
  els.importProgressInput.addEventListener("change", importProgress);
  els.resetAllButton.addEventListener("click", resetAllProgress);
}

function setView(viewName) {
  state.activeView = viewName === "dashboard" ? "dashboard" : "questions";
  renderView();
}

function renderView() {
  const isDashboard = state.activeView === "dashboard";
  els.app.classList.toggle("dashboard-mode", isDashboard);
  els.questionsView.classList.toggle("hidden", isDashboard);
  els.dashboardView.classList.toggle("hidden", !isDashboard);
  els.questionTools.classList.toggle("hidden", isDashboard);
  els.viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
}

async function loadQuestions() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Unable to load data: ${response.status}`);
    }
    state.raw = await response.json();
    state.questions = state.raw.questions.map(normalizeQuestion);
    buildCategoryFilter();
    restoreLastQuestion();
    applyFilters(false);
    renderAll();
    els.loadStatus.textContent = `${state.questions.length.toLocaleString()} questions ready`;
  } catch (error) {
    els.loadStatus.textContent = "Question bank failed to load";
    els.questionBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function normalizeQuestion(entry, index) {
  const q = entry.question || {};
  const options = (q.options || []).map((option, optionIndex) => {
    const parsed = splitOptionLabel(option.label_text_clean || option.label_text || "");
    const letter = parsed.letter || String.fromCharCode(65 + optionIndex);
    return {
      ...option,
      letter,
      displayText: parsed.text,
      displayHtml: stripOptionPrefix(option.label_html || option.label_text_clean || option.label_text || "", letter),
      correct: Boolean(option.is_correct_by_class),
    };
  });
  const correct = options.find((option) => option.correct);
  const category = getQuestionCategory(q);
  const title = q.question_title || `Question ${index + 1}`;
  const bodyText = q.question_org_body_text || q.question_body_text || "";
  const optionText = options.map((option) => option.displayText).join(" ");

  return {
    key: String(entry.dedupe_key || q.dedupe_key || q.content_hash || index),
    index,
    q,
    options,
    correctValue: correct ? String(correct.input_value ?? correct.letter) : "",
    title,
    category,
    searchText: `${title} ${category} ${bodyText} ${optionText}`.toLowerCase(),
  };
}

function getQuestionCategory(q) {
  const category = q.category_name || (q.app_question || {}).category_name;
  const cleaned = String(category || "").trim();
  return cleaned || "Uncategorized";
}

function buildCategoryFilter() {
  const categories = Array.from(new Set(state.questions.map((question) => question.category))).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.categoryFilter.appendChild(option);
  }
}

function restoreLastQuestion() {
  if (!state.progress.lastQuestionKey) return;
  const found = state.questions.find((question) => question.key === state.progress.lastQuestionKey);
  if (found) state.currentIndex = found.index;
}

function applyFilters(keepCurrent = true) {
  const search = els.searchInput.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  state.filtered = state.questions.filter((question) => {
    const record = state.progress.answers[question.key];
    const isAnswered = Boolean(record);
    const isWrong = Boolean(record && record.correct === false);
    const isBookmarked = Boolean(state.progress.bookmarks[question.key]);
    if (category !== "all" && question.category !== category) return false;
    if (search && !question.searchText.includes(search)) return false;
    if (state.activeFilter === "unanswered" && isAnswered) return false;
    if (state.activeFilter === "wrong" && !isWrong) return false;
    if (state.activeFilter === "bookmarked" && !isBookmarked) return false;
    return true;
  });

  if (!state.filtered.length) {
    state.navPage = 0;
    return;
  }

  if (keepCurrent && state.filtered.some((question) => question.index === state.currentIndex)) {
    syncNavigatorPageToCurrent();
    return;
  }
  state.currentIndex = state.filtered[0].index;
  state.selectedValue = "";
  state.navPage = 0;
}

function renderAll() {
  renderStats();
  renderNavigator();
  renderQuestion();
  renderCategoryStats();
  renderView();
}

function renderStats() {
  const total = state.questions.length;
  const records = Object.values(state.progress.answers);
  const done = records.length;
  const correct = records.filter((record) => record.correct).length;
  const wrong = records.filter((record) => record.correct === false).length;
  const attempts = records.reduce((sum, record) => sum + (record.attempts || 1), 0);
  const bookmarked = Object.values(state.progress.bookmarks).filter(Boolean).length;
  const accuracy = done ? Math.round((correct / done) * 100) : 0;
  const remaining = Math.max(total - done, 0);

  els.metricTotal.textContent = total.toLocaleString();
  els.metricDone.textContent = done.toLocaleString();
  els.metricCorrect.textContent = correct.toLocaleString();
  els.metricWrong.textContent = wrong.toLocaleString();
  els.progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
  els.accuracyMetric.textContent = `${accuracy}%`;
  els.remainingMetric.textContent = remaining.toLocaleString();
  els.bookmarkedMetric.textContent = bookmarked.toLocaleString();
  els.attemptMetric.textContent = attempts.toLocaleString();
  renderPerformancePie({ accuracy, remaining, bookmarked, attempts });
}

function renderPerformancePie({ accuracy, remaining, bookmarked, attempts }) {
  const slices = [
    { label: "Accuracy", value: accuracy, color: PIE_COLORS.accuracy },
    { label: "Remaining", value: remaining, color: PIE_COLORS.remaining },
    { label: "Saved", value: bookmarked, color: PIE_COLORS.saved },
    { label: "Attempts", value: attempts, color: PIE_COLORS.attempts },
  ].filter((slice) => slice.value > 0);

  if (!slices.length) {
    els.performancePie.style.background = "var(--soft)";
    els.performancePie.setAttribute("aria-label", "No performance data yet");
    return;
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    cursor += (slice.value / total) * 100;
    return `${slice.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  els.performancePie.style.background = `conic-gradient(${stops.join(", ")})`;
  els.performancePie.setAttribute(
    "aria-label",
    slices.map((slice) => `${slice.label}: ${slice.value.toLocaleString()}`).join(", ")
  );
}

function renderNavigator() {
  els.filteredCount.textContent = `${state.filtered.length.toLocaleString()} questions`;
  const pageCount = getNavigatorPageCount();
  state.navPage = Math.min(Math.max(state.navPage, 0), pageCount - 1);
  const start = state.navPage * NAV_PAGE_SIZE;
  const end = Math.min(start + NAV_PAGE_SIZE, state.filtered.length);
  const pageQuestions = state.filtered.slice(start, end);
  els.pageLabel.textContent = state.filtered.length
    ? `Page ${state.navPage + 1} / ${pageCount}`
    : "Page 0 / 0";
  els.previousTenPageButton.disabled = state.navPage <= 0;
  els.previousPageButton.disabled = state.navPage <= 0;
  els.nextPageButton.disabled = state.navPage >= pageCount - 1;
  els.nextTenPageButton.disabled = state.navPage >= pageCount - 1;
  const fragment = document.createDocumentFragment();
  for (const question of pageQuestions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "question-cell";
    button.textContent = String(question.index + 1);
    button.title = question.title;
    const record = state.progress.answers[question.key];
    if (question.index === state.currentIndex) button.classList.add("active");
    if (record?.correct) button.classList.add("correct");
    if (record && record.correct === false) button.classList.add("wrong");
    if (state.progress.bookmarks[question.key]) button.classList.add("saved");
    button.addEventListener("click", () => {
      state.currentIndex = question.index;
      state.selectedValue = "";
      syncNavigatorPageToCurrent();
      renderAll();
      saveProgress();
    });
    fragment.appendChild(button);
  }
  els.questionGrid.replaceChildren(fragment);
}

function shiftNavigatorPages(delta) {
  const pageCount = getNavigatorPageCount();
  state.navPage = Math.min(Math.max(state.navPage + delta, 0), pageCount - 1);
  renderNavigator();
}

function getNavigatorPageCount() {
  return Math.max(1, Math.ceil(state.filtered.length / NAV_PAGE_SIZE));
}

function syncNavigatorPageToCurrent() {
  const position = state.filtered.findIndex((question) => question.index === state.currentIndex);
  if (position >= 0) {
    state.navPage = Math.floor(position / NAV_PAGE_SIZE);
  }
}

function renderQuestion() {
  if (!state.questions.length) return;
  if (!state.filtered.length) {
    els.questionEyebrow.textContent = "No matches";
    els.questionTitle.textContent = "No matching questions";
    els.questionBody.innerHTML = '<div class="empty-state">No questions match the current filters.</div>';
    els.answerOptions.replaceChildren();
    els.resultPanel.classList.add("hidden");
    els.answerState.textContent = "Not answered";
    els.answerState.className = "state-pill";
    els.positionLabel.textContent = "0 / 0";
    return;
  }
  const question = getCurrentQuestion();
  if (!question) {
    els.questionTitle.textContent = "No matching questions";
    els.questionBody.innerHTML = '<div class="empty-state">No questions match the current filters.</div>';
    els.answerOptions.replaceChildren();
    els.resultPanel.classList.add("hidden");
    els.positionLabel.textContent = "0 / 0";
    return;
  }

  const record = state.progress.answers[question.key];
  const revealed = Boolean(record?.revealed || record);
  els.questionEyebrow.textContent = `Question ${question.index + 1} of ${state.questions.length} - ${question.category}`;
  els.questionTitle.textContent = question.title;
  setHtml(els.questionBody, getQuestionHtml(question), question);
  renderOptions(question, record);
  renderResult(question, record, revealed);
  els.bookmarkButton.textContent = state.progress.bookmarks[question.key] ? "Saved" : "Save";
  els.confidenceSelect.value = state.progress.confidence[question.key] || "";
  els.noteInput.value = state.progress.notes[question.key] || "";
  const filteredPosition = state.filtered.findIndex((item) => item.index === question.index) + 1;
  els.positionLabel.textContent = `${filteredPosition || 0} / ${state.filtered.length || 0}`;
  state.progress.lastQuestionKey = question.key;
  saveProgress();
}

function renderOptions(question, record) {
  const reveal = Boolean(record);
  const fragment = document.createDocumentFragment();
  for (const option of question.options) {
    const value = String(option.input_value ?? option.letter);
    const selected = state.selectedValue ? state.selectedValue === value : record?.selectedValue === value;
    const label = document.createElement("label");
    label.className = "answer-option";
    if (selected) label.classList.add("selected");
    if (reveal && option.correct) label.classList.add("correct-answer");
    if (reveal && selected && !option.correct) label.classList.add("wrong-answer");

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = value;
    input.checked = selected;
    input.disabled = reveal;
    input.addEventListener("change", () => {
      state.selectedValue = value;
      renderOptions(question, record);
    });

    const optionBody = document.createElement("div");
    optionBody.className = "option-label";
    const html = `<span class="option-letter">${escapeHtml(option.letter)}</span>${option.displayHtml || escapeHtml(option.displayText)}`;
    setHtml(optionBody, html, question);

    label.append(input, optionBody);
    fragment.appendChild(label);
  }
  els.answerOptions.replaceChildren(fragment);

  if (!record) {
    els.answerState.textContent = "Not answered";
    els.answerState.className = "state-pill";
  } else if (record.correct) {
    els.answerState.textContent = "Correct";
    els.answerState.className = "state-pill correct";
  } else {
    els.answerState.textContent = "Incorrect";
    els.answerState.className = "state-pill wrong";
  }
  els.submitButton.disabled = Boolean(record);
}

function renderResult(question, record, revealed) {
  els.resultPanel.classList.toggle("hidden", !revealed);
  if (!revealed) return;

  if (record?.correct) {
    els.resultBanner.textContent = "Correct.";
    els.resultBanner.className = "result-banner correct";
  } else if (record && record.correct === false) {
    const correct = question.options.find((option) => option.correct);
    els.resultBanner.textContent = `Incorrect. Correct answer: ${correct?.letter || ""}. ${correct?.displayText || ""}`;
    els.resultBanner.className = "result-banner wrong";
  } else {
    const correct = question.options.find((option) => option.correct);
    els.resultBanner.textContent = `Correct answer: ${correct?.letter || ""}. ${correct?.displayText || ""}`;
    els.resultBanner.className = "result-banner revealed";
  }

  setHtml(els.explanationPanel, question.q.qebody_inner_html || question.q.answerdesc_inner_html || "<p>No explanation saved.</p>", question);
  setHtml(els.detailsPanel, question.q.more_detail_html || "<p>No additional details saved.</p>", question);
  setHtml(els.referencesPanel, question.q.references_html || "<p>No references saved.</p>", question);
  setTab(state.activeTab);
}

function submitAnswer() {
  const question = getCurrentQuestion();
  if (!question || state.progress.answers[question.key]) return;
  const selected = state.selectedValue || document.querySelector('input[name="answer"]:checked')?.value;
  if (!selected) {
    els.answerState.textContent = "Choose an answer";
    return;
  }
  const selectedOption = question.options.find((option) => String(option.input_value ?? option.letter) === selected);
  const correct = Boolean(selectedOption?.correct);
  const existing = state.progress.answers[question.key];
  state.progress.answers[question.key] = {
    selectedValue: selected,
    selectedLetter: selectedOption?.letter || "",
    correct,
    attempts: (existing?.attempts || 0) + 1,
    answeredAt: new Date().toISOString(),
    revealed: true,
  };
  state.selectedValue = "";
  saveProgress();
  renderAll();
}

function revealAnswer() {
  const question = getCurrentQuestion();
  if (!question || state.progress.answers[question.key]) return;
  state.progress.answers[question.key] = {
    selectedValue: "",
    selectedLetter: "",
    correct: false,
    attempts: 0,
    answeredAt: new Date().toISOString(),
    revealed: true,
    revealOnly: true,
  };
  saveProgress();
  renderAll();
}

function toggleBookmark() {
  const question = getCurrentQuestion();
  if (!question) return;
  state.progress.bookmarks[question.key] = !state.progress.bookmarks[question.key];
  if (!state.progress.bookmarks[question.key]) delete state.progress.bookmarks[question.key];
  saveProgress();
  renderAll();
}

function resetCurrentQuestion() {
  const question = getCurrentQuestion();
  if (!question) return;
  delete state.progress.answers[question.key];
  state.selectedValue = "";
  saveProgress();
  renderAll();
}

function saveCurrentMeta() {
  const question = getCurrentQuestion();
  if (!question) return;
  const note = els.noteInput.value.trim();
  const confidence = els.confidenceSelect.value;
  if (note) state.progress.notes[question.key] = note;
  else delete state.progress.notes[question.key];
  if (confidence) state.progress.confidence[question.key] = confidence;
  else delete state.progress.confidence[question.key];
  saveProgress();
}

function renderCategoryStats() {
  const categoryMap = new Map();
  for (const question of state.questions) {
    if (!categoryMap.has(question.category)) categoryMap.set(question.category, { total: 0, done: 0 });
    const stats = categoryMap.get(question.category);
    stats.total += 1;
    if (state.progress.answers[question.key]) stats.done += 1;
  }
  const rows = Array.from(categoryMap.entries()).sort((a, b) => b[1].total - a[1].total);
  const fragment = document.createDocumentFragment();
  for (const [category, stats] of rows) {
    const row = document.createElement("div");
    row.className = "category-row";
    const label = document.createElement("span");
    label.textContent = category;
    label.title = category;
    const value = document.createElement("strong");
    value.textContent = `${stats.done}/${stats.total}`;
    row.append(label, value);
    fragment.appendChild(row);
  }
  els.categoryStats.replaceChildren(fragment);
}

function setTab(tabName) {
  state.activeTab = tabName;
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  els.explanationPanel.classList.toggle("hidden", tabName !== "explanation");
  els.detailsPanel.classList.toggle("hidden", tabName !== "details");
  els.referencesPanel.classList.toggle("hidden", tabName !== "references");
}

function goRelative(direction) {
  if (!state.filtered.length) return;
  const currentFilteredIndex = state.filtered.findIndex((question) => question.index === state.currentIndex);
  const nextIndex = Math.min(Math.max(currentFilteredIndex + direction, 0), state.filtered.length - 1);
  state.currentIndex = state.filtered[nextIndex].index;
  state.selectedValue = "";
  syncNavigatorPageToCurrent();
  renderAll();
}

function goRandom() {
  if (!state.filtered.length) return;
  const random = state.filtered[Math.floor(Math.random() * state.filtered.length)];
  state.currentIndex = random.index;
  state.selectedValue = "";
  syncNavigatorPageToCurrent();
  renderAll();
}

function getCurrentQuestion() {
  return state.questions[state.currentIndex] || null;
}

function getQuestionHtml(question) {
  const stem = question.q.question_org_body_inner_html || "";
  const fullBody = question.q.question_body_inner_html || "";
  if (fullBody && (/<img\b/i.test(fullBody) || /<table\b/i.test(fullBody)) && !/<img\b/i.test(stem)) {
    return fullBody;
  }
  return stem || fullBody || "<p>No question text saved.</p>";
}

function setHtml(element, html, question) {
  element.innerHTML = sanitizeHtml(html || "");
  normalizeTables(element);
  rewriteImages(element, question);
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style").forEach((node) => node.remove());
  template.content.querySelectorAll('[data-bs-target="#feedback-modal"]').forEach((node) => {
    const wrapper = node.closest(".row") || node.closest("div") || node;
    wrapper.remove();
  });
  template.content.querySelectorAll("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
  });
  return template.innerHTML;
}

function normalizeTables(container) {
  container.querySelectorAll("table").forEach((table) => {
    table.removeAttribute("width");
    table.style.removeProperty("width");
    table.style.removeProperty("min-width");
    table.style.removeProperty("max-width");
    table.querySelectorAll("col, th, td").forEach((cell) => {
      cell.removeAttribute("width");
      cell.style.removeProperty("width");
      cell.style.removeProperty("min-width");
      cell.style.removeProperty("max-width");
      cell.style.removeProperty("white-space");
    });
    if (!table.parentElement?.classList.contains("table-wrap")) {
      const wrapper = document.createElement("div");
      wrapper.className = "table-wrap";
      table.parentElement.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

function rewriteImages(container, question) {
  const lookup = new Map();
  for (const image of question.q.images || []) {
    const local = toWebAssetPath(image.local_path);
    if (!local) continue;
    [image.src, image.absolute_url].filter(Boolean).forEach((key) => lookup.set(key, local));
  }
  container.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original");
    const mapped = lookup.get(src) || lookup.get(decodeHtml(src || ""));
    if (mapped) img.setAttribute("src", mapped);
    img.removeAttribute("srcset");
    img.loading = "lazy";
  });
}

function toWebAssetPath(localPath) {
  if (!localPath) return "";
  const normalized = String(localPath).replaceAll("\\", "/");
  const assetIndex = normalized.lastIndexOf("/assets/");
  if (assetIndex >= 0) {
    const filename = normalized.slice(assetIndex + "/assets/".length).split("/").pop();
    return filename ? `./assets/${encodeURI(filename)}` : "";
  }
  if (normalized.startsWith("assets/")) return `./${encodeURI(normalized)}`;
  return normalized;
}

function splitOptionLabel(labelText) {
  const value = String(labelText || "").trim();
  const match = value.match(/^([A-Z])[\.)]\s*(.*)$/s);
  if (!match) return { letter: "", text: value };
  return { letter: match[1], text: match[2].trim() };
}

function stripOptionPrefix(html, letter) {
  const value = String(html || "");
  if (!letter) return value;
  const pattern = new RegExp(`^\\s*${letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\.)]\\s*`, "i");
  return value.replace(pattern, "");
}

function loadProgress() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    state.progress = { ...state.progress, ...JSON.parse(saved) };
    saveProgress();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `canmed-mcqs-progress-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importProgress(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result || "{}"));
      state.progress = {
        version: 1,
        answers: imported.answers || {},
        bookmarks: imported.bookmarks || {},
        notes: imported.notes || {},
        confidence: imported.confidence || {},
        lastQuestionKey: imported.lastQuestionKey || "",
      };
      saveProgress();
      applyFilters();
      renderAll();
    } catch {
      alert("Progress file could not be imported.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function resetAllProgress() {
  if (!confirm("Reset all saved progress for this browser?")) return;
  state.progress = {
    version: 1,
    answers: {},
    bookmarks: {},
    notes: {},
    confidence: {},
    lastQuestionKey: "",
  };
  state.selectedValue = "";
  saveProgress();
  applyFilters();
  renderAll();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
