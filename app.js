const surveyData = globalThis.surveyData;

const STORAGE_KEY = "questionnaire-suite-v2";
const DRAFT_FILE_KIND = "questionnaire-suite-draft";
const DRAFT_FILE_VERSION = 2;
const APP_TITLE = "Готовность к совместной работе: диагностика для участников ИТ-проектов";

const EMAILJS_PUBLIC_KEY = String(globalThis.QUESTIONNAIRE_EMAILJS_PUBLIC_KEY || "").trim();
const EMAILJS_SERVICE_ID = String(globalThis.QUESTIONNAIRE_EMAILJS_SERVICE_ID || "").trim();
const EMAILJS_TEMPLATE_ID = String(globalThis.QUESTIONNAIRE_EMAILJS_TEMPLATE_ID || "").trim();
const EMAILJS_API_URL = "https://api.emailjs.com/api/v1.0/email/send";

document.title = APP_TITLE;

const stageOrder = ["intro", "passport", "cooperation", "kupreychenko", "trsi", "opm2", "review", "done"];
const stageLabels = {
  intro: "Перед началом",
  passport: "Профиль участника",
  cooperation: "Сотрудничество",
  kupreychenko: "Доверие",
  trsi: "ТРСИ",
  opm2: "ОПМ-2",
  review: "Результаты",
  done: "Завершение",
};
let radarChartCounter = 0;

const passportSelectLabels = {
  male: "Мужской",
  female: "Женский",
  initiator: "Инициатор изменений",
  implementer: "Внедренец изменений",
  affected: "Изменения затрагивают меня и мою работу",
};

const projectRoleValues = ["initiator", "implementer", "affected"];

const app = document.querySelector("#app");
const state = loadState();
const demoMode = new URL(location.href).searchParams.get("demo") === "review";

if (demoMode) {
  Object.assign(state, createDemoReviewState());
}

app.addEventListener("click", handleClick);
app.addEventListener("change", handleChange);
app.addEventListener("input", handleInput);

queueMicrotask(render);

function createInitialState() {
  return {
    stage: "intro",
    cursor: {
      cooperationPage: 0,
      kupreychenkoPage: 0,
      trsiPage: 0,
      opm2Page: 0,
    },
    passport: {
      position: "",
      gender: "",
      age: "",
      totalExperienceYears: "",
      roleInProject: [],
      influenceOnProject: false,
      hasSubordinates: false,
    },
    followup: {
      wantDetailedReport: false,
      email: "",
    },
    answers: {
      cooperation: surveyData.methodologies.cooperation.questions.map(() => null),
      kupreychenko: surveyData.methodologies.kupreychenko.questions.map(() => ({
        trust: null,
        distrust: null,
      })),
      trsi: surveyData.methodologies.trsi.questions.map(() => null),
      opm2: surveyData.methodologies.opm2.questions.map(() => null),
    },
    meta: {
      lastSavedAt: null,
      completedAt: null,
      lastImportedAt: null,
      submittedAt: null,
      submissionMode: null,
      submissionId: null,
    },
  };
}

function createDemoReviewState() {
  return {
    stage: "review",
    cursor: {
      cooperationPage: getPageCount("cooperation") - 1,
      kupreychenkoPage: getPageCount("kupreychenko") - 1,
      trsiPage: getPageCount("trsi") - 1,
      opm2Page: getPageCount("opm2") - 1,
    },
    passport: {
      position: "Руководитель проекта",
      gender: "male",
      age: "34",
      totalExperienceYears: "10",
      roleInProject: ["initiator", "implementer"],
      influenceOnProject: true,
      hasSubordinates: true,
    },
    followup: {
      wantDetailedReport: false,
      email: "",
    },
    answers: {
      cooperation: Array.from({ length: 25 }, (_, index) => (index % 3 === 0 ? "yes" : "no")),
      kupreychenko: Array.from({ length: 20 }, (_, index) => ({
        trust: ((index % 5) + 1),
        distrust: 5 - (index % 5),
      })),
      trsi: Array.from({ length: 48 }, (_, index) => ((index % 4) + 1)),
      opm2: Array.from({ length: 20 }, (_, index) => ((index % 5) + 1)),
    },
    meta: {
      lastSavedAt: new Date().toISOString(),
      completedAt: null,
      lastImportedAt: null,
      submittedAt: null,
      submissionMode: "demo",
      submissionId: "demo-review",
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState();
    }
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim());
    const imported = coerceImportedDraft(parsed);
    return normalizeLoadedState(imported || parsed);
  } catch {
    return createInitialState();
  }
}

function normalizeLoadedState(raw) {
  const fresh = createInitialState();
  const source = raw?.kind === DRAFT_FILE_KIND && raw?.state ? raw.state : raw;
  if (!source || typeof source !== "object") {
    return fresh;
  }

  const passport = source.passport || {};
  const followup = source.followup || {};
  const answers = source.answers || {};

  return {
    ...fresh,
    stage: stageOrder.includes(source.stage) ? source.stage : fresh.stage,
    cursor: {
      cooperationPage: clamp(Number.isInteger(source?.cursor?.cooperationPage) ? source.cursor.cooperationPage : fresh.cursor.cooperationPage, 0, getPageCount("cooperation") - 1),
      kupreychenkoPage: clamp(Number.isInteger(source?.cursor?.kupreychenkoPage) ? source.cursor.kupreychenkoPage : fresh.cursor.kupreychenkoPage, 0, getPageCount("kupreychenko") - 1),
      trsiPage: clamp(Number.isInteger(source?.cursor?.trsiPage) ? source.cursor.trsiPage : fresh.cursor.trsiPage, 0, getPageCount("trsi") - 1),
      opm2Page: clamp(Number.isInteger(source?.cursor?.opm2Page) ? source.cursor.opm2Page : fresh.cursor.opm2Page, 0, getPageCount("opm2") - 1),
    },
    passport: {
      ...fresh.passport,
      position: typeof passport.position === "string" ? passport.position : fresh.passport.position,
      gender: typeof passport.gender === "string" ? passport.gender : fresh.passport.gender,
      age: typeof passport.age === "string" || typeof passport.age === "number" ? String(passport.age) : fresh.passport.age,
      totalExperienceYears: typeof passport.totalExperienceYears === "string" || typeof passport.totalExperienceYears === "number" ? String(passport.totalExperienceYears) : fresh.passport.totalExperienceYears,
      roleInProject: normalizeProjectRoles(passport.roleInProject),
      influenceOnProject: Boolean(passport.influenceOnProject),
      hasSubordinates: Boolean(passport.hasSubordinates),
    },
    followup: {
      wantDetailedReport: Boolean(followup.wantDetailedReport ?? passport.wantDetailedReport),
      email: typeof followup.email === "string" ? followup.email : typeof passport.email === "string" ? passport.email : "",
    },
    answers: {
      cooperation: fresh.answers.cooperation.map((_, index) => {
        const value = answers.cooperation?.[index];
        return value === "yes" || value === "no" ? value : null;
      }),
      kupreychenko: fresh.answers.kupreychenko.map((entry, index) => {
        const incoming = answers.kupreychenko?.[index] || {};
        return {
          trust: isValidScaleValue(incoming.trust, 1, 5) ? Number(incoming.trust) : entry.trust,
          distrust: isValidScaleValue(incoming.distrust, 1, 5) ? Number(incoming.distrust) : entry.distrust,
        };
      }),
      trsi: fresh.answers.trsi.map((_, index) => {
        const value = answers.trsi?.[index];
        return isValidScaleValue(value, 1, 4) ? Number(value) : null;
      }),
      opm2: fresh.answers.opm2.map((_, index) => {
        const value = answers.opm2?.[index];
        return isValidScaleValue(value, 1, 5) ? Number(value) : null;
      }),
    },
    meta: {
      ...fresh.meta,
      lastSavedAt: typeof source?.meta?.lastSavedAt === "string" ? source.meta.lastSavedAt : null,
      completedAt: typeof source?.meta?.completedAt === "string" ? source.meta.completedAt : null,
      lastImportedAt: typeof source?.meta?.lastImportedAt === "string" ? source.meta.lastImportedAt : null,
    },
  };
}

function convertResultPayloadToDraftState(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const respondent = raw?.meta?.respondent || {};
  const followup = raw?.meta?.followup || {};
  const cooperationAnswers = Array.isArray(raw?.cooperation?.answers) ? raw.cooperation.answers : null;
  const kupreychenkoQuestions = Array.isArray(raw?.kupreychenko?.questions) ? raw.kupreychenko.questions : null;
  const trsiQuestions = Array.isArray(raw?.trsi?.questions) ? raw.trsi.questions : null;
  const opm2Questions = Array.isArray(raw?.opm2?.questions) ? raw.opm2.questions : null;

  if (!cooperationAnswers || !kupreychenkoQuestions || !trsiQuestions || !opm2Questions) {
    return null;
  }

  const fresh = createInitialState();
  return {
    kind: DRAFT_FILE_KIND,
    version: DRAFT_FILE_VERSION,
    savedAt: typeof raw?.meta?.timestamp === "string" ? raw.meta.timestamp : new Date().toISOString(),
    state: {
      ...fresh,
      stage: "done",
      passport: {
        ...fresh.passport,
        position: typeof respondent.position === "string" ? respondent.position : "",
        gender: typeof respondent.gender === "string" ? respondent.gender : "",
        age: respondent.age === null || respondent.age === undefined ? "" : String(respondent.age),
        totalExperienceYears:
          respondent.total_experience_years === null || respondent.total_experience_years === undefined
            ? ""
            : String(respondent.total_experience_years),
        roleInProject: normalizeProjectRoles(respondent.role_in_project),
        influenceOnProject: Boolean(respondent.influence_on_project),
        hasSubordinates: Boolean(respondent.has_subordinates),
      },
      followup: {
        ...fresh.followup,
        wantDetailedReport: Boolean(followup.want_detailed_report ?? followup.wantDetailedReport),
        email: typeof followup.detailed_report_email === "string"
          ? followup.detailed_report_email
          : typeof followup.email === "string"
            ? followup.email
            : "",
      },
      answers: {
        cooperation: fresh.answers.cooperation.map((_, index) => {
          const value = cooperationAnswers[index];
          return value === "yes" || value === "no" ? value : null;
        }),
        kupreychenko: fresh.answers.kupreychenko.map((entry, index) => {
          const item = kupreychenkoQuestions[index] || {};
          return {
            trust: isValidScaleValue(item.trust, 1, 5) ? Number(item.trust) : entry.trust,
            distrust: isValidScaleValue(item.distrust, 1, 5) ? Number(item.distrust) : entry.distrust,
          };
        }),
        trsi: fresh.answers.trsi.map((_, index) => {
          const item = trsiQuestions[index];
          const value = item?.answer;
          return isValidScaleValue(value, 1, 4) ? Number(value) : null;
        }),
        opm2: fresh.answers.opm2.map((_, index) => {
          const item = opm2Questions[index];
          const value = item?.answer;
          return isValidScaleValue(value, 1, 5) ? Number(value) : null;
        }),
      },
      meta: {
        ...fresh.meta,
        lastSavedAt: typeof raw?.meta?.timestamp === "string" ? raw.meta.timestamp : null,
        completedAt: typeof raw?.meta?.completedAt === "string" ? raw.meta.completedAt : null,
        lastImportedAt: null,
        submittedAt: typeof raw?.meta?.timestamp === "string" ? raw.meta.timestamp : null,
        submissionMode: "imported",
      },
    },
  };
}

function coerceImportedDraft(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  if (raw.kind === DRAFT_FILE_KIND && raw.state) {
    return raw;
  }

  if (raw.passport && raw.answers) {
    return {
      kind: DRAFT_FILE_KIND,
      version: typeof raw.version === "number" ? raw.version : DRAFT_FILE_VERSION,
      savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
      state: raw,
    };
  }

  return convertResultPayloadToDraftState(raw);
}

