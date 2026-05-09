const tagNames = {
  onsen: "温泉",
  bath: "大浴場",
  breakfast: "朝食",
  family: "子連れ",
  station: "駅近",
  budget: "予算控えめ",
  solo: "一人旅",
  lastminute: "直前",
  internet: "Wi-Fi",
  nonsmoking: "禁煙"
};

const journeyDefs = [
  {
    id: "onsen-reset",
    title: "温泉でリセット",
    lead: "大浴場・温泉ワードがあり、直前でも候補が残っている宿",
    tags: ["onsen", "bath"],
    theme: "onsen",
    sort: "score"
  },
  {
    id: "family-easy",
    title: "子連れで外しにくい",
    lead: "移動しやすく、レビューと朝食まわりを同時に見たい宿",
    tags: ["family", "breakfast", "station"],
    theme: "family",
    sort: "rating"
  },
  {
    id: "station-value",
    title: "駅近コスパ旅",
    lead: "駅近・一人旅・予算控えめを優先して軽く泊まれる宿",
    tags: ["station", "budget", "solo"],
    theme: "station",
    sort: "price"
  },
  {
    id: "breakfast-morning",
    title: "朝が楽しみな宿",
    lead: "朝食やビュッフェの文脈があり、口コミの安心感もある宿",
    tags: ["breakfast"],
    theme: "breakfast",
    sort: "rating"
  }
];

const state = {
  data: null,
  theme: "all",
  query: "",
  sort: "score",
  available: true,
  intent: "all",
  drafts: []
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  bind();
  await load();
});

function bind() {
  $("query").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.intent = "all";
    render();
  });
  $("theme").addEventListener("change", (event) => {
    state.theme = event.target.value;
    state.intent = "all";
    render();
  });
  $("sort").addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  $("available").addEventListener("change", (event) => {
    state.available = event.target.checked;
    render();
  });
  $("draftBtn").addEventListener("click", () => makeDraft());
  document.addEventListener("click", async (event) => {
    const intentButton = event.target.closest("[data-intent]");
    if (intentButton) {
      applyIntent(intentButton.dataset.intent);
      return;
    }
    const draftButton = event.target.closest("[data-draft-hotel]");
    if (draftButton) {
      addHotelDraft(draftButton.dataset.draftHotel);
      return;
    }
    const copyButton = event.target.closest("[data-copy-draft]");
    if (copyButton) {
      await copyDraft(Number(copyButton.dataset.copyDraft), copyButton);
    }
  });
}

async function load() {
  try {
    const response = await fetch(`data/hotels.json?ts=${Date.now()}`, { cache: "no-store" });
    state.data = await response.json();
  } catch (error) {
    state.data = { hotels: [], themes: [], drafts: [], source: { type: "error", label: "取得エラー", note: error.message } };
  }
  state.drafts = [...(state.data.drafts || [])];
  const hotels = state.data.hotels || [];
  if (!hotels.some((hotel) => hotel.available)) {
    state.available = false;
    $("available").checked = false;
  }
  initThemes();
  render();
}

function initThemes() {
  const select = $("theme");
  for (const theme of state.data.themes || []) {
    select.insertAdjacentHTML("beforeend", `<option value="${esc(theme.id)}">${esc(theme.label)}</option>`);
  }
}

