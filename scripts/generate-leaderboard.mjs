import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOGS_DIR = path.resolve(process.cwd(), "../RiichiMahjongBench/logs");
const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "public/data/leaderboard.json"
);

const args = parseArgs(process.argv.slice(2));
const logsDir = path.resolve(
  process.cwd(),
  args.input || process.env.RESULTS_DIR || DEFAULT_LOGS_DIR
);
const outputPath = path.resolve(
  process.cwd(),
  args.output || DEFAULT_OUTPUT_PATH
);

const runs = await loadRuns(logsDir);
const payload = buildPayload(runs, logsDir);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`[leaderboard] generated ${outputPath}`);

function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const normalized = token.slice(2);
    if (normalized.includes("=")) {
      const [k, v] = normalized.split("=");
      out[k] = v;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[normalized] = next;
      i += 1;
    } else {
      out[normalized] = "true";
    }
  }
  return out;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseModelYaml(content) {
  const models = [];
  const pattern = /^\s*-\s*name\s*:\s*(.+?)\s*$/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const raw = match[1];
    const value = raw.replace(/^["']|["']$/g, "").trim();
    if (value) {
      models.push(value);
    }
  }
  return models;
}

function extractModelNamesFromText(text) {
  const re = /'([^']+)'/g;
  const names = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    names.push(m[1]);
  }
  return [...new Set(names)];
}

function parseRunTimestamp(name) {
  const matched = /^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})$/.exec(name);
  if (!matched) {
    return null;
  }
  return new Date(`${matched[1]}T${matched[2].replace(/-/g, ":")}`).toISOString();
}

async function parseRunLog(runPath, run) {
  const runLogPath = path.join(runPath, "run.log");
  if (!(await exists(runLogPath))) {
    return;
  }

  const text = await fs.readFile(runLogPath, "utf8");
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const startedAtMatch = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.exec(line);
    if (startedAtMatch && !run.started_at) {
      run.started_at = new Date(startedAtMatch[0]).toISOString();
    }

    const tournament = /tournament_start games=(\d+) format=([^\s]+) players=(\d+) models=(\[[^\]]+\])/.exec(line);
    if (tournament) {
      run.games_expected = Number(tournament[1]) || run.games_expected;
      run.format = tournament[2];
      const names = extractModelNamesFromText(tournament[3]);
      if (names.length) {
        run.models = names;
      }
      continue;
    }

    const gameStart = /game_start game=(\d+)\/(\d+)/.exec(line);
    if (gameStart) {
      run.games_seen.add(Number(gameStart[1]));
      if (gameStart[2]) {
        run.games_expected = Number(gameStart[2]);
      }
      continue;
    }

    const participants = /participants=(\[[^\]]+\])/.exec(line);
    if (participants) {
      const names = extractModelNamesFromText(participants[1]);
      if (names.length) {
        run.models = names;
      }
    }
  }
}

function updateScoreHistory(run, lineObj) {
  if (!lineObj || typeof lineObj !== "object") {
    return;
  }

  const scores = lineObj.scores;
  if (!scores || typeof scores !== "object") {
    return;
  }

  const entries = Object.entries(scores)
    .map(([name, score]) => [name, Number(score)])
    .filter(([, score]) => Number.isFinite(score));

  if (!entries.length) {
    return;
  }

  if (!run.first_scores) {
    run.first_scores = Object.fromEntries(entries);
  }
  run.last_scores = Object.fromEntries(entries);

  if (typeof lineObj.game_index === "number") {
    run.games_seen.add(lineObj.game_index);
  }
}

async function parseTurnFiles(runPath, run) {
  const gamesPath = path.join(runPath, "games");
  if (!(await exists(gamesPath))) {
    return;
  }
  const files = await fs.readdir(gamesPath, { withFileTypes: true });
  const jsonlFiles = files
    .filter((item) => item.isFile() && item.name.endsWith(".jsonl"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => item.name);

  for (const fileName of jsonlFiles) {
    const filePath = path.join(gamesPath, fileName);
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        updateScoreHistory(run, parsed);
      } catch {
        // Keep parser robust against non-json diagnostics inside log files.
      }
    }
  }
}

