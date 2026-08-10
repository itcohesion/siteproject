const path = require("path");
const { promises: fs } = require("fs");

const API_URL = String(process.env.QUESTIONNAIRE_RESULTS_EXPORT_URL || "").trim();
const EXPORT_TOKEN = String(process.env.QUESTIONNAIRE_RESULTS_EXPORT_TOKEN || "").trim();
const OUTPUT_DIR = process.env.QUESTIONNAIRE_RESULTS_OUTPUT_DIR
  ? path.resolve(process.env.QUESTIONNAIRE_RESULTS_OUTPUT_DIR)
  : path.resolve(process.cwd(), "responses");

function ensureEndpoint() {
  if (!API_URL) {
    throw new Error("QUESTIONNAIRE_RESULTS_EXPORT_URL is required");
  }
}

function safeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "record";
}

async function writeRecordFile(record) {
  const source = record.payload && typeof record.payload === "object" ? record.payload : record;
  const receivedAt = String(record.receivedAt || source?.meta?.timestamp || new Date().toISOString());
  const date = receivedAt.slice(0, 10);
  const id = safeSegment(record.id || source?.meta?.submissionId || receivedAt);
  const dir = path.join(OUTPUT_DIR, date);
  const filePath = path.join(dir, `${receivedAt.replace(/:/g, "-")}_${id}.json`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return filePath;
}

async function main() {
  ensureEndpoint();

  const url = new URL(API_URL);
  url.pathname = url.pathname.replace(/\/$/, "") + "/api/export";
  if (EXPORT_TOKEN) {
    url.searchParams.set("token", EXPORT_TOKEN);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Export API returned ${response.status}`);
  }

  const data = await response.json();
  const records = Array.isArray(data?.records) ? data.records : [];

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const files = [];
  for (const record of records) {
    files.push(await writeRecordFile(record));
  }

  console.log(`Exported ${records.length} records to ${OUTPUT_DIR}`);
  files.forEach((file) => console.log(file));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
