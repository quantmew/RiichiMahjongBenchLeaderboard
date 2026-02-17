const DATA_URL = "./data/leaderboard.json";

const summaryEl = document.querySelector("#summary");
const tbodyEl = document.querySelector("#leaderboardBody");
const reloadBtn = document.querySelector("#reloadBtn");

reloadBtn.addEventListener("click", renderFromApi);

async function renderFromApi() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    render(payload);
  } catch (err) {
    showError(err);
  }
}

function render(payload) {
  const { summary, leaderboard = [] } = payload;
  const source = payload.source_dir || "未知目录";
  const generatedAt = payload.generated_at
    ? new Date(payload.generated_at).toLocaleString()
    : "未知时间";

  summaryEl.innerHTML = `
    <p><strong>生成时间：</strong>${generatedAt}</p>
    <p><strong>结果来源：</strong>${escapeHtml(source)} (${summary?.run_count ?? 0} 个run)</p>
    <p><strong>完成局数：</strong>${summary?.scored_run_count ?? 0}，未完成/进行中：${summary?.partial_run_count ?? 0}</p>
  `;

  const rows = [...leaderboard].map((entry) => {
    const model = escapeHtml(entry.model || "未知模型");
    const avg = entry.avg_score === null ? "-" : formatNumber(entry.avg_score);
    const max = entry.max_score === null ? "-" : formatNumber(entry.max_score);
    const min = entry.min_score === null ? "-" : formatNumber(entry.min_score);
    const runs = entry.runs ?? 0;
    const latest = entry.latest_score === null ? "-" : formatNumber(entry.latest_score);
    const delta = entry.latest_delta;
    const deltaText = formatDelta(delta);
    const status = delta !== null
      ? delta >= 0
        ? "positive"
        : "negative"
      : "";
    return {model, avg, max, min, runs, latest, deltaText, status};
  });

  tbodyEl.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = `<td colspan="8">暂无可展示模型数据，请先运行 scripts/generate-leaderboard.mjs</td>`;
    tbodyEl.appendChild(empty);
    return;
  }

  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    if (i < 3) {
      tr.classList.add(`rank-${i + 1}`);
    }
    const rankBadge =
      i < 3
        ? `<span class="badge">${i + 1}</span>`
        : String(i + 1);
    tr.innerHTML = `
      <td>${rankBadge}</td>
      <td>${row.model}</td>
      <td>${row.avg}</td>
      <td>${row.max}</td>
      <td>${row.min}</td>
      <td>${row.runs}</td>
      <td>${row.latest}</td>
      <td class="${row.status}">${row.deltaText}</td>
    `;
    tbodyEl.appendChild(tr);
  });
}

function formatDelta(delta) {
  if (delta === null) {
    return "-";
  }
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatNumber(delta)}`;
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function showError(error) {
  summaryEl.textContent = `数据加载失败：${error.message || error}`;
  tbodyEl.innerHTML = `<tr><td colspan="8">请先在项目目录执行：
    <code>npm run build</code>
    生成 public/data/leaderboard.json。</td></tr>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

renderFromApi();