function saveState() {
  state.meta.lastSavedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors on restricted file:// contexts.
  }
}

function removeState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors on restricted file:// contexts.
  }
}

function createDraftSnapshot() {
  return {
    kind: DRAFT_FILE_KIND,
    version: DRAFT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state)),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isFilled(value) {
  return value !== null && value !== undefined && value !== "";
}

function isValidScaleValue(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

function normalizeProjectRoles(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.filter((item) => projectRoleValues.includes(item))));
  }
  if (typeof value === "string" && projectRoleValues.includes(value)) {
    return [value];
  }
  return [];
}

function splitTextIntoTwoLines(text, targetLength = 34, maxLines = 3) {
  const clean = String(text || "").trim();
  if (!clean) {
    return [];
  }
  if (clean.length <= targetLength) {
    return [clean];
  }
  const words = clean.split(/\s+/);
  if (words.length < 2) {
    return [clean];
  }

  const scoreLines = (lines) => {
    if (!lines.length) {
      return Infinity;
    }
    const lengths = lines.map((line) => line.length);
    const longest = Math.max(...lengths);
    const totalDeviation = lengths.reduce((sum, length) => sum + Math.abs(length - targetLength), 0);
    const overLimitPenalty = Math.max(0, longest - targetLength) * 3;
    const lineCountPenalty = Math.max(0, lines.length - 1) * 1.5;
    return totalDeviation + overLimitPenalty + lineCountPenalty;
  };

  const findBestSplit = (lineCount) => {
    if (lineCount <= 1 || words.length < lineCount) {
      return [clean];
    }

    let bestLines = [clean];
    let bestScore = Infinity;

    if (lineCount === 2) {
      for (let first = 1; first <= words.length - 1; first += 1) {
        const lines = [
          words.slice(0, first).join(" "),
          words.slice(first).join(" "),
        ];
        const score = scoreLines(lines);
        if (score < bestScore) {
          bestScore = score;
          bestLines = lines;
        }
      }
      return bestLines;
    }

    if (lineCount === 3) {
      for (let first = 1; first <= words.length - 2; first += 1) {
        for (let second = first + 1; second <= words.length - 1; second += 1) {
          const lines = [
            words.slice(0, first).join(" "),
            words.slice(first, second).join(" "),
            words.slice(second).join(" "),
          ];
          const score = scoreLines(lines);
          if (score < bestScore) {
            bestScore = score;
            bestLines = lines;
          }
        }
      }
      return bestLines;
    }

    return [clean];
  };

  const twoLineSplit = findBestSplit(2);
  if (maxLines < 3 || words.length < 4) {
    return twoLineSplit;
  }

  const threeLineSplit = findBestSplit(3);
  if (threeLineSplit.length < 3) {
    return twoLineSplit;
  }

  const twoLineScore = scoreLines(twoLineSplit);
  const threeLineScore = scoreLines(threeLineSplit);
  return threeLineScore <= twoLineScore + 1 ? threeLineSplit : twoLineSplit;
}

function countFilled(values) {
  return values.reduce((sum, value) => sum + (isFilled(value) ? 1 : 0), 0);
}

function uniqueAnswers(values) {
  const filled = values.filter(isFilled);
  return new Set(filled).size === filled.length;
}