function applyIntent(intentId) {
  const intent = journeyDefs.find((item) => item.id === intentId);
  if (!intent) return;
  state.intent = intent.id;
  state.theme = intent.theme || "all";
  state.sort = intent.sort || "score";
  state.query = "";
  $("theme").value = state.theme;
  $("sort").value = state.sort;
  $("query").value = "";
  render();
  document.getElementById("compare")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function visible() {
  let hotels = [...(state.data.hotels || [])].filter((hotel) => {
    const text = [hotel.name, hotel.area, hotel.special, hotel.nearestStation, ...(hotel.tags || [])].join(" ").toLowerCase();
    if (state.theme !== "all" && hotel.theme !== state.theme && !(hotel.tags || []).includes(state.theme)) return false;
    if (state.available && !hotel.available) return false;
    if (state.query && !text.includes(state.query)) return false;
    if (state.intent !== "all") {
      const intent = journeyDefs.find((item) => item.id === state.intent);
      if (intent && !matchesJourney(hotel, intent)) return false;
    }
    return true;
  });
  hotels.sort(sorter(state.sort));
  return hotels;
}

function matchesJourney(hotel, intent) {
  const tags = hotel.tags || [];
  return intent.tags.some((tag) => tags.includes(tag) || hotel.theme === tag);
}

function sorter(kind) {
  if (kind === "rating") return (a, b) => (b.reviewAverage || 0) - (a.reviewAverage || 0) || (b.reviewCount || 0) - (a.reviewCount || 0);
  if (kind === "price") return (a, b) => (a.minCharge || 999999) - (b.minCharge || 999999) || (b.reviewAverage || 0) - (a.reviewAverage || 0);
  if (kind === "vacancy") return (a, b) => (b.availabilityCount || 0) - (a.availabilityCount || 0) || (b.reviewAverage || 0) - (a.reviewAverage || 0);
  return (a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0);
}

function render() {
  const hotels = visible();
  renderHero();
  renderSummary(hotels);
  renderJourneys();
  renderSpotlights();
  renderCompare(hotels);
  $("count").textContent = `${hotels.length}件の候補`;
  $("cards").innerHTML = hotels.length ? hotels.map(card).join("") : emptyState();
  renderDrafts();
}

function renderHero() {
  const all = state.data.hotels || [];
  const pick = pickBest(all);
  const source = state.data.source || {};
  $("updatedAt").textContent = `${formatDate(state.data.updatedAt)} 更新 / ${source.type === "rakuten" ? "楽天API取得済み" : source.label || "要確認"}`;
  if (!pick) {
    $("heroInsight").innerHTML = `<div class="pick-empty">宿候補を取得中です</div>`;
    return;
  }
  $("heroInsight").innerHTML = `
    <img src="${esc(resolveImage(pick.imageUrl))}" alt="${esc(pick.name)}">
    <div class="pick-body">
      <p class="eyebrow">今日の本命</p>
      <h2>${esc(pick.name)}</h2>
      <p>${esc(shortVerdict(pick))}</p>
      <div class="mini-metrics">
        <span><b>${num(pick.reviewAverage)}</b><small>レビュー</small></span>
        <span><b>${yen(pick.minCharge)}</b><small>目安</small></span>
        <span><b>${pick.availabilityCount || 0}</b><small>空室候補</small></span>
      </div>
      <a class="text-link" href="${esc(pick.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天トラベルで確認</a>
    </div>`;
}

function renderSummary(hotels) {
  const all = state.data.hotels || [];
  const avg = hotels.length ? hotels.reduce((sum, hotel) => sum + (hotel.reviewAverage || 0), 0) / hotels.length : 0;
  const prices = hotels.map((hotel) => hotel.minCharge).filter(Boolean).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const highReview = hotels.filter((hotel) => (hotel.reviewAverage || 0) >= 4.4).length;
  const source = state.data.source || {};
  const status = source.type === "rakuten" ? "取得済み" : source.type === "stale" ? "前回維持" : "要確認";
  $("summary").innerHTML = `
    <div class="metric"><strong>${hotels.length}</strong><span>表示中の候補</span></div>
    <div class="metric"><strong>${avg.toFixed(2)}</strong><span>平均レビュー</span></div>
    <div class="metric"><strong>${highReview}</strong><span>4.4以上の安心枠</span></div>
    <div class="metric"><strong>${yen(median)}</strong><span>中央値の料金目安</span></div>
    <div class="metric"><strong>${status}</strong><span>${esc(source.label || "データ状態")} / 全${all.length}件</span></div>`;
}

function renderJourneys() {
  const all = state.data.hotels || [];
  $("journeys").innerHTML = journeyDefs.map((journey) => {
    const matched = all.filter((hotel) => matchesJourney(hotel, journey) && (!state.available || hotel.available)).sort(sorter(journey.sort));
    const top = matched[0];
    const prices = matched.map((hotel) => hotel.minCharge).filter(Boolean).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    const active = state.intent === journey.id ? " is-active" : "";
    return `<button class="journey${active}" data-intent="${esc(journey.id)}">
      <span>${esc(journey.title)}</span>
      <small>${esc(journey.lead)}</small>
      <b>${matched.length}件 / ${yen(median)}</b>
      <em>${top ? esc(top.name) : "候補なし"}</em>
    </button>`;
  }).join("");
}

function renderSpotlights() {
  const all = state.data.hotels || [];
  const picks = uniqueHotels([
    ["総合", "迷ったら最初に見る", pickBest(all)],
    ["コスパ", "高評価と料金のバランス", pickValue(all)],
    ["空室厚め", "候補数に余裕がある", pickVacancy(all)]
  ]);
  $("spotlights").innerHTML = picks.map(([label, lead, hotel]) => spotlight(label, lead, hotel)).join("");
}

function spotlight(label, lead, hotel) {
  if (!hotel) return "";
  return `<article class="spotlight">
    <img src="${esc(resolveImage(hotel.imageUrl))}" alt="${esc(hotel.name)}">
    <div>
      <p class="eyebrow">${esc(label)}</p>
      <h3>${esc(hotel.name)}</h3>
      <p>${esc(lead)}。${esc(shortVerdict(hotel))}</p>
      <div class="tags">${(hotel.tags || []).slice(0, 4).map((tag) => `<span class="tag">${esc(tagNames[tag] || tag)}</span>`).join("")}</div>
    </div>
  </article>`;
}

function renderCompare(hotels) {
  const candidates = uniqueHotelList([
    pickBest(hotels),
    pickValue(hotels),
    pickVacancy(hotels),
    ...hotels
  ]).slice(0, 3);
  if (!candidates.length) {
    $("compare").innerHTML = "";
    return;
  }
  $("compare").innerHTML = `
    <div class="section-head compact"><div><p class="eyebrow">Decision</p><h2>迷ったらこの3宿で比較</h2></div></div>
    <div class="compare-grid">${candidates.map(compareCard).join("")}</div>`;
}

function compareCard(hotel) {
  return `<article class="compare-card">
    <b>${esc(hotel.name)}</b>
    <span>${esc(hotel.area || "")}</span>
    <div class="compare-row"><small>強み</small><em>${esc(shortVerdict(hotel))}</em></div>
    <div class="compare-row"><small>料金</small><em>${yen(hotel.minCharge)}〜</em></div>
    <div class="compare-row"><small>空室</small><em>${hotel.availabilityCount || 0}件</em></div>
  </article>`;
}

function card(hotel) {
  const tags = (hotel.tags || []).slice(0, 6).map((tag) => `<span class="tag">${esc(tagNames[tag] || tag)}</span>`).join("");
  const reasons = (hotel.reasons || []).slice(0, 3).map((reason) => `<span class="tag reason">${esc(reason)}</span>`).join("");
  const badge = hotel.available ? "空室候補" : "空室は要確認";
  return `<article class="hotel">
    <img src="${esc(resolveImage(hotel.imageUrl))}" alt="${esc(hotel.name)}">
    <div class="hotel-main">
      <p class="meta strong">${badge} / ${esc(dateRange(hotel))}</p>
      <h3>${esc(hotel.name)}</h3>
      <p class="meta">${esc(hotel.area || "")} ${hotel.nearestStation ? "/ " + esc(hotel.nearestStation) + "周辺" : ""}</p>
      <p class="verdict">${esc(shortVerdict(hotel))}</p>
      <p class="special">${esc(hotel.special || "")}</p>
      <div class="tags">${tags}</div>
      ${reasons ? `<div class="tags reasons">${reasons}</div>` : ""}
      <div class="score">
        <div><small>レビュー評価</small><b>${num(hotel.reviewAverage)}</b></div>
        <div><small>レビュー件数</small><b>${(hotel.reviewCount || 0).toLocaleString("ja-JP")}件</b></div>
        <div><small>空室候補</small><b>${hotel.availabilityCount || 0}件</b></div>
      </div>
    </div>
    <div class="hotel-side">
      <div class="price"><small>1泊1室あたり目安</small>${yen(hotel.minCharge)}〜</div>
      <a class="btn" href="${esc(hotel.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天で確認</a>
      <button class="ghost-btn small" data-draft-hotel="${esc(hotel.id)}">記事ネタに追加</button>
    </div>
  </article>`;
}

function emptyState() {
  const source = state.data?.source || {};
  return `<div class="empty"><b>条件に合う宿が見つかりませんでした。</b><br>${esc(source.note || "条件を広げるか、次回の自動更新後に確認してください。")}<br><a href="themes/all.html">全テーマの静的ページを見る</a></div>`;
}

function makeDraft() {
  const hotels = visible().slice(0, 5);
  if (!hotels.length) return;
  const label = state.intent !== "all"
    ? journeyDefs.find((journey) => journey.id === state.intent)?.title || "週末旅"
    : state.theme === "all"
      ? "週末直前"
      : $("theme").selectedOptions[0]?.textContent || state.theme;
  state.drafts.unshift(buildDraft(`${label}で狙いたい宿${Math.min(hotels.length, 5)}選`, hotels));
  renderDrafts();
  document.getElementById("draftArea")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addHotelDraft(id) {
  const hotel = (state.data.hotels || []).find((item) => String(item.id) === String(id));
  if (!hotel) return;
  state.drafts.unshift(buildDraft(`${hotel.area}で見つけた狙い目宿`, [hotel]));
  renderDrafts();
}

function buildDraft(title, hotels) {
  const lead = hotels[0]
    ? `${hotels[0].name}を軸に、レビュー・料金・空室候補のバランスで組んだ宿リストです。`
    : "宿候補を整理しました。";
  return {
    title,
    status: "下書き案",
    hotelIds: hotels.map((hotel) => hotel.id),
    updatedAt: new Date().toISOString(),
    lead,
    bullets: hotels.slice(0, 5).map((hotel) => `${hotel.name}: ${shortVerdict(hotel)} / ${yen(hotel.minCharge)}〜 / レビュー${num(hotel.reviewAverage)}`)
  };
}

function renderDrafts() {
  if (!state.drafts.length) {
    $("drafts").innerHTML = `<p class="meta">表示中の条件から記事ネタを生成できます。</p>`;
    return;
  }
  $("drafts").innerHTML = state.drafts.slice(0, 8).map((draft, index) => {
    const bullets = draft.bullets?.length
      ? `<ul>${draft.bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
      : `<p class="meta">${(draft.hotelIds || []).length}施設</p>`;
    return `<article class="draft">
      <div><b>${esc(draft.title)}</b><p>${esc(draft.lead || draft.status || "下書き")}</p>${bullets}</div>
      <button class="ghost-btn small" data-copy-draft="${index}">本文をコピー</button>
    </article>`;
  }).join("");
}

async function copyDraft(index, button) {
  const draft = state.drafts[index];
  if (!draft) return;
  const body = [`# ${draft.title}`, "", draft.lead || "", "", ...(draft.bullets || []).map((item) => `- ${item}`), "", "PR: 料金・空室状況は変動します。楽天トラベルで最新情報を確認してください。"].join("\n");
  try {
    await navigator.clipboard.writeText(body);
    button.textContent = "コピー済み";
  } catch {
    button.textContent = "コピー不可";
  }
  setTimeout(() => { button.textContent = "本文をコピー"; }, 1800);
}

function pickBest(hotels) {
  return [...hotels].sort(sorter("score"))[0] || null;
}

function pickValue(hotels) {
  return [...hotels]
    .filter((hotel) => hotel.minCharge && (hotel.reviewAverage || 0) >= 4.2)
    .sort((a, b) => valueScore(b) - valueScore(a))[0] || pickBest(hotels);
}

function pickVacancy(hotels) {
  return [...hotels].sort(sorter("vacancy"))[0] || pickBest(hotels);
}

function valueScore(hotel) {
  const priceBonus = hotel.minCharge ? Math.max(0, 16000 - hotel.minCharge) / 220 : 0;
  return (hotel.reviewAverage || 0) * 25 + priceBonus + Math.min(hotel.availabilityCount || 0, 80) * 0.3;
}

function uniqueHotels(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const hotel = item[2];
    if (!hotel || seen.has(hotel.id)) continue;
    seen.add(hotel.id);
    out.push(item);
  }
  return out;
}

function uniqueHotelList(hotels) {
  const seen = new Set();
  const out = [];
  for (const hotel of hotels) {
    if (!hotel || seen.has(hotel.id)) continue;
    seen.add(hotel.id);
    out.push(hotel);
  }
  return out;
}

function shortVerdict(hotel) {
  const tags = hotel.tags || [];
  if ((hotel.reviewAverage || 0) >= 4.6 && hotel.minCharge && hotel.minCharge <= 10000) return "高評価と手頃な料金目安が同時に見える狙い目";
  if (tags.includes("onsen") || tags.includes("bath")) return "温泉・大浴場文脈で週末のリセット旅に寄せやすい";
  if (tags.includes("family")) return "子連れ旅で比較候補に入れやすい安心寄りの宿";
  if (tags.includes("station") && tags.includes("budget")) return "駅近と予算控えめを両立しやすい実用枠";
  if ((hotel.availabilityCount || 0) >= 60) return "空室候補が厚く、直前でも比較しやすい";
  return "レビュー・料金・空室候補のバランスで残した宿";
}

function dateRange(hotel) {
  if (!hotel.checkinDate || !hotel.checkoutDate) return "日付要確認";
  return `${formatShortDate(hotel.checkinDate)}泊`;
}

function resolveImage(value) {
  return value || "assets/hotel-placeholder.svg";
}

function formatDate(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(`${value}T00:00:00+09:00`));
}

function yen(value) {
  return value ? `${Number(value).toLocaleString("ja-JP")}円` : "確認";
}

function num(value) {
  return value ? Number(value).toFixed(2) : "未取得";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}