async function loadRuns(logDir) {
  const children = await fs.readdir(logDir, { withFileTypes: true });
  const runDirs = children
    .filter((item) => item.isDirectory())
    .filter((item) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(item.name))
    .map((item) => item.name)
    .sort((a, b) => b.localeCompare(a));

  const runs = [];
  for (const runDir of runDirs) {
    const runPath = path.join(logDir, runDir);
    const run = {
      run_id: runDir,
      run_path: runPath,
      started_at: parseRunTimestamp(runDir),
      format: null,
      games_expected: null,
      games_seen: new Set(),
      models: [],
      first_scores: null,
      last_scores: null,
      status: "unknown",
    };

    const modelYamlPath = path.join(runPath, "models.example.yaml");
    if (await exists(modelYamlPath)) {
      const content = await fs.readFile(modelYamlPath, "utf8");
      run.models = parseModelYaml(content);
    }

    await parseRunLog(runPath, run);
    await parseTurnFiles(runPath, run);

    if (run.first_scores && !run.last_scores) {
      run.last_scores = { ...run.first_scores };
    }
    if (!run.models.length && run.last_scores) {
      run.models = Object.keys(run.last_scores);
    }
    if (!run.started_at) {
      run.started_at = parseRunTimestamp(runDir);
    }

    if (run.games_expected && run.games_seen.size >= run.games_expected) {
      run.status = "completed";
    } else if (run.last_scores && Object.keys(run.last_scores).length > 0) {
      run.status = "partial";
    } else {
      run.status = "no_scores";
    }

    run.game_count = run.games_seen.size;
    runs.push({
      ...run,
      models: [...new Set(run.models)],
      games_seen: [...run.games_seen],
      first_scores: run.first_scores || {},
      last_scores: run.last_scores || {},
    });
  }

  return runs;
}

function buildPayload(runs, logsDir) {
  const modelMap = new Map();

  for (const run of runs) {
    for (const model of run.models) {
      if (!modelMap.has(model)) {
        modelMap.set(model, {
          model,
          runs: 0,
          score_sum: 0,
          max_score: -Infinity,
          min_score: Infinity,
          latest_score: null,
          latest_delta: null,
          latest_run_id: null,
          latest_run_at: null,
          run_items: [],
        });
      }

      const score = run.last_scores[model];
      if (typeof score === "number") {
        const modelItem = modelMap.get(model);
        modelItem.runs += 1;
        modelItem.score_sum += score;
        modelItem.max_score = Math.max(modelItem.max_score, score);
        modelItem.min_score = Math.min(modelItem.min_score, score);
        modelItem.run_items.push({
          run_id: run.run_id,
          started_at: run.started_at,
          score,
          status: run.status,
        });
      }
    }
  }

  for (const stat of modelMap.values()) {
    if (stat.runs > 0) {
      stat.avg_score = Number((stat.score_sum / stat.runs).toFixed(2));
      stat.max_score = Number(stat.max_score.toFixed(2));
      stat.min_score = Number(stat.min_score.toFixed(2));
      const best = stat.run_items
        .slice()
        .sort((a, b) => b.score - a.score)[0];
      stat.best = best;
      const latest = stat.run_items
        .slice()
        .sort((a, b) => (a.run_id < b.run_id ? 1 : -1))[0];
      stat.latest_run_id = latest?.run_id;
      stat.latest_score = latest?.score ?? null;
      stat.latest_run_at = latest?.started_at || null;
      if (stat.run_items.length > 1) {
        const prev = stat.run_items
          .slice()
          .sort((a, b) => (a.run_id < b.run_id ? 1 : -1))[1];
        stat.latest_delta = Number((stat.latest_score - prev.score).toFixed(2));
      } else {
        stat.latest_delta = null;
      }
      delete stat.run_items;
    } else {
      stat.avg_score = null;
      stat.max_score = null;
      stat.min_score = null;
      stat.best = null;
      stat.latest_run_id = null;
      stat.latest_score = null;
      stat.latest_delta = null;
    }
    delete stat.score_sum;
  }

  const leaderboard = [...modelMap.values()].sort((a, b) => {
    if (a.avg_score === null && b.avg_score === null) return 0;
    if (a.avg_score === null) return 1;
    if (b.avg_score === null) return -1;
    return b.avg_score - a.avg_score;
  });

  return {
    generated_at: new Date().toISOString(),
    source_dir: logsDir,
    summary: {
      run_count: runs.length,
      scored_run_count: runs.filter((run) => run.status === "completed").length,
      partial_run_count: runs.filter((run) => run.status === "partial").length,
      model_count: leaderboard.length,
    },
    runs,
    leaderboard,
  };
}
