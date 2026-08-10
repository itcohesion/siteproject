const http = require("http");
const path = require("path");
const { promises: fs } = require("fs");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, "data");
const STORE_FILE = path.join(STORAGE_DIR, "responses.ndjson");
const EXPORT_TOKEN = String(process.env.QUESTIONNAIRE_EXPORT_TOKEN || "").trim();
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || "*").trim();

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, "", "utf8");
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readRecords() {
  const raw = await fs.readFile(STORE_FILE, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function appendRecord(record) {
  await fs.appendFile(STORE_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

function isAuthorized(urlObj, req) {
  if (!EXPORT_TOKEN) {
    return true;
  }

  const queryToken = String(urlObj.searchParams.get("token") || "").trim();
  if (queryToken && queryToken === EXPORT_TOKEN) {
    return true;
  }

  const auth = String(req.headers.authorization || "").trim();
  if (auth === `Bearer ${EXPORT_TOKEN}`) {
    return true;
  }

  return false;
}

async function handleRequest(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && urlObj.pathname === "/health") {
    const records = await readRecords().catch(() => []);
    sendJson(res, 200, { ok: true, records: records.length });
    return;
  }

  if (req.method === "POST" && urlObj.pathname === "/api/responses") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      if (!payload || typeof payload !== "object") {
        throw new Error("Payload must be an object");
      }

      const record = {
        id: randomUUID(),
        receivedAt: new Date().toISOString(),
        payload,
        request: {
          origin: req.headers.origin || "",
          referer: req.headers.referer || "",
          userAgent: req.headers["user-agent"] || "",
        },
      };

      await appendRecord(record);
      sendJson(res, 201, { ok: true, id: record.id, receivedAt: record.receivedAt });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad request" });
    }
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/export") {
    if (!isAuthorized(urlObj, req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    try {
      const records = await readRecords();
      sendJson(res, 200, { ok: true, records });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "Failed to read records" });
    }
    return;
  }

  if (req.method === "GET" && urlObj.pathname === "/api/latest") {
    try {
      const records = await readRecords();
      const latest = records.at(-1) || null;
      sendJson(res, 200, { ok: true, record: latest });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "Failed to read records" });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

async function main() {
  await ensureStorage();
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    console.log(`Questionnaire storage API listening on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