function mean(values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) {
    return null;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function roundScore(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

function formatScorePair(first, second) {
  return `${roundScore(first)} / ${roundScore(second)}`;
}

function formatSignedScore(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function getMethodData(methodKey) {
  return surveyData.methodologies[methodKey];
}

function getPageCount(methodKey) {
  const method = getMethodData(methodKey);
  return Math.ceil(method.questions.length / method.pageSize);
}

function getMethodCursorKey(methodKey) {
  return `${methodKey}Page`;
}

function getMethodAnsweredCount(methodKey) {
  if (methodKey === "cooperation") {
    return countFilled(state.answers.cooperation);
  }
  if (methodKey === "kupreychenko") {
    return state.answers.kupreychenko.reduce(
      (sum, entry) => sum + (Number.isInteger(entry.trust) && Number.isInteger(entry.distrust) ? 1 : 0),
      0,
    );
  }
  if (methodKey === "trsi") {
    return countFilled(state.answers.trsi);
  }
  if (methodKey === "opm2") {
    return countFilled(state.answers.opm2);
  }
  return 0;
}

function getTotalAnswered() {
  return getMethodAnsweredCount("cooperation")
    + getMethodAnsweredCount("kupreychenko")
    + getMethodAnsweredCount("trsi")
    + getMethodAnsweredCount("opm2");
}

function isPositiveNumberField(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function isPassportComplete() {
  const p = state.passport;
  return Boolean(
    String(p.position).trim()
    && String(p.gender).trim()
    && isPositiveNumberField(p.age)
    && isPositiveNumberField(p.totalExperienceYears)
    && (Array.isArray(p.roleInProject) ? p.roleInProject.length > 0 : String(p.roleInProject).trim())
  );
}

function isFollowupComplete() {
  return true;
}

function isCurrentPageComplete(methodKey) {
  const method = getMethodData(methodKey);
  const pageIndex = state.cursor[getMethodCursorKey(methodKey)];
  const start = pageIndex * method.pageSize;
  const end = Math.min(start + method.pageSize, method.questions.length);
  const items = method.questions.slice(start, end);

  if (methodKey === "cooperation") {
    return items.every((_, offset) => isFilled(state.answers.cooperation[start + offset]));
  }

  if (methodKey === "kupreychenko") {
    return items.every((_, offset) => {
      const entry = state.answers.kupreychenko[start + offset];
      return Number.isInteger(entry.trust) && Number.isInteger(entry.distrust);
    });
  }

  if (methodKey === "trsi") {
    return items.every((_, offset) => Number.isInteger(state.answers.trsi[start + offset]));
  }

  if (methodKey === "opm2") {
    return items.every((_, offset) => Number.isInteger(state.answers.opm2[start + offset]));
  }

  return true;
}

function isMethodComplete(methodKey) {
  if (methodKey === "cooperation") {
    return state.answers.cooperation.every(isFilled);
  }
  if (methodKey === "kupreychenko") {
    return state.answers.kupreychenko.every((entry) => Number.isInteger(entry.trust) && Number.isInteger(entry.distrust));
  }
  if (methodKey === "trsi") {
    return state.answers.trsi.every((value) => Number.isInteger(value));
  }
  if (methodKey === "opm2") {
    return state.answers.opm2.every((value) => Number.isInteger(value));
  }
  return false;
}

function isReviewComplete() {
  return isPassportComplete()
    && isMethodComplete("cooperation")
    && isMethodComplete("kupreychenko")
    && isMethodComplete("trsi")
    && isMethodComplete("opm2")
    && isFollowupComplete();
}

function currentStageValid() {
  if (state.stage === "passport") {
    return isPassportComplete();
  }
  if (state.stage === "cooperation") {
    return isCurrentPageComplete("cooperation");
  }
  if (state.stage === "kupreychenko") {
    return isCurrentPageComplete("kupreychenko");
  }
  if (state.stage === "trsi") {
    return isCurrentPageComplete("trsi");
  }
  if (state.stage === "opm2") {
    return isCurrentPageComplete("opm2");
  }
  if (state.stage === "review") {
    return isReviewComplete();
  }
  return true;
}

function canJumpToStage(nextStage) {
  if (nextStage === "intro" || nextStage === "passport") {
    return true;
  }

  if (nextStage === "cooperation") {
    return isPassportComplete();
  }

  if (nextStage === "kupreychenko") {
    return isPassportComplete() && isMethodComplete("cooperation");
  }

  if (nextStage === "trsi") {
    return isPassportComplete() && isMethodComplete("cooperation") && isMethodComplete("kupreychenko");
  }

  if (nextStage === "opm2") {
    return isPassportComplete() && isMethodComplete("cooperation") && isMethodComplete("kupreychenko") && isMethodComplete("trsi");
  }

  if (nextStage === "review") {
    return isPassportComplete()
      && isMethodComplete("cooperation")
      && isMethodComplete("kupreychenko")
      && isMethodComplete("trsi")
      && (isMethodComplete("opm2") || state.stage === "opm2");
  }

  if (nextStage === "done") {
    return state.meta.completedAt !== null;
  }

  return false;
}

function goStage(nextStage) {
  if (!canJumpToStage(nextStage)) {
    return;
  }
  state.stage = nextStage;
  clampCursorForStage();
  saveState();
  render();
  scrollToTop();
}

function clampCursorForStage() {
  for (const methodKey of ["cooperation", "kupreychenko", "trsi", "opm2"]) {
    const cursorKey = getMethodCursorKey(methodKey);
    state.cursor[cursorKey] = clamp(state.cursor[cursorKey], 0, getPageCount(methodKey) - 1);
  }
}

function advanceStage() {
  if (!currentStageValid()) {
    render();
    return;
  }

  if (state.stage === "intro") {
    state.stage = "passport";
  } else if (state.stage === "passport") {
    state.stage = "cooperation";
  } else if (state.stage === "cooperation") {
    if (state.cursor.cooperationPage < getPageCount("cooperation") - 1) {
      state.cursor.cooperationPage += 1;
    } else {
      state.stage = "kupreychenko";
    }
  } else if (state.stage === "kupreychenko") {
    if (state.cursor.kupreychenkoPage < getPageCount("kupreychenko") - 1) {
      state.cursor.kupreychenkoPage += 1;
    } else {
      state.stage = "trsi";
    }
  } else if (state.stage === "trsi") {
    if (state.cursor.trsiPage < getPageCount("trsi") - 1) {
      state.cursor.trsiPage += 1;
    } else {
      state.stage = "opm2";
    }
  } else if (state.stage === "opm2") {
    if (state.cursor.opm2Page < getPageCount("opm2") - 1) {
      state.cursor.opm2Page += 1;
    } else {
      state.stage = "review";
    }
  } else if (state.stage === "review") {
    submitResults();
    return;
  }

  saveState();
  render();
  scrollToTop();
}

function retreatStage() {
  if (state.stage === "intro") {
    return;
  }

  if (state.stage === "passport") {
    state.stage = "intro";
  } else if (state.stage === "cooperation") {
    if (state.cursor.cooperationPage > 0) {
      state.cursor.cooperationPage -= 1;
    } else {
      state.stage = "passport";
    }
  } else if (state.stage === "kupreychenko") {
    if (state.cursor.kupreychenkoPage > 0) {
      state.cursor.kupreychenkoPage -= 1;
    } else {
      state.stage = "cooperation";
      state.cursor.cooperationPage = getPageCount("cooperation") - 1;
    }
  } else if (state.stage === "trsi") {
    if (state.cursor.trsiPage > 0) {
      state.cursor.trsiPage -= 1;
    } else {
      state.stage = "kupreychenko";
      state.cursor.kupreychenkoPage = getPageCount("kupreychenko") - 1;
    }
  } else if (state.stage === "opm2") {
    if (state.cursor.opm2Page > 0) {
      state.cursor.opm2Page -= 1;
    } else {
      state.stage = "trsi";
      state.cursor.trsiPage = getPageCount("trsi") - 1;
    }
  } else if (state.stage === "review") {
    state.stage = "opm2";
    state.cursor.opm2Page = getPageCount("opm2") - 1;
  } else if (state.stage === "done") {
    state.stage = "review";
  }

  saveState();
  render();
  scrollToTop();
}

function setAnswer(methodKey, index, value, targetKey = null) {
  if (methodKey === "cooperation") {
    state.answers.cooperation[index] = value;
  } else if (methodKey === "kupreychenko") {
    state.answers.kupreychenko[index][targetKey] = value;
  } else if (methodKey === "trsi") {
    state.answers.trsi[index] = value;
  } else if (methodKey === "opm2") {
    state.answers.opm2[index] = value;
  }
  saveState();
  render();
}

function updatePassportField(name, value, shouldRender = true) {
  state.passport[name] = value;
  saveState();
  if (shouldRender) {
    render();
  }
}

function updateFollowupField(name, value, shouldRender = true) {
  state.followup[name] = value;
  saveState();
  if (shouldRender) {
    render();
  }
}

function render() {
  const totalAnswered = getTotalAnswered();
  const currentLabel = currentStageLabel();
  const savedLabel = state.meta.lastSavedAt ? new Date(state.meta.lastSavedAt).toLocaleString("ru-RU") : "ещё не было";

  app.innerHTML = `
    <input id="draft-import-input" type="file" accept="application/json,.json" hidden data-action="import-draft" />
    <div class="shell shell-${escapeHtml(state.stage)}">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand-row">
            <div class="brand">
              <h1 class="title">${escapeHtml(APP_TITLE)}</h1>
            </div>
            <div class="top-meta">
              <span class="pill"><strong>${escapeHtml(currentLabel)}</strong></span>
              <span class="pill">Черновик: <strong>${escapeHtml(savedLabel)}</strong></span>
              <span class="pill">Ответы: <strong>${totalAnswered}/${surveyData.totalItems}</strong></span>
            </div>
          </div>
          <nav class="stepper" aria-label="Навигация по этапам">
            ${stageOrder
              .map((stage) => {
                const canOpen = canJumpToStage(stage);
                const classes = [
                  "step-chip",
                  state.stage === stage ? "is-active" : "",
                  stageOrder.indexOf(stage) < currentStageIndex() ? "is-complete" : "",
                  canOpen ? "is-clickable" : "is-locked",
                ]
                  .filter(Boolean)
                  .join(" ");
                return `<button type="button" class="${classes}" data-action="go-stage" data-stage="${stage}" ${canOpen ? "" : "disabled"}>${escapeHtml(stageLabels[stage])}</button>`;
              })
              .join("")}
          </nav>
          <div class="progress-block">
            <div class="progress-labels">
              <span>${escapeHtml(currentProgressLabel())}</span>
              <span>${totalAnswered}/${surveyData.totalItems}</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width: ${currentProgressValue()}%"></div>
            </div>
          </div>
        </div>
      </header>
      <main class="layout">
        <section class="main-col">
          ${renderMain()}
        </section>
        <aside class="side-col">
          ${renderSidebar()}
        </aside>
      </main>
    </div>
  `;
}

function currentStageIndex() {
  return stageOrder.indexOf(state.stage);
}

function currentProgressLabel() {
  if (state.stage === "intro") {
    return "Перед началом";
  }
  if (state.stage === "passport") {
    return "Профиль участника";
  }
  if (state.stage === "cooperation") {
    return pageLabel("cooperation", state.cursor.cooperationPage);
  }
  if (state.stage === "kupreychenko") {
    return pageLabel("kupreychenko", state.cursor.kupreychenkoPage);
  }
  if (state.stage === "trsi") {
    return pageLabel("trsi", state.cursor.trsiPage);
  }
  if (state.stage === "opm2") {
    return pageLabel("opm2", state.cursor.opm2Page);
  }
  if (state.stage === "review") {
    return "Результаты";
  }
  return "Готово";
}

function currentProgressValue() {
  if (state.stage === "intro") {
    return 0;
  }
  return Math.min(100, (getTotalAnswered() / surveyData.totalItems) * 100);
}

function pageLabel(methodKey, pageIndex) {
  const method = getMethodData(methodKey);
  const start = pageIndex * method.pageSize + 1;
  const end = Math.min(start + method.pageSize - 1, method.questions.length);
  return `Вопросы ${start}-${end} из ${method.questions.length}`;
}

function renderMain() {
  if (state.stage === "intro") {
    return renderIntroView();
  }
  if (state.stage === "passport") {
    return renderPassportView();
  }
  if (state.stage === "cooperation") {
    return renderMethodView("cooperation");
  }
  if (state.stage === "kupreychenko") {
    return renderMethodView("kupreychenko");
  }
  if (state.stage === "trsi") {
    return renderMethodView("trsi");
  }
  if (state.stage === "opm2") {
    return renderMethodView("opm2");
  }
  if (state.stage === "review") {
    return renderReview();
  }
  return renderDone();
}

function renderMobileStageControls({ back = false, nextLabel, nextDisabled = false, nextAction = "next-stage" }) {
  return `
    <div class="mobile-stage-controls" aria-label="Навигация по анкете">
      ${back ? '<button class="btn secondary" type="button" data-action="prev-stage">← Назад</button>' : ""}
      <button class="btn primary" type="button" data-action="${escapeHtml(nextAction)}" ${nextDisabled ? "disabled" : ""}>${escapeHtml(nextLabel)}</button>
    </div>
  `;
}

function renderIntroView() {
  return `
    <article class="main-card intro-card">
      ${renderMobileStageControls({ nextLabel: "Начать →" })}
      <div class="section-head">
        <h2 class="section-title">Перед началом</h2>
        <p class="section-copy">Сначала заполните короткий профиль участника, затем пройдёте четыре методики подряд. Прогресс сохраняется автоматически, поэтому при необходимости можно закрыть страницу и вернуться позже.</p>
      </div>

      <div class="intro-research-note">
        Данное исследование проводится в рамках магистерской диссертации.
      </div>

      <div class="notice">
        <strong>Цель методики</strong> - получить комплексный набор показателей психологических предикторов, влияющих на совместную деятельность.<br><br>
        Опрос собран в один поток, в котором 4 методики, анализирующие:<br>
        Готовность к сотрудничеству<br>
        Доверие/недоверие к людям<br>
        Тип реагирования на ситуацию изменений<br>
        Показатели профессиональной мотивации.
      </div>

      <div class="intro-grid">
        <section class="intro-tile">
          <h3>1. Готовность к сотрудничеству</h3>
          <p>Первый опрос измеряет степень готовности к сотрудничеству в совместной деятельности.</p>
        </section>
        <section class="intro-tile">
          <h3>2. Доверие/недоверие к людям</h3>
          <p>Методика позволяет оценить степень и профиль доверия к людям в разрезе 6 компонентов.</p>
        </section>
        <section class="intro-tile">
          <h3>3. Тип реагирования на ситуацию изменений</h3>
          <p>Следующий блок показывает профиль реагирования на изменения и неопределённость.</p>
        </section>
        <section class="intro-tile">
          <h3>4. Показатели профессиональной мотивации</h3>
          <p>Финальный опрос отражает профиль профессиональной мотивации в разрезе компонентов и интегральных показателей.</p>
        </section>
      </div>

      <div class="page-footer">
        <p class="helper-text">Далее откроется блок «Профиль участника».</p>
        <div class="footer-row">
          <button class="btn primary" type="button" data-action="next-stage">Начать →</button>
        </div>
      </div>
    </article>
  `;
}

function renderPassportView() {
  return `
    <article class="main-card">
      ${renderMobileStageControls({
        back: true,
        nextLabel: "Далее →",
        nextDisabled: !isPassportComplete(),
      })}
      <div class="section-head">
        <h2 class="section-title">Профиль участника</h2>
        <p class="section-copy">Заполните короткие сведения о себе, чтобы результаты можно было связать с контекстом работы.</p>
      </div>

      <div class="passport-grid" role="form" aria-label="Профиль участника">
        ${surveyData.passportFields.map(renderPassportField).join("")}
      </div>

      <div class="page-footer">
        <p class="helper-text">После этого откроется первая методика.</p>
        <div class="footer-row">
          <button class="btn secondary" type="button" data-action="prev-stage">← Назад</button>
          <button class="btn primary" type="button" data-action="next-stage" ${isPassportComplete() ? "" : "disabled"}>Далее →</button>
        </div>
      </div>
    </article>
  `;
}

function renderPassportField(field) {
  const value = state.passport[field.name] ?? "";

  if (field.type === "checkbox") {
    return `
      <div class="passport-field wide">
        <label class="check-card">
          <input type="checkbox" name="${escapeHtml(field.name)}" ${value ? "checked" : ""} />
          <span>${escapeHtml(field.label)}</span>
        </label>
      </div>
    `;
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : normalizeProjectRoles(value);
    return `
      <div class="passport-field wide">
        <span class="field-label">${escapeHtml(field.label)}${field.required ? " *" : ""}</span>
        ${field.helperText ? `<p class="field-hint">${escapeHtml(field.helperText)}</p>` : ""}
        <div class="passport-multiselect">
          ${field.options.map((option) => `
            <label class="check-card">
              <input
                type="checkbox"
                name="${escapeHtml(field.name)}"
                value="${escapeHtml(option.value)}"
                ${selected.includes(option.value) ? "checked" : ""}
              />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }

  if (field.type === "select") {
    return `
      <label class="passport-field">
        <span class="field-label">${escapeHtml(field.label)}${field.required ? " *" : ""}</span>
        <select class="field-control" name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>
          ${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  const type = field.type === "number" ? "number" : "text";
  const step = field.type === "number" ? ' step="1" min="0" inputmode="numeric"' : "";
  return `
    <label class="passport-field ${field.name === "position" ? "wide" : ""}">
      <span class="field-label">${escapeHtml(field.label)}${field.required ? " *" : ""}</span>
      <input
        class="field-control"
        type="${type}"
        name="${escapeHtml(field.name)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(field.placeholder || "")}"
        ${step}
      />
    </label>
  `;
}

function renderMethodView(methodKey) {
  const method = getMethodData(methodKey);
  const pageIndex = state.cursor[getMethodCursorKey(methodKey)];
  const pageCount = getPageCount(methodKey);
  const start = pageIndex * method.pageSize;
  const pageItems = method.questions.slice(start, start + method.pageSize);
  const nextLabel = pageIndex === pageCount - 1
    ? (methodKey === "opm2" ? "К проверке →" : "Следующая методика →")
    : "Далее →";

  return `
    <article class="main-card">
      ${renderMobileStageControls({
        back: true,
        nextLabel,
        nextDisabled: !currentStageValid(),
      })}
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(method.title)}${method.subtitle ? ` <span style="font-family: var(--body-font); color: var(--muted); font-size: 0.62em; font-weight: 700;">${escapeHtml(method.subtitle)}</span>` : ""}</h2>
        <p class="section-copy">${escapeHtml(method.instructions).replaceAll("\n", "<br>")}</p>
      </div>

      ${method.stem ? `
        <div class="notice">
          <strong>${escapeHtml(method.stem)}</strong> Эта формулировка задаёт общий контекст для всех утверждений методики.
        </div>
      ` : ""}

      <div class="notice">
        <strong>${escapeHtml(pageLabel(methodKey, pageIndex))}.</strong> ${escapeHtml(methodKey === "kupreychenko" ? "На каждом утверждении нужно поставить две оценки." : "Заполните все строки на экране, прежде чем переходить дальше.")}
      </div>

      <div class="question-stack">
        ${pageItems.map((item, offset) => renderMethodQuestionCard(methodKey, method, item, start + offset)).join("")}
      </div>

      <div class="page-footer">
        <p class="helper-text">${escapeHtml(pageHelperText(methodKey))}</p>
        <div class="footer-row">
          <button class="btn secondary" type="button" data-action="prev-stage">← Назад</button>
          <button class="btn primary" type="button" data-action="next-stage" ${currentStageValid() ? "" : "disabled"}>${nextLabel}</button>
        </div>
      </div>
    </article>
  `;
}

function pageHelperText(methodKey) {
  if (methodKey === "cooperation") {
    return "Отвечайте быстро и последовательно, не пропуская утверждения.";
  }
  if (methodKey === "kupreychenko") {
    return "Сначала оцените человека, которому доверяете, затем того, кто доверие потерял.";
  }
  if (methodKey === "trsi") {
    return "Здесь важен привычный способ реагирования, а не идеальный ответ.";
  }
  if (methodKey === "opm2") {
    return "Отвечайте так, как это действительно обычно про вас.";
  }
  return "";
}

function renderMethodQuestionCard(methodKey, method, item, absoluteIndex) {
  if (method.mode === "binary") {
    const answer = state.answers.cooperation[absoluteIndex];
    return `
      <article class="question-card">
        <div class="question-top">
          <p class="question-number">Вопрос ${item.number}</p>
          <span class="question-badge">Да / Нет</span>
        </div>
        <p class="question-text small">${escapeHtml(item.text)}</p>
        <div class="scale-grid" data-scale="2" role="group" aria-label="Ответ на вопрос ${item.number}">
          ${method.options.map((option) => {
            const selected = answer === option.value ? "is-selected" : "";
            return `<button type="button" class="scale-btn ${selected}" data-action="answer-single" data-path="${methodKey}" data-index="${absoluteIndex}" data-value="${option.value}">${escapeHtml(option.label)}</button>`;
          }).join("")}
        </div>
      </article>
    `;
  }

  if (method.mode === "paired") {
    const answer = state.answers.kupreychenko[absoluteIndex];
    return `
      <article class="question-card">
        <div class="question-top">
          <p class="question-number">Утверждение ${item.number}</p>
          <span class="question-badge">Доверие / Недоверие</span>
        </div>
        <p class="question-text small">${escapeHtml(item.text)}</p>
        <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;">
          ${method.targets.map((target) => {
            const targetAnswer = answer[target.key];
            return `
              <div style="display:grid; gap:8px;">
                <div class="scale-legend" style="justify-content:flex-start; gap:8px; font-weight:700; color: var(--accent);">
                  <span>${escapeHtml(target.label === "Д" ? "Доверие" : "Недоверие")}</span>
                </div>
                <div class="scale-grid" data-scale="5" role="group" aria-label="${escapeHtml(target.label)} для утверждения ${item.number}">
                  ${method.scale.map((score) => {
                    const selected = targetAnswer === score ? "is-selected" : "";
                    return `<button type="button" class="scale-btn ${selected}" data-action="answer-paired" data-path="${methodKey}" data-index="${absoluteIndex}" data-target="${target.key}" data-value="${score}">${score}</button>`;
                  }).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }

  const answer = state.answers[methodKey][absoluteIndex];
  return `
    <article class="question-card">
      <div class="question-top">
        <p class="question-number">Вопрос ${item.number}</p>
        <span class="question-badge">1 - ${method.scale[method.scale.length - 1]}</span>
      </div>
      <p class="question-text small">${escapeHtml(item.text)}</p>
      <div class="scale-grid" data-scale="${method.scale.length}" role="group" aria-label="Оценка вопроса ${item.number}">
        ${method.scale.map((score) => {
          const selected = answer === score ? "is-selected" : "";
          return `<button type="button" class="scale-btn ${selected}" data-action="answer-single" data-path="${methodKey}" data-index="${absoluteIndex}" data-value="${score}">${score}</button>`;
        }).join("")}
      </div>
      <div class="scale-legend" aria-hidden="true">
        <span>${escapeHtml(method.scaleLabels[method.scale[0]])}</span>
        <span style="text-align:right;">${escapeHtml(method.scaleLabels[method.scale[method.scale.length - 1]])}</span>
      </div>
    </article>
  `;
}

const kupreychenkoComponentDefinitions = [
  { label: "Надежность", description: "Способен ли человек прийти на помощь, поддержать в трудной ситуации." },
  { label: "Единство", description: "Единство целей, убеждений, ценностей." },
  { label: "Знание", description: "Убежденность, что мы понимаем человека и он предсказуем." },
  { label: "Приязнь", description: "Привязанность, принятие другого человека." },
  { label: "Расчет", description: "На основе имеющихся фактов о человеке предполагаем, что он оправдает доверие." },
  { label: "Недостатки", description: "Сформировавшееся убеждение и представление о недостатках человека." },
];

const trsiFactorDefinitions = [
  { label: "Освоение изменений", description: "Реализующий тип 1." },
  { label: "Преодоление трудностей", description: "Реализующий тип 2." },
  { label: "Стремление к изменениям", description: "Инновационный тип 1." },
  { label: "Предпочтение неопределенности", description: "Инновационный тип 2." },
  { label: "Избегание изменений", description: "Реактивный тип." },
  { label: "Упреждение изменений", description: "Консервативный тип 1." },
  { label: "Сохранение стабильности", description: "Консервативный тип 2." },
];

const trsiInterpretationDefinitions = [
  {
    label: "Принятие изменений",
    description: "Включает освоение изменений, преодоление трудностей, стремление к изменениям и предпочтение неопределённости.",
  },
  {
    label: "Непринятие изменений",
    description: "Включает избегание изменений, упреждение изменений и сохранение стабильности.",
  },
];

const trsiGroupDefinitions = [
  {
    label: "Принятие изменений",
    description: "Объединяет освоение изменений, преодоление трудностей, стремление к изменениям и предпочтение неопределенности.",
  },
  {
    label: "Непринятие изменений",
    description: "Объединяет избегание изменений, упреждение изменений и сохранение стабильности.",
  },
];

const trsiDetailedDefinitions = [
  {
    label: "Освоение изменений",
    description: "Определяет быструю адаптацию к переменам, позитивные эмоции и способность легко перестроить деятельность в новых условиях.",
  },
  {
    label: "Преодоление трудностей",
    description: "Включает уверенность в успешном разрешении проблемных ситуаций и стремление извлечь пользу даже в случае неудачного опыта.",
  },
  {
    label: "Стремление к изменениям",
    description: "Описывает высокую значимость и потребность в переменах, привлекательность ситуации изменений и интерес к новизне.",
  },
  {
    label: "Предпочтение неопределенности",
    description: "Предполагает толерантность к неопределенности, удовольствие от быстрой смены событий и способность к импровизации.",
  },
  {
    label: "Избегание изменений",
    description: "Описывает сильные негативные эмоции в ситуации перемен: тревогу, страх, панику, внутреннее сопротивление и ощущение потери сил и ресурсов.",
  },
  {
    label: "Упреждение изменений",
    description: "Характеризует негативное отношение к переменам, связанное с отрицательными прогнозами и фокусированием на препятствиях; направлено на предотвращение изменений.",
  },
  {
    label: "Сохранение стабильности",
    description: "Предполагает стремление сохранить или вернуть стабильность, попытки применять ранее разработанные алгоритмы действий и тщательное планирование жизненных событий.",
  },
];

const trsiAcceptanceDetailedDefinitions = trsiDetailedDefinitions.slice(0, 4);
const trsiRejectionDetailedDefinitions = trsiDetailedDefinitions.slice(4);

const kupreychenkoTypeDefinitions = [
  {
    label: "Понимающий людей",
    description: "Отличается низкой дифференциацией доверия и недоверия и высокими оценками по компоненту «Знание», особенно в отношении людей, которым не доверяет. Уверен в своей способности прогнозировать поведение людей, верит в добрую природу людей и считает, что большинство из них склонны к сотрудничеству и взаимопомощи. Занимает активную жизненную позицию, а высокая значимость доверия является основой для тесной взаимосвязи с людьми.",
  },
  {
    label: "Сильно дифференцирующий людей",
    description: "Отличается высокой дифференциацией оценок доверия и недоверия. Делит людей на своих и чужих, требователен к себе и другим, бескомпромиссен в оценках и суждениях. В деловых отношениях обычно нужны заметные усилия, чтобы заслужить его доверие.",
  },
  {
    label: "Доверяющий на основе надежности и приязни",
    description: "Характерен высокими оценками по компоненту «Знание» и большой диверсификацией оценок недостатков. Высоко ценит здоровье, любовь, семейные ценности, терпимость и чуткость. Для него важно наличие доверия к близкому человеку.",
  },
  {
    label: "Амбивалентно доверяющий",
    description: "Одновременно высоко оценивает недостатки человека, которому доверяет, и позитивные компоненты доверия: Знание, Приязнь, Единство, Расчет. Доверие у него регулируется скорее эмоционально, он может слепо доверять и подменять доверие другим феноменом — верой.",
  },
  {
    label: "Недифференцирующий людей",
    description: "Слабо различает доверие и недоверие: в отношениях с человеком, которому доверяют больше всего, компонент «Расчёт» выражен низко, а в отношениях с тем, кто доверия не оправдал, — заметно выше. Для взрослых людей это обычно говорит о том, что доверительные отношения занимают в жизни скорее второстепенное место.",
  },
];

const opm2ScaleDefinitions = [
  { label: "Внутренняя мотивация", description: "Стремление заниматься профессией исходя из искреннего интереса и стремления к личным достижениям в этой сфере." },
  { label: "Интегрированная регуляция", description: "Увязывание профессиональной деятельности с другими важными областями жизни и создание целостной картины личности." },
  { label: "Идентифицированная регуляция", description: "Наличие четких представлений о целях карьеры и сознательный выбор направления профессиональной деятельности." },
  { label: "Интроецированная регуляция", description: "Принятие норм и правил организации под воздействием внутренних санкций и наказаний." },
  { label: "Экстернальная регуляция", description: "Мотивы деятельности основаны преимущественно на внешних вознаграждениях или страхе негативных последствий." },
  { label: "Амотивация", description: "Отсутствие заинтересованности и восприятия смысла в выполняемой работе." },
];

function renderDefinitionGrid(items) {
  return `
    <div class="definition-grid">
      ${items.map((item) => `
        <article class="definition-item">
          <h4>${escapeHtml(item.label)}</h4>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderReview() {
  const payload = buildPayload();
  const cooperationScore = calculateCooperationScore();
  const cooperationLevel = getCooperationLevel(cooperationScore);

  return `
    <article class="main-card" id="results-top">
      ${renderMobileStageControls({
        back: true,
        nextLabel: "Завершить →",
        nextAction: "submit-results",
      })}
      <div class="section-head">
        <h2 class="section-title">Результаты перед завершением</h2>
        <p class="section-copy">Проверьте краткую сводку и при желании оставьте почту для подробной расшифровки результатов.</p>
      </div>

      <div class="summary-grid">
        <section class="summary-card summary-card-wide">
          <h3>Степень готовности к сотрудничеству</h3>
          <div class="summary-value">${cooperationScore} / 25</div>
          <p class="summary-help">${cooperationLevel.label} готовность (${cooperationLevel.range})</p>
          <ul class="details-list">
            <li><span>Ответов</span><strong>${getMethodAnsweredCount("cooperation")} / ${surveyData.methodologies.cooperation.questions.length}</strong></li>
          </ul>
          ${renderCooperationGauge(cooperationScore)}
        </section>

        <section class="summary-card summary-card-wide">
          <h3>Доверие и недоверие к людям (Купрейченко)</h3>
          <div class="summary-value">${roundScore(payload.derived.kupreychenko.trust.overall)} / ${roundScore(payload.derived.kupreychenko.distrust.overall)}</div>
          <p class="summary-help">Зелёный контур показывает доверие, оранжевый - недоверие. На радаре видны обе оценки по каждому фактору.</p>
          <ul class="details-list">
            <li><span>Доверие</span><strong>${roundScore(payload.derived.kupreychenko.trust.overall)}</strong></li>
            <li><span>Недоверие</span><strong>${roundScore(payload.derived.kupreychenko.distrust.overall)}</strong></li>
            <li><span>Дельта</span><strong>${roundScore(payload.derived.kupreychenko.balance)}</strong></li>
          </ul>
          <div class="block-links">
            <a class="text-link" href="#kupreychenko-types">Перейти к типам доверия</a>
          </div>
          ${renderKupreychenkoChartPanel(payload.kupreychenko.scores)}
        </section>

        <section class="summary-card summary-card-wide">
          <h3>Типы реагирования на ситуацию изменений (ТРСИ)</h3>
          <div class="summary-value">${roundScore(payload.derived.trsi.acceptance)} / ${roundScore(payload.derived.trsi.rejection)}</div>
          <p class="summary-help">Средние значения по семи шкалам показывают профиль реагирования на изменения.</p>
          <ul class="details-list">
            <li><span>Принятие изменений</span><strong>${roundScore(payload.derived.trsi.acceptance)}</strong></li>
            <li><span>Непринятие изменений</span><strong>${roundScore(payload.derived.trsi.rejection)}</strong></li>
            <li><span>Баланс</span><strong>${roundScore(payload.derived.trsi.balance)}</strong></li>
          </ul>
          <div class="block-links">
            <a class="text-link" href="#trsi-meaning">Перейти к пояснению ТРСИ</a>
          </div>
          ${renderTrsiChartPanel(payload.trsi.scores)}
        </section>

        <section class="summary-card summary-card-wide">
          <h3>Результаты по опроснику профессиональной мотивации</h3>
          ${renderOpm2ChartPanel(payload.opm2.scores)}
        </section>
      </div>

      <section id="kupreychenko-types" class="summary-card summary-card-wide results-appendix">
        <h3>Типы доверия по Купрейченко</h3>
        <p class="summary-help">Первый значимый показатель - насколько дифференцировано отношение к человеку, которому респондент доверяет, и человеку, которому не доверяет. На этой основе можно читать профиль доверия не только по общему уровню, но и по смыслу отдельных компонент.</p>
        <div class="block-links">
          <a class="text-link" href="#results-top">Вернуться к результатам</a>
        </div>
        ${renderDefinitionGrid(kupreychenkoTypeDefinitions)}
      </section>

      <section id="trsi-meaning" class="summary-card summary-card-wide results-appendix">
        <h3>Пояснение к ТРСИ</h3>
        <p class="summary-help">Ниже собраны смысловые группы интегральных показателей. Принятие изменений объединяет освоение изменений, преодоление трудностей, стремление к изменениям и предпочтение неопределенности. Непринятие изменений объединяет избегание изменений, упреждение изменений и сохранение стабильности.</p>
        <div class="block-links">
          <a class="text-link" href="#results-top">Вернуться к результатам</a>
        </div>
        ${renderDefinitionGrid(trsiGroupDefinitions)}
        <div class="interpretation-block">
          <h5>Подробные шкалы</h5>
          <div class="interpretation-block">
            <h5>Принятие изменений</h5>
            ${renderDefinitionGrid(trsiAcceptanceDetailedDefinitions)}
          </div>
          <div class="interpretation-block">
            <h5>Непринятие изменений</h5>
            ${renderDefinitionGrid(trsiRejectionDetailedDefinitions)}
          </div>
        </div>
      </section>

      <div class="notice">
        <div class="passport-grid" style="align-items:start;">
          <label class="passport-field wide">
            <span class="field-label">Почта для связи</span>
            <input
              class="field-control"
              type="email"
              name="email"
              value="${escapeHtml(state.followup.email)}"
              placeholder="name@example.com"
            />
          </label>
          <p class="helper-text wide">Можете указать свою почту, если хотите получить детальный анализ по опроснику.</p>
        </div>
      </div>

      <div class="page-footer">
        <div class="footer-row">
          <button class="btn secondary" type="button" data-action="prev-stage">← Назад</button>
          <div class="footer-row">
            <button class="btn ghost" type="button" data-action="save-draft">Сохранить черновик</button>
            <button class="btn primary review-desktop-submit" type="button" data-action="submit-results">Отправить результаты и завершить</button>
          </div>
        </div>
        <button class="btn primary mobile-review-submit" type="button" data-action="submit-results">Завершить →</button>
      </div>
    </article>
  `;
}

function renderOpm2ChartPanel(scores) {
  const primaryAxes = [
    { short: "ВМ", label: "Внутренняя мотивация", value: scores.primary.vm },
    { short: "ИНТ", label: "Интегрированная регуляция", value: scores.primary.int },
    { short: "ИДЭ", label: "Идентифицированная регуляция", value: scores.primary.ide },
    { short: "ИНТР", label: "Интроецированная регуляция", value: scores.primary.intr },
    { short: "ЭКС", label: "Экстернальная регуляция", value: scores.primary.exs },
    { short: "АМ", label: "Амотивация", value: scores.primary.am },
  ];

  return `
    <div class="opm2-chart-grid">
      ${renderRadarChartCard({
        title: "Выраженность компонентов мотивации",
        subtitle: "Расшифровку шкал смотрите ниже",
        axes: primaryAxes,
        min: 1,
        max: 5,
        note: "",
      })}
      <div class="interpretation-block">
        <h5>Расшифровка шкал</h5>
        ${renderDefinitionGrid(opm2ScaleDefinitions)}
      </div>
      ${renderIntegralComparisonCard({
        title: "Автономная и контролируемая мотивация",
        subtitle: "На линейной шкале видно соотношение внутренней и внешней направленности мотивации.",
        autonomous: scores.autonomous,
        controlled: scores.controlled,
        autonomousDetail: "зависит от ваших собственных мотивов",
        controlledDetail: "зависит от внешних факторов и внешнего влияния",
        rai: scores.rai,
        min: 1,
        max: 5,
        note: "Чем длиннее полоса, тем выше показатель. Разница между строками показывает индекс относительной автономии.",
      })}
    </div>
  `;
}

function renderTrsiChartPanel(scores) {
  const primaryAxes = [
    { short: "ОИ", label: "Освоение изменений", detail: trsiFactorDefinitions[0].description, value: scores.primary.mastery },
    { short: "ПТ", label: "Преодоление трудностей", detail: trsiFactorDefinitions[1].description, value: scores.primary.overcoming },
    { short: "СИ", label: "Стремление к изменениям", detail: trsiFactorDefinitions[2].description, value: scores.primary.seeking },
    { short: "ПН", label: "Предпочтение неопределенности", detail: trsiFactorDefinitions[3].description, value: scores.primary.preference },
    { short: "ИЗ", label: "Избегание изменений", detail: trsiFactorDefinitions[4].description, value: scores.primary.avoidance },
    { short: "УП", label: "Упреждение изменений", detail: trsiFactorDefinitions[5].description, value: scores.primary.anticipation },
    { short: "СС", label: "Сохранение стабильности", detail: trsiFactorDefinitions[6].description, value: scores.primary.stability },
  ];

  return `
    <div class="opm2-chart-grid">
      ${renderRadarChartCard({
        title: "Выраженность по шкалам реагирования на изменения",
        subtitle: "На диаграмме показана выраженность по шкалам реагирования на ситуацию изменений.",
        axes: primaryAxes,
        min: 1,
        max: 4,
        note: "Более подробно по шкалам можно посмотреть по гиперссылке выше.",
      })}
      ${renderLinearComparisonCard({
        title: "Интегральные показатели",
        subtitle: "Принятие и непринятие изменений на общей линейной шкале",
        firstLabel: "Принятие изменений",
        firstValue: scores.acceptance,
        secondLabel: "Непринятие изменений",
        secondValue: scores.rejection,
        min: 1,
        max: 4,
        deltaLabel: "Баланс",
        deltaValue: scores.balance,
        note: "Полосы показывают выраженность интегральных факторов, а метка отражает разницу между ними.",
      })}
    </div>
  `;
}
function renderKupreychenkoChartPanel(scores) {
  const axes = surveyData.methodologies.kupreychenko.scoring.trust.map((group) => {
    const definition = kupreychenkoComponentDefinitions.find((item) => item.label === group.label);
    return {
      label: group.label,
      detail: definition?.description || "",
      trust: scores.trust[group.key],
      distrust: scores.distrust[group.key],
    };
  });

  return `
    <div class="opm2-chart-grid">
      ${renderRadarComparisonChartCard({
        title: "Значимость компонентов доверия",
        subtitle: "На диаграмме вы можете увидеть значимость компонентов доверия, необходимых для того, чтобы вы доверяли другому человеку, а также влияние этих компонентов на ситуацию недоверия.",
        axes,
        min: 1,
        max: 5,
        note: "",
      })}
    </div>
  `;
}

function renderRadarComparisonChartCard({ title, subtitle, axes, min, max, note }) {
  return `
    <section class="opm2-chart-card">
      <div class="chart-head">
        <h4 class="chart-title">${escapeHtml(title)}</h4>
        <p class="chart-subtitle">${escapeHtml(subtitle)}</p>
        <div class="chart-legend">
          <span class="chart-legend-item"><span class="chart-legend-swatch" style="background:var(--accent);"></span>Доверие</span>
          <span class="chart-legend-item"><span class="chart-legend-swatch" style="background:var(--accent-2);"></span>Недоверие</span>
        </div>
      </div>
      ${renderRadarComparisonSvg(axes, min, max)}
      ${renderRadarComparisonSvg(axes, min, max, true)}
      ${note && String(note).trim() ? `<p class="chart-note">${escapeHtml(note)}</p>` : ""}
    </section>
  `;
}

function renderRadarComparisonSvg(axes, min, max, mobile = false) {
  const width = 980;
  const height = 900;
  const cx = 490;
  const cy = 395;
  const radius = 250;
  const levels = 5;
  const angleStep = (Math.PI * 2) / axes.length;
  const startAngle = -Math.PI / 2;
  const angles = axes.map((_, index) => startAngle + angleStep * index);

  const point = (angle, distance) => [
    cx + Math.cos(angle) * distance,
    cy + Math.sin(angle) * distance,
  ];

  const polygonPoints = (radiusValue) => angles
    .map((angle) => point(angle, radiusValue))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const clampValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, numeric));
  };

  const gridPolygons = Array.from({ length: levels }, (_, index) => {
    const r = radius * ((index + 1) / levels);
    return `<polygon points="${polygonPoints(r)}" class="radar-grid-ring"></polygon>`;
  }).join("");

  const axisLines = angles.map((angle) => {
    const [x, y] = point(angle, radius);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-axis-line"></line>`;
  }).join("");

  const labels = axes.map((axis, index) => {
    const isSideLabel = Math.abs(Math.cos(angles[index])) > 0.35;
    const [x, y] = point(angles[index], radius + (mobile && isSideLabel ? 28 : mobile ? 54 : 60));
    const dx = x < cx - 40 ? -10 : x > cx + 40 ? 10 : 0;
    const dy = y < cy - 40 ? -8 : y > cy + 40 ? 12 : 0;
    const anchor = x < cx - 40 ? "end" : x > cx + 40 ? "start" : "middle";
    const labelX = (x + dx).toFixed(1);
    const labelY = (y + dy).toFixed(1);
    const delta = axis.trust - axis.distrust;
    const detailLines = splitTextIntoTwoLines(axis.detail, mobile ? 16 : 24, mobile ? 4 : 3);
    const scoreSegments = mobile
      ? [
          `<tspan x="${labelX}" dy="${detailLines.length ? "30" : "32"}" class="radar-label-score radar-label-score-trust">Д ${escapeHtml(roundScore(axis.trust))}</tspan>`,
          `<tspan x="${labelX}" dy="30" class="radar-label-score radar-label-score-distrust">НД ${escapeHtml(roundScore(axis.distrust))}</tspan>`,
          `<tspan x="${labelX}" dy="30" class="radar-label-score radar-label-score-delta">Δ ${escapeHtml(formatSignedScore(delta))}</tspan>`,
        ].join("")
      : [
          `<tspan x="${labelX}" dy="${detailLines.length ? "16" : "19"}" class="radar-label-score radar-label-score-trust">Д ${escapeHtml(roundScore(axis.trust))}</tspan>`,
          `<tspan dx="12" class="radar-label-score-sep">·</tspan>`,
          `<tspan dx="12" class="radar-label-score radar-label-score-distrust">НД ${escapeHtml(roundScore(axis.distrust))}</tspan>`,
          `<tspan dx="12" class="radar-label-score-sep">·</tspan>`,
          `<tspan dx="12" class="radar-label-score radar-label-score-delta">Δ ${escapeHtml(formatSignedScore(delta))}</tspan>`,
        ].join("");
    return `
      <text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="radar-label">
        <tspan x="${labelX}" dy="0">${escapeHtml(axis.label)}</tspan>
        ${detailLines.map((line, lineIndex) => `<tspan x="${labelX}" dy="${mobile ? (lineIndex === 0 ? "24" : "22") : (lineIndex === 0 ? "13" : "12")}" class="radar-label-detail">${escapeHtml(line)}</tspan>`).join("")}
        ${scoreSegments}
      </text>
    `;
  }).join("");

  const series = [
    {
      label: "Доверие",
      values: axes.map((axis) => axis.trust),
      fill: "rgba(47, 125, 115, 0.20)",
      stroke: "var(--accent)",
      point: "var(--accent)",
    },
    {
      label: "Недоверие",
      values: axes.map((axis) => axis.distrust),
      fill: "rgba(210, 109, 73, 0.18)",
      stroke: "var(--accent-2)",
      point: "var(--accent-2)",
    },
  ];

  const seriesMarkup = series.map((item) => {
    const valuePoints = axes.map((axis, index) => {
      const normalized = (clampValue(item.values[index]) - min) / (max - min);
      const [x, y] = point(angles[index], radius * normalized);
      return { x, y, label: axis.label, value: item.values[index] };
    });

    const polygon = valuePoints.map((pointValue) => `${pointValue.x.toFixed(1)},${pointValue.y.toFixed(1)}`).join(" ");
    const nodes = valuePoints.map((pointValue) => `
      <g>
        <circle cx="${pointValue.x.toFixed(1)}" cy="${pointValue.y.toFixed(1)}" r="5" class="radar-value-point" style="fill:${item.point};"></circle>
        <title>${escapeHtml(item.label)} · ${escapeHtml(pointValue.label)}: ${escapeHtml(roundScore(pointValue.value))}</title>
      </g>
    `).join("");

    return `
      <g>
        <polygon points="${polygon}" class="radar-value-fill" style="fill:${item.fill};"></polygon>
        <polygon points="${polygon}" class="radar-value-line" style="stroke:${item.stroke};"></polygon>
        ${nodes}
      </g>
    `;
  }).join("");

  return `
    <svg class="radar-svg radar-svg-compare ${mobile ? "radar-svg-mobile" : "radar-svg-desktop"}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Радарная диаграмма доверия и недоверия">
      <circle cx="${cx}" cy="${cy}" r="${radius}" class="radar-outer-circle"></circle>
      ${gridPolygons}
      ${axisLines}
      ${seriesMarkup}
      ${labels}
    </svg>
  `;
}

function renderIntegralComparisonCard({ title, subtitle, autonomous, controlled, autonomousDetail = "", controlledDetail = "", rai, min, max, note }) {
  const values = [
    { key: "autonomous", label: "Автономная", detail: autonomousDetail, value: autonomous, accent: "var(--accent)" },
    { key: "controlled", label: "Контролируемая", detail: controlledDetail, value: controlled, accent: "var(--accent-2)" },
  ];

  const width = 920;
  const height = 392;
  const left = 340;
  const right = 860;
  const axisWidth = right - left;
  const rowY = [132, 238];
  const trackHeight = 18;

  const scaleX = (value) => left + ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * axisWidth;

  const ticks = Array.from({ length: (max - min) + 1 }, (_, index) => min + index);
  const tickMarks = ticks.map((tick) => {
    const x = scaleX(tick);
    return `
      <g>
        <line x1="${x}" y1="54" x2="${x}" y2="246" class="comparison-tick"></line>
        <text x="${x}" y="36" text-anchor="middle" class="comparison-tick-label">${tick}</text>
      </g>
    `;
  }).join("");

  const series = values.map((item, index) => {
    const y = rowY[index];
    const x = scaleX(item.value);
    const labelFill = index === 0 ? "var(--accent)" : "var(--accent-2)";
    const barWidth = Math.max(10, x - left);
    const detailLines = splitTextIntoTwoLines(item.detail, 34);
    return `
      <g>
        <text x="30" y="${y - 1}" class="comparison-row-label">
          <tspan x="30" dy="0">${escapeHtml(item.label)}</tspan>
          ${detailLines.map((line, lineIndex) => `<tspan x="30" dy="${lineIndex === 0 ? "14" : "12"}" class="comparison-row-label-detail">${escapeHtml(line)}</tspan>`).join("")}
        </text>
        <rect x="${left}" y="${y - trackHeight / 2}" width="${axisWidth}" height="${trackHeight}" rx="9" class="comparison-track"></rect>
        <rect x="${left}" y="${y - trackHeight / 2}" width="${barWidth}" height="${trackHeight}" rx="9" class="comparison-bar" style="fill:${labelFill};"></rect>
        <circle cx="${x}" cy="${y}" r="8" class="comparison-point" style="fill:${labelFill};"></circle>
        <text x="${x + 14}" y="${y + 6}" class="comparison-value">${escapeHtml(roundScore(item.value))}</text>
      </g>
    `;
  }).join("");

  const autonomousX = scaleX(autonomous);
  const controlledX = scaleX(controlled);
  const deltaX = (autonomousX + controlledX) / 2;
  const deltaY = 155;
  const connectorColor = rai >= 0 ? "var(--accent)" : "var(--accent-2)";

  return `
    <section class="opm2-chart-card comparison-card">
      <div class="chart-head">
        <h4 class="chart-title">${escapeHtml(title)}</h4>
        <p class="chart-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <svg class="comparison-svg" viewBox="0 0 920 392" role="img" aria-label="Линейное сравнение интегральных показателей">
        <line x1="${left}" y1="62" x2="${right}" y2="62" class="comparison-axis"></line>
        ${tickMarks}
        ${series}
        <line x1="${autonomousX}" y1="${rowY[0]}" x2="${controlledX}" y2="${rowY[1]}" class="comparison-delta-line" style="stroke:${connectorColor};"></line>
        <circle cx="${deltaX}" cy="${deltaY}" r="18" class="comparison-delta-badge" style="fill:${rai >= 0 ? 'rgba(47, 125, 115, 0.14)' : 'rgba(210, 109, 73, 0.14)'}; stroke:${connectorColor};"></circle>
        <text x="${deltaX}" y="${deltaY - 3}" text-anchor="middle" class="comparison-delta-text">
          <tspan x="${deltaX}" dy="0">Индекс</tspan>
          <tspan x="${deltaX}" dy="14">${escapeHtml(formatSignedScore(rai))}</tspan>
        </text>
      </svg>
      ${note && String(note).trim() ? `<p class="chart-note">${escapeHtml(note)}</p>` : ""}
    </section>
  `;
}

function renderLinearComparisonCard({ title, subtitle, firstLabel, firstValue, secondLabel, secondValue, min, max, deltaLabel, deltaValue, note }) {
  const items = [
    { label: firstLabel, value: firstValue, color: "var(--accent)" },
    { label: secondLabel, value: secondValue, color: "var(--accent-2)" },
  ];

  const width = 920;
  const height = 360;
  const left = 340;
  const right = 860;
  const axisWidth = right - left;
  const rowY = [120, 210];
  const trackHeight = 18;

  const scaleX = (value) => left + ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * axisWidth;
  const ticks = Array.from({ length: (max - min) + 1 }, (_, index) => min + index);
  const tickMarks = ticks.map((tick) => {
    const x = scaleX(tick);
    return `
      <g>
        <line x1="${x}" y1="54" x2="${x}" y2="246" class="comparison-tick"></line>
        <text x="${x}" y="36" text-anchor="middle" class="comparison-tick-label">${tick}</text>
      </g>
    `;
  }).join("");

  const series = items.map((item, index) => {
    const y = rowY[index];
    const x = scaleX(item.value);
    const barWidth = Math.max(10, x - left);
    return `
      <g>
        <text x="30" y="${y + 6}" class="comparison-row-label">${escapeHtml(item.label)}</text>
        <rect x="${left}" y="${y - trackHeight / 2}" width="${axisWidth}" height="${trackHeight}" rx="9" class="comparison-track"></rect>
        <rect x="${left}" y="${y - trackHeight / 2}" width="${barWidth}" height="${trackHeight}" rx="9" class="comparison-bar" style="fill:${item.color};"></rect>
        <circle cx="${x}" cy="${y}" r="8" class="comparison-point" style="fill:${item.color};"></circle>
        <text x="${x + 14}" y="${y + 6}" class="comparison-value">${escapeHtml(roundScore(item.value))}</text>
      </g>
    `;
  }).join("");

  const firstX = scaleX(firstValue);
  const secondX = scaleX(secondValue);
  const deltaX = (firstX + secondX) / 2;
  const deltaY = 155;
  const deltaColor = deltaValue >= 0 ? "var(--accent)" : "var(--accent-2)";

  return `
    <section class="opm2-chart-card comparison-card">
      <div class="chart-head">
        <h4 class="chart-title">${escapeHtml(title)}</h4>
        <p class="chart-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <svg class="comparison-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Линейное сравнение интегральных показателей">
        <line x1="${left}" y1="62" x2="${right}" y2="62" class="comparison-axis"></line>
        ${tickMarks}
        ${series}
        <line x1="${firstX}" y1="${rowY[0]}" x2="${secondX}" y2="${rowY[1]}" class="comparison-delta-line" style="stroke:${deltaColor};"></line>
        <circle cx="${deltaX}" cy="${deltaY}" r="18" class="comparison-delta-badge" style="fill:${deltaValue >= 0 ? 'rgba(47, 125, 115, 0.14)' : 'rgba(210, 109, 73, 0.14)'}; stroke:${deltaColor};"></circle>
        <text x="${deltaX}" y="${deltaY + 5}" text-anchor="middle" class="comparison-delta-text">${escapeHtml(`${deltaLabel} ${formatSignedScore(deltaValue)}`)}</text>
      </svg>
      <p class="chart-note">${escapeHtml(note)}</p>
    </section>
  `;
}
function renderRadarChartCard({ title, subtitle, axes, min, max, note }) {
  const chartValues = axes.map((axis) => axis.chartValue ?? axis.value);
  const displayValues = axes.map((axis) => axis.value);
  return `
    <section class="opm2-chart-card">
      <div class="chart-head">
        <h4 class="chart-title">${escapeHtml(title)}</h4>
        <p class="chart-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      ${renderRadarSvg(axes, chartValues, displayValues, min, max)}
      ${renderRadarSvg(axes, chartValues, displayValues, min, max, true)}
      ${note && String(note).trim() ? `<p class="chart-note">${escapeHtml(note)}</p>` : ""}
    </section>
  `;
}

function renderRadarSvg(axes, chartValues, displayValues, min, max, mobile = false) {
  const gradientId = `radar-fill-${++radarChartCounter}`;
  const width = 920;
  const height = 760;
  const cx = 460;
  const cy = 330;
  const radius = 250;
  const levels = 5;
  const angleStep = (Math.PI * 2) / axes.length;
  const startAngle = -Math.PI / 2;
  const angles = axes.map((_, index) => startAngle + angleStep * index);
  const gridRingValues = Array.from({ length: levels }, (_, index) => min + ((max - min) * (index + 1)) / levels);

  const point = (angle, distance) => [
    cx + Math.cos(angle) * distance,
    cy + Math.sin(angle) * distance,
  ];

  const polygonPoints = (radiusValue) => angles
    .map((angle) => point(angle, radiusValue))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const clampValue = (value) => {
    const safe = Number(value);
    if (!Number.isFinite(safe)) {
      return min;
    }
    return Math.min(max, Math.max(min, safe));
  };

  const gridPolygons = gridRingValues.map((ringValue, index) => {
    const r = radius * ((index + 1) / levels);
    return `<polygon points="${polygonPoints(r)}" class="radar-grid-ring"></polygon>`;
  }).join("");

  const axisLines = angles.map((angle) => {
    const [x, y] = point(angle, radius);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-axis-line"></line>`;
  }).join("");

  const labels = axes.map((axis, index) => {
    const isSideLabel = Math.abs(Math.cos(angles[index])) > 0.35;
    const [x, y] = point(angles[index], radius + (mobile && isSideLabel ? 26 : mobile ? 48 : 48));
    const dx = x < cx - 40 ? -10 : x > cx + 40 ? 10 : 0;
    const dy = y < cy - 40 ? -6 : y > cy + 40 ? 12 : 0;
    const anchor = x < cx - 40 ? "end" : x > cx + 40 ? "start" : "middle";
    const labelX = (x + dx).toFixed(1);
    const labelY = (y + dy).toFixed(1);
    const hasDetail = Boolean(axis.detail);
    const detailLines = mobile && hasDetail ? splitTextIntoTwoLines(axis.detail, 17, 4) : [];
    return `
      <text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="radar-label">
        <tspan x="${labelX}" dy="0">${escapeHtml(axis.label)}</tspan>
        ${mobile
          ? detailLines.map((line, lineIndex) => `<tspan x="${labelX}" dy="${lineIndex === 0 ? "22" : "20"}" class="radar-label-detail">${escapeHtml(line)}</tspan>`).join("")
          : hasDetail ? `<tspan x="${labelX}" dy="13" class="radar-label-detail">${escapeHtml(axis.detail)}</tspan>` : ""}
        <tspan x="${labelX}" dy="${mobile ? (hasDetail ? "28" : "30") : (hasDetail ? "15" : "18")}" class="radar-label-score">${escapeHtml(roundScore(displayValues[index]))}</tspan>
      </text>
    `;
  }).join("");

  const valuePoints = axes.map((axis, index) => {
    const normalized = (clampValue(chartValues[index]) - min) / (max - min);
    const [x, y] = point(angles[index], radius * normalized);
    return { x, y, label: axis.label, value: displayValues[index] };
  });

  const valuePolygon = `<polygon points="${valuePoints.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ")}" class="radar-value-fill"></polygon>`;
  const valueOutline = `<polygon points="${valuePoints.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ")}" class="radar-value-line"></polygon>`;
  const valueNodes = valuePoints.map((item) => `
    <g>
      <circle cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="5" class="radar-value-point"></circle>
      <title>${escapeHtml(item.label)}: ${escapeHtml(roundScore(item.value))}</title>
    </g>
  `).join("");

  return `
      <svg class="radar-svg ${mobile ? "radar-svg-mobile" : "radar-svg-desktop"}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Радиальная диаграмма">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#2f7d73" stop-opacity="0.42" />
          <stop offset="100%" stop-color="#2f7d73" stop-opacity="0.10" />
        </linearGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${radius}" class="radar-outer-circle"></circle>
      ${gridPolygons}
      ${axisLines}
      ${valuePolygon.replace('class="radar-value-fill"', `class="radar-value-fill" fill="url(#${gradientId})"`)}
      ${valueOutline}
      ${valueNodes}
      ${labels}
    </svg>
  `;
}

function normalizeRange(value, sourceMin, sourceMax, targetMin, targetMax) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const clamped = Math.min(sourceMax, Math.max(sourceMin, numeric));
  const ratio = (clamped - sourceMin) / (sourceMax - sourceMin);
  return targetMin + ratio * (targetMax - targetMin);
}

function renderDone() {
  return `
    <article class="done-card">
      <h2 class="section-title">Готово</h2>
      <p class="section-copy">Анкета завершена. Благодарим за участие в опросе!</p>
      <div class="footer-row">
        <button class="btn secondary mobile-return-to-results" type="button" data-action="prev-stage">← К результатам</button>
        <button class="btn primary" type="button" data-action="restart">Пройти еще раз</button>
      </div>
    </article>
  `;
}

function renderSidebar() {
  return `
    <section class="side-card">
      <h3 class="side-title">Текущий режим</h3>
      <div class="metric-grid">
        <div class="metric">
          <span>Этап</span>
          <strong>${escapeHtml(currentStageLabel())}</strong>
        </div>
        <div class="metric">
          <span>Ответы</span>
          <strong>${getTotalAnswered()}/${surveyData.totalItems}</strong>
        </div>
      </div>
    </section>

    <section class="side-card">
      <h3 class="side-title">Сводка</h3>
      <ul class="details-list">
        <li><span>Степень готовности к сотрудничеству</span><strong>${getMethodAnsweredCount("cooperation")}/${surveyData.methodologies.cooperation.questions.length}</strong></li>
        <li><span>Доверие</span><strong>${getMethodAnsweredCount("kupreychenko")}/${surveyData.methodologies.kupreychenko.questions.length}</strong></li>
        <li><span>ТРСИ</span><strong>${getMethodAnsweredCount("trsi")}/${surveyData.methodologies.trsi.questions.length}</strong></li>
        <li><span>ОПМ-2</span><strong>${getMethodAnsweredCount("opm2")}/${surveyData.methodologies.opm2.questions.length}</strong></li>
      </ul>
    </section>

    <section class="side-card">
      <h3 class="side-title">Профиль участника</h3>
      <ul class="details-list">
        <li><span>Должность</span><strong>${escapeHtml(state.passport.position || "—")}</strong></li>
        <li><span>Роль</span><strong>${escapeHtml(formatProjectRole(state.passport.roleInProject) || "—")}</strong></li>
        <li><span>Возраст</span><strong>${escapeHtml(state.passport.age || "—")}</strong></li>
        <li><span>Стаж</span><strong>${escapeHtml(state.passport.totalExperienceYears || "—")}</strong></li>
      </ul>
    </section>

    <section class="side-card">
      <h3 class="side-title">Черновик</h3>
      <p class="helper-text">Прогресс сохраняется автоматически. Можно скачать его в файл и загрузить обратно, если вкладка закроется.</p>
      <div class="footer-row">
        <button class="btn secondary" type="button" data-action="save-draft">Сохранить черновик</button>
        <button class="btn ghost" type="button" data-action="load-draft">Загрузить</button>
      </div>
      <p class="helper-text">${state.meta.lastImportedAt ? `Последняя загрузка: ${new Date(state.meta.lastImportedAt).toLocaleString("ru-RU")}` : ""}</p>
    </section>
  `;
}

function currentStageLabel() {
  if (state.stage === "cooperation") {
    return pageLabel("cooperation", state.cursor.cooperationPage);
  }
  if (state.stage === "kupreychenko") {
    return pageLabel("kupreychenko", state.cursor.kupreychenkoPage);
  }
  if (state.stage === "trsi") {
    return pageLabel("trsi", state.cursor.trsiPage);
  }
  if (state.stage === "opm2") {
    return pageLabel("opm2", state.cursor.opm2Page);
  }
  return stageLabels[state.stage] || "Готово";
}

function formatGender(value) {
  return passportSelectLabels[value] || "—";
}

function formatProjectRole(value) {
  if (Array.isArray(value)) {
    const labels = value.map((item) => passportSelectLabels[item]).filter(Boolean);
    return labels.length ? labels.join(", ") : "—";
  }
  return passportSelectLabels[value] || "—";
}

function handleClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  if (!action) {
    return;
  }

  if (action === "next-stage") {
    advanceStage();
    return;
  }

  if (action === "prev-stage") {
    retreatStage();
    return;
  }

  if (action === "go-stage") {
    goStage(target.dataset.stage);
    return;
  }

  if (action === "answer-single") {
    const methodKey = target.dataset.path;
    const index = Number(target.dataset.index);
    const value = target.dataset.value;
    if (!methodKey || Number.isNaN(index)) {
      return;
    }
    const parsedValue = methodKey === "cooperation" ? value : Number(value);
    setAnswer(methodKey, index, parsedValue);
    return;
  }

  if (action === "answer-paired") {
    const methodKey = target.dataset.path;
    const index = Number(target.dataset.index);
    const targetKey = target.dataset.target;
    const value = Number(target.dataset.value);
    if (!methodKey || Number.isNaN(index) || !targetKey) {
      return;
    }
    setAnswer(methodKey, index, value, targetKey);
    return;
  }

  if (action === "download-json") {
    downloadPayload();
    return;
  }

  if (action === "save-draft") {
    downloadDraft();
    return;
  }

  if (action === "load-draft") {
    const input = document.querySelector("#draft-import-input");
    if (input instanceof HTMLInputElement) {
      input.click();
    }
    return;
  }

  if (action === "copy-json") {
    copyPayloadToClipboard();
    return;
  }

  if (action === "submit-results") {
    submitResults();
    return;
  }

  if (action === "restart") {
    if (confirm("Начать новый проход и удалить текущий черновик?")) {
      removeState();
      Object.assign(state, createInitialState());
      saveState();
      render();
      scrollToTop();
    }
  }
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.dataset.action === "import-draft") {
    const file = target.files?.[0];
    target.value = "";
    if (file) {
      importDraftFile(file);
    }
    return;
  }

  if (!target.name) {
    return;
  }

  if (Object.hasOwn(state.passport, target.name)) {
    if (target.type === "checkbox") {
      if (target.name === "roleInProject") {
        const current = normalizeProjectRoles(state.passport.roleInProject);
        const next = target.checked
          ? Array.from(new Set([...current, target.value]))
          : current.filter((item) => item !== target.value);
        updatePassportField(target.name, next, true);
        return;
      }
      updatePassportField(target.name, target.checked, true);
      return;
    }
    updatePassportField(target.name, target.value, true);
    return;
  }

  if (Object.hasOwn(state.followup, target.name)) {
    if (target.name === "wantDetailedReport") {
      updateFollowupField(target.name, target.checked, true);
      if (!target.checked) {
        updateFollowupField("email", "", false);
      }
      return;
    }
    updateFollowupField(target.name, target.value, true);
  }
}

function handleInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (!target.name) {
    return;
  }

  if (target.type === "checkbox" || target.type === "radio") {
    return;
  }

  if (Object.hasOwn(state.passport, target.name)) {
    updatePassportField(target.name, target.value, false);
    return;
  }

  if (Object.hasOwn(state.followup, target.name)) {
    updateFollowupField(target.name, target.value, false);
  }
}

function calculateCooperationScore() {
  const key = surveyData.methodologies.cooperation.key;
  let score = 0;
  key.yes.forEach((itemNumber) => {
    if (state.answers.cooperation[itemNumber - 1] === "yes") {
      score += 1;
    }
  });
  key.no.forEach((itemNumber) => {
    if (state.answers.cooperation[itemNumber - 1] === "no") {
      score += 1;
    }
  });
  return score;
}

function getCooperationLevel(score) {
  if (score <= 8) {
    return {
      label: "Низкая",
      range: "0-8 баллов",
      tone: "low",
      color: "var(--danger)",
      fill: "rgba(162, 69, 57, 0.16)",
    };
  }
  if (score <= 17) {
    return {
      label: "Средняя",
      range: "9-17 баллов",
      tone: "mid",
      color: "var(--warning)",
      fill: "rgba(184, 97, 41, 0.18)",
    };
  }
  return {
    label: "Высокая",
    range: "18-25 баллов",
    tone: "high",
    color: "var(--success)",
    fill: "rgba(43, 125, 92, 0.18)",
  };
}

function renderCooperationGauge(score) {
  const level = getCooperationLevel(score);
  const width = 920;
  const height = 190;
  const left = 72;
  const right = 852;
  const trackWidth = right - left;
  const lowEnd = left + (8 / 25) * trackWidth;
  const midEnd = left + (17 / 25) * trackWidth;
  const scoreX = left + (Math.min(25, Math.max(0, score)) / 25) * trackWidth;
  const sections = [
    { x: left, width: lowEnd - left, fill: "rgba(162, 69, 57, 0.16)" },
    { x: lowEnd, width: midEnd - lowEnd, fill: "rgba(184, 97, 41, 0.18)" },
    { x: midEnd, width: right - midEnd, fill: "rgba(43, 125, 92, 0.18)" },
  ];
  const ticks = [
    { x: left, label: "0" },
    { x: lowEnd, label: "8" },
    { x: midEnd, label: "17" },
    { x: right, label: "25" },
  ];

  return `
    <div class="cooperation-gauge">
      <div class="cooperation-gauge-head">
        <div>
          <p class="cooperation-gauge-label">Степень готовности к сотрудничеству</p>
          <p class="cooperation-gauge-subtitle">Три уровня: низкая, средняя и высокая</p>
        </div>
        <div class="cooperation-gauge-badge" style="color:${level.color}; background:${level.fill};">
          ${escapeHtml(level.label)}
        </div>
      </div>
      <svg class="cooperation-gauge-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Шкала готовности к сотрудничеству">
        <rect x="${left}" y="70" width="${trackWidth}" height="18" rx="9" class="cooperation-gauge-track"></rect>
        ${sections.map((section) => `<rect x="${section.x}" y="70" width="${section.width}" height="18" rx="9" class="cooperation-gauge-section" style="fill:${section.fill};"></rect>`).join("")}
        <line x1="${lowEnd}" y1="58" x2="${lowEnd}" y2="108" class="cooperation-gauge-marker"></line>
        <line x1="${midEnd}" y1="58" x2="${midEnd}" y2="108" class="cooperation-gauge-marker"></line>
        <line x1="${scoreX}" y1="34" x2="${scoreX}" y2="126" class="cooperation-gauge-score-line" style="stroke:${level.color};"></line>
        <circle cx="${scoreX}" cy="61" r="12" class="cooperation-gauge-score-dot" style="fill:${level.color};"></circle>
        <text x="${scoreX}" y="65" text-anchor="middle" class="cooperation-gauge-score-text">${escapeHtml(String(score))}</text>
        ${ticks.map((tick) => `<text x="${tick.x}" y="130" text-anchor="middle" class="cooperation-gauge-tick">${tick.label}</text>`).join("")}
        <text x="${left}" y="154" text-anchor="start" class="cooperation-gauge-range">Низкая: 0-8</text>
        <text x="${(left + right) / 2}" y="154" text-anchor="middle" class="cooperation-gauge-range">Средняя: 9-17</text>
        <text x="${right}" y="154" text-anchor="end" class="cooperation-gauge-range">Высокая: 18-25</text>
      </svg>
      <p class="cooperation-gauge-note">Итог: ${escapeHtml(level.label.toLowerCase())} готовность к сотрудничеству (${level.range}).</p>
    </div>
  `;
}

function calculateKupreychenkoScores() {
  const method = surveyData.methodologies.kupreychenko;
  const getValue = (itemNumber, targetKey) => state.answers.kupreychenko[itemNumber - 1][targetKey];

  const trust = {};
  const distrust = {};

  method.scoring.trust.forEach((group) => {
    trust[group.key] = mean(group.items.map((itemNumber) => getValue(itemNumber, "trust")));
  });
  method.scoring.distrust.forEach((group) => {
    distrust[group.key] = mean(group.items.map((itemNumber) => getValue(itemNumber, "distrust")));
  });

  const trustValues = method.scoring.trust.map((group) => trust[group.key]);
  const distrustValues = method.scoring.distrust.map((group) => distrust[group.key]);

  const trustOverall = mean(trustValues);
  const distrustOverall = mean(distrustValues);

  return {
    trust,
    distrust,
    trustOverall,
    distrustOverall,
    balance: trustOverall !== null && distrustOverall !== null ? trustOverall - distrustOverall : null,
  };
}

function calculateTrsiScores() {
  const method = surveyData.methodologies.trsi;
  const primary = {};

  method.scoring.primary.forEach((group) => {
    primary[group.key] = mean(group.items.map((itemNumber) => state.answers.trsi[itemNumber - 1]));
  });

  const secondary = {};
  method.scoring.secondary.forEach((group) => {
    if (group.key === "acceptance") {
      secondary[group.key] = mean(group.items.map((key) => primary[key]));
    } else if (group.key === "rejection") {
      secondary[group.key] = mean(group.items.map((key) => primary[key]));
    }
  });

  return {
    primary,
    acceptance: secondary.acceptance,
    rejection: secondary.rejection,
    balance: secondary.acceptance !== null && secondary.rejection !== null ? secondary.acceptance - secondary.rejection : null,
  };
}

function calculateOpm2Scores() {
  const method = surveyData.methodologies.opm2;
  const primary = {};

  method.scoring.primary.forEach((group) => {
    primary[group.key] = mean(group.items.map((itemNumber) => state.answers.opm2[itemNumber - 1]));
  });

  const autonomous = mean([
    primary.vm,
    primary.int,
    primary.ide,
  ]);
  const controlled = mean([
    primary.intr,
    primary.exs,
    primary.am,
  ]);

  return {
    primary,
    autonomous,
    controlled,
    rai: autonomous !== null && controlled !== null ? autonomous - controlled : null,
  };
}

function buildPayload() {
  const kupreychenko = calculateKupreychenkoScores();
  const trsi = calculateTrsiScores();
  const opm2 = calculateOpm2Scores();

  return {
    meta: {
      timestamp: new Date().toISOString(),
      respondent: {
        position: state.passport.position.trim(),
        gender: state.passport.gender,
        age: Number(state.passport.age),
        total_experience_years: Number(state.passport.totalExperienceYears),
        role_in_project: Array.isArray(state.passport.roleInProject) ? [...state.passport.roleInProject] : [],
        influence_on_project: Boolean(state.passport.influenceOnProject),
        has_subordinates: Boolean(state.passport.hasSubordinates),
        email: state.followup.email.trim(),
      },
      followup: {
        want_detailed_report: Boolean(state.followup.wantDetailedReport),
        email: state.followup.email.trim(),
        detailed_report_email: state.followup.email.trim(),
      },
    },
    cooperation: {
      answers: state.answers.cooperation,
      score: calculateCooperationScore(),
      key: surveyData.methodologies.cooperation.key,
    },
    derived: {
      cooperation: {
        score: calculateCooperationScore(),
      },
      kupreychenko: {
        trust: {
          overall: kupreychenko.trustOverall,
        },
        distrust: {
          overall: kupreychenko.distrustOverall,
        },
        balance: kupreychenko.balance,
      },
      trsi: {
        acceptance: trsi.acceptance,
        rejection: trsi.rejection,
        balance: trsi.balance,
      },
      opm2: {
        autonomous: opm2.autonomous,
        controlled: opm2.controlled,
        rai: opm2.rai,
      },
    },
    kupreychenko: {
      questions: surveyData.methodologies.kupreychenko.questions.map((item, index) => ({
        number: item.number,
        text: item.text,
        trust: state.answers.kupreychenko[index].trust,
        distrust: state.answers.kupreychenko[index].distrust,
      })),
      scores: kupreychenko,
    },
    trsi: {
      questions: surveyData.methodologies.trsi.questions.map((item, index) => ({
        number: item.number,
        text: item.text,
        answer: state.answers.trsi[index],
      })),
      scores: trsi,
    },
    opm2: {
      questions: surveyData.methodologies.opm2.questions.map((item, index) => ({
        number: item.number,
        text: item.text,
        answer: state.answers.opm2[index],
      })),
      scores: opm2,
    },
  };
}

function buildSubmissionPayload() {
  return {
    kind: "questionnaire-response",
    submittedAt: new Date().toISOString(),
    respondent: {
      position: state.passport.position.trim(),
      gender: state.passport.gender,
      age: Number(state.passport.age),
      totalExperienceYears: Number(state.passport.totalExperienceYears),
      roleInProject: Array.isArray(state.passport.roleInProject) ? [...state.passport.roleInProject] : [],
      influenceOnProject: Boolean(state.passport.influenceOnProject),
      hasSubordinates: Boolean(state.passport.hasSubordinates),
      email: state.followup.email.trim(),
    },
    followup: {
      wantDetailedReport: Boolean(state.followup.wantDetailedReport),
      email: state.followup.email.trim(),
      detailedReportEmail: state.followup.email.trim(),
    },
    answers: {
      cooperation: state.answers.cooperation,
      kupreychenko: state.answers.kupreychenko,
      trsi: state.answers.trsi,
      opm2: state.answers.opm2,
    },
  };
}

function downloadPayload() {
  const payload = buildPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `responses-${new Date().toISOString().replaceAll(":", "-")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDraft() {
  saveState();
  const payload = createDraftSnapshot();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `questionnaire-draft-${new Date().toISOString().replaceAll(":", "-")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importDraftFile(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text.replace(/^\uFEFF/, "").trim());
    const imported = coerceImportedDraft(parsed);
    if (!imported) {
      alert("Этот файл не похож на черновик анкеты.");
      return;
    }

    const restored = normalizeLoadedState(imported);
    restored.meta.lastImportedAt = new Date().toISOString();
    Object.assign(state, restored);
    saveState();
    render();
    scrollToTop();
  } catch {
    alert("Не удалось прочитать файл. Проверь, что это сохранённый JSON-черновик.");
  }
}

async function copyPayloadToClipboard() {
  const payload = JSON.stringify(buildPayload(), null, 2);
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function buildEmailTextPayload(payload) {
  const timestamp = typeof payload?.meta?.timestamp === "string" ? payload.meta.timestamp : new Date().toISOString();
  const jsonText = JSON.stringify(payload, null, 2);
  const recipientEmail = String(state.followup.email || "").trim();
  const summary = [
    "Спасибо за участие в опросе.",
    "",
    `Профиль: ${state.passport.position || "—"}`,
    `Роль: ${formatProjectRole(state.passport.roleInProject) || "—"}`,
    `Степень готовности к сотрудничеству: ${calculateCooperationScore()} / 25`,
    `Доверие / недоверие: ${formatScorePair(payload.derived.kupreychenko.trust.overall, payload.derived.kupreychenko.distrust.overall)}`,
    `ТРСИ: ${formatScorePair(payload.derived.trsi.acceptance, payload.derived.trsi.rejection)}`,
    `ОПМ-2: автономная ${roundScore(payload.derived.opm2.autonomous)}, контролируемая ${roundScore(payload.derived.opm2.controlled)}`,
  ].join("\n");

  return {
    name: "Результаты опроса",
    time: new Date(timestamp).toLocaleString("ru-RU"),
    email: recipientEmail,
    message: `${summary}\n\nJSON:\n${jsonText}`,
  };
}

async function sendResultsByEmail(payload) {
  if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
    throw new Error("EmailJS не настроен: проверь service id, template id и public key в config.js");
  }

  const response = await fetch(EMAILJS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: buildEmailTextPayload(payload),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `EmailJS вернул статус ${response.status}`);
  }

  return text;
}

async function submitResults() {
  if (!isReviewComplete()) {
    const missing = [];
    if (!isPassportComplete()) {
      missing.push("профиль участника");
    }
    if (!isMethodComplete("cooperation")) {
      missing.push("сотрудничество");
    }
    if (!isMethodComplete("kupreychenko")) {
      missing.push("доверие");
    }
    if (!isMethodComplete("trsi")) {
      missing.push("ТРСИ");
    }
    if (!isMethodComplete("opm2")) {
      missing.push("ОПМ-2");
    }
    alert(missing.length
      ? `Не хватает ответов или данных: ${missing.join(", ")}.`
      : "Проверьте форму и попробуйте отправить ещё раз.");
    render();
    return;
  }

  const payload = buildPayload();
  try {
    await sendResultsByEmail(payload);
  } catch (error) {
    console.error(error);
    alert(error instanceof Error ? error.message : "Не удалось отправить письмо через EmailJS.");
    return;
  }

  state.meta.submittedAt = new Date().toISOString();
  state.meta.submissionMode = "email";
  state.meta.submissionId = crypto.randomUUID();

  state.stage = "done";
  state.meta.completedAt = new Date().toISOString();
  saveState();
  render();
  scrollToTop();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

