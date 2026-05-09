const tagNames = {
  onsen: "温泉",
  bath: "大浴場",
  breakfast: "朝食",
  family: "子連れ",
  station: "駅近",
  budget: "コスパ",
  solo: "一人旅",
  lastminute: "直前予約",
  internet: "Wi-Fi",
  nonsmoking: "禁煙",
  highRating: "高評価"
};

const themeOptions = [
  { id: "onsen", label: "温泉" },
  { id: "station", label: "駅近" },
  { id: "family", label: "子連れ" },
  { id: "breakfast", label: "朝食" },
  { id: "budget", label: "コスパ" },
  { id: "highRating", label: "高評価" }
];

const purposeDefs = [
  {
    id: "onsen",
    title: "温泉・大浴場で探す",
    lead: "温泉や大浴場の記載がある宿を優先して表示します。",
    theme: "onsen",
    sort: "score"
  },
  {
    id: "station-value",
    title: "駅近コスパで探す",
    lead: "駅近と料金目安のバランスが良い宿を探します。",
    theme: "station",
    sort: "price",
    requireBudget: true
  },
  {
    id: "family",
    title: "子連れ向けで探す",
    lead: "家族旅行で比較しやすい宿を優先します。",
    theme: "family",
    sort: "rating"
  },
  {
    id: "breakfast",
    title: "朝食重視で探す",
    lead: "朝食・ビュッフェなどの記載がある宿を探します。",
    theme: "breakfast",
    sort: "rating"
  },
  {
    id: "highRating",
    title: "高評価で探す",
    lead: "レビュー評価4.4以上を中心に安心感で選びます。",
    theme: "highRating",
    sort: "rating"
  }
];

const state = {
  data: null,
  area: "all",
  stayDate: "all",
  theme: "all",
  query: "",
  sort: "score",
  budget: "all",
  available: true
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  bind();
  await load();
});

function bind() {
  $("query").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
  $("area").addEventListener("change", (event) => {
    state.area = event.target.value;
    render();
  });
  $("stayDate").addEventListener("change", (event) => {
    state.stayDate = event.target.value;
    render();
  });
  $("budget").addEventListener("change", (event) => {
    state.budget = event.target.value;
    render();
  });
  $("theme").addEventListener("change", (event) => {
    state.theme = event.target.value;
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
  document.addEventListener("click", (event) => {
    const purpose = event.target.closest("[data-purpose]");
    if (purpose) applyPurpose(purpose.dataset.purpose);
    const quickTheme = event.target.closest("[data-quick-theme]");
    if (quickTheme) applyPurpose(quickTheme.dataset.quickTheme);
  });
}

async function load() {
  try {
    const response = await fetch(`data/hotels.json?ts=${Date.now()}`, { cache: "no-store" });
    state.data = await response.json();
  } catch (error) {
    state.data = { hotels: [], themes: [], source: { type: "error", label: "取得エラー", note: error.message } };
  }
  const hotels = state.data.hotels || [];
  if (!hotels.some((hotel) => hotel.available)) {
    state.available = false;
    $("available").checked = false;
  }
  initFilters();
  render();
}

function initFilters() {
  const areas = [...new Set((state.data.hotels || []).map((hotel) => hotel.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  for (const area of areas) $("area").insertAdjacentHTML("beforeend", `<option value="${esc(area)}">${esc(area)}</option>`);

  const dates = [...new Set((state.data.hotels || []).map((hotel) => hotel.checkinDate).filter(Boolean))].sort();
  for (const date of dates) $("stayDate").insertAdjacentHTML("beforeend", `<option value="${esc(date)}">${esc(formatShortDate(date))}泊</option>`);
  if (dates.length === 1) {
    state.stayDate = dates[0];
    $("stayDate").value = dates[0];
  }

  const people = state.data.stay?.adultNum || 2;
  $("people").innerHTML = `<option value="${people}" selected>${people}名想定</option>`;
  $("people").disabled = true;

  for (const theme of themeOptions) $("theme").insertAdjacentHTML("beforeend", `<option value="${esc(theme.id)}">${esc(theme.label)}</option>`);
}

function applyPurpose(id) {
  const purpose = purposeDefs.find((item) => item.id === id) || purposeDefs.find((item) => item.theme === id);
  if (!purpose) return;
  state.theme = purpose.theme;
  state.sort = purpose.sort;
  if (purpose.requireBudget && state.budget === "all") state.budget = "12000";
  $("theme").value = state.theme;
  $("sort").value = state.sort;
  $("budget").value = state.budget;
  render();
  document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function visible() {
  const query = state.query;
  const upperBudget = state.budget === "all" ? null : Number(state.budget);
  const hotels = (state.data.hotels || []).filter((hotel) => {
    const text = [hotel.name, hotel.area, hotel.address, hotel.nearestStation, hotel.special, ...(hotel.tags || [])].join(" ").toLowerCase();
    if (state.area !== "all" && hotel.area !== state.area) return false;
    if (state.stayDate !== "all" && hotel.checkinDate !== state.stayDate) return false;
    if (state.theme !== "all" && !matchesTheme(hotel, state.theme)) return false;
    if (upperBudget && (!hotel.minCharge || hotel.minCharge > upperBudget)) return false;
    if (state.available && !hotel.available) return false;
    if (query && !text.includes(query)) return false;
    return true;
  });
  hotels.sort(sorter(state.sort));
  return hotels;
}

function matchesTheme(hotel, theme) {
  const tags = hotel.tags || [];
  if (theme === "highRating") return (hotel.reviewAverage || 0) >= 4.4;
  if (theme === "budget") return tags.includes("budget") || (hotel.minCharge && hotel.minCharge <= 12000);
  return hotel.theme === theme || tags.includes(theme);
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
  renderStatus();
  renderSummary(hotels);
  renderPurposes();
  renderConditions(hotels);
  renderCompare(hotels);
  $("count").textContent = `${hotels.length}件の楽天トラベル掲載宿`;
  $("cards").innerHTML = hotels.length ? hotels.map(card).join("") : emptyState();
}

function renderHero() {
  const pick = pickBest(state.data.hotels || []);
  if (!pick) {
    $("heroInsight").innerHTML = `<div class="pick-empty">楽天トラベル掲載宿を取得中です</div>`;
    return;
  }
  $("heroInsight").innerHTML = `
    <img src="${esc(resolveImage(pick.imageUrl))}" alt="${esc(pick.name)}">
    <div class="pick-body">
      <p class="section-label">楽天トラベル掲載宿からピックアップ</p>
      <h2>${esc(pick.name)}</h2>
      <p>${esc(recommendationReason(pick))}</p>
      <div class="mini-metrics">
        <span><b>${num(pick.reviewAverage)}</b><small>レビュー</small></span>
        <span><b>${yen(pick.minCharge)}</b><small>料金目安</small></span>
        <span><b>${availabilityShort(pick)}</b><small>空室</small></span>
      </div>
      <a class="btn full" href="${esc(pick.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天で空室・料金を見る</a>
    </div>`;
}

function renderStatus() {
  const source = state.data.source || {};
  $("statusStrip").innerHTML = `
    <span>表示中：${esc(currentDateLabel())} / 1泊 / ${state.data.stay?.adultNum || 2}名想定 / 楽天トラベル取得データ</span>
    <span>最終更新：${esc(formatDate(state.data.updatedAt))}</span>
    <span>${source.type === "rakuten" ? "楽天API取得済み" : esc(source.label || "要確認")}</span>`;
}

function renderSummary(hotels) {
  const avg = hotels.length ? hotels.reduce((sum, hotel) => sum + (hotel.reviewAverage || 0), 0) / hotels.length : 0;
  const prices = hotels.map((hotel) => hotel.minCharge).filter(Boolean).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const areas = new Set(hotels.map((hotel) => hotel.area).filter(Boolean));
  const available = hotels.filter((hotel) => hotel.available).length;
  $("summary").innerHTML = `
    <div class="metric"><strong>${hotels.length}</strong><span>表示中の宿候補</span></div>
    <div class="metric"><strong>${available}</strong><span>API取得時点で空室候補あり</span></div>
    <div class="metric"><strong>${avg.toFixed(2)}</strong><span>平均レビュー評価</span></div>
    <div class="metric"><strong>${yen(median)}</strong><span>中央値の料金目安</span></div>
    <div class="metric"><strong>${areas.size}</strong><span>表示中のエリア数</span></div>`;
}

function renderPurposes() {
  const all = state.data.hotels || [];
  $("updatedAt").textContent = `最終更新：${formatDate(state.data.updatedAt)}`;
  $("journeys").innerHTML = purposeDefs.map((purpose) => {
    const matched = all.filter((hotel) => matchesTheme(hotel, purpose.theme) && (!state.available || hotel.available)).sort(sorter(purpose.sort));
    const top = matched[0];
    const active = state.theme === purpose.theme ? " is-active" : "";
    return `<button class="journey${active}" type="button" data-purpose="${esc(purpose.id)}">
      <span>${esc(purpose.title)}</span>
      <small>${esc(purpose.lead)}</small>
      <b>${matched.length}件</b>
      <em>${top ? esc(top.name) : "候補なし"}</em>
    </button>`;
  }).join("");
}

function renderConditions(hotels) {
  const labels = [
    state.area === "all" ? "全エリア" : state.area,
    currentDateLabel(),
    `${state.data.stay?.adultNum || 2}名想定`,
    state.budget === "all" ? "予算指定なし" : `${yen(Number(state.budget))}まで`,
    state.theme === "all" ? "全テーマ" : tagNames[state.theme] || state.theme,
    state.available ? "空室候補ありのみ" : "空室未確認も含む"
  ];
  $("currentConditions").innerHTML = `<b>現在表示中の条件</b><span>${labels.map(esc).join(" / ")}</span><em>${hotels.length}件を表示中。実際の空室・料金は楽天トラベル公式ページでご確認ください。</em>`;
}

function renderCompare(hotels) {
  const picks = buildComparePicks(hotels);
  if (!picks.length) {
    $("compare").innerHTML = "";
    return;
  }
  $("compare").innerHTML = `
    <div class="section-head compact"><div><p class="section-label">3宿比較</p><h2>迷ったらこの3宿で比較</h2></div></div>
    <div class="compare-guide">${picks.map((item) => `<span>${esc(item.label)}なら <b>${esc(item.hotel.name)}</b></span>`).join("")}</div>
    <div class="compare-grid">${picks.map((item) => compareCard(item.hotel, item.label)).join("")}</div>`;
}

function buildComparePicks(hotels) {
  const candidates = [
    { label: "コスパ重視", hotel: pickValue(hotels) },
    { label: "温泉重視", hotel: pickOnsen(hotels) },
    { label: "駅近重視", hotel: pickStation(hotels) },
    { label: "高評価重視", hotel: pickBest(hotels) }
  ];
  const seen = new Set();
  const picks = [];
  for (const item of candidates) {
    if (!item.hotel || seen.has(item.hotel.id)) continue;
    seen.add(item.hotel.id);
    picks.push(item);
    if (picks.length >= 3) break;
  }
  return picks;
}

function compareCard(hotel, label) {
  return `<article class="compare-card">
    <p class="section-label">${esc(label)}なら</p>
    <h3>${esc(hotel.name)}</h3>
    <span>${esc(hotel.area || "")} / ${esc(accessLabel(hotel))}</span>
    <div class="compare-row"><small>料金目安</small><em>${yen(hotel.minCharge)}〜</em></div>
    <div class="compare-row"><small>レビュー</small><em>${num(hotel.reviewAverage)} / ${reviewCount(hotel)}</em></div>
    <div class="compare-row"><small>強み</small><em>${esc(recommendationReason(hotel))}</em></div>
    <div class="compare-row"><small>向いている人</small><em>${esc(suitedFor(hotel))}</em></div>
    <div class="compare-row"><small>注意点</small><em>${esc(cautionFor(hotel))}</em></div>
    <a class="btn full" href="${esc(hotel.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天で空室・料金を見る</a>
  </article>`;
}

function card(hotel) {
  const tags = (hotel.tags || []).slice(0, 6).map((tag) => `<span class="tag">${esc(tagNames[tag] || tag)}</span>`).join("");
  return `<article class="hotel">
    <img src="${esc(resolveImage(hotel.imageUrl))}" alt="${esc(hotel.name)}">
    <div class="hotel-main">
      <p class="availability">${esc(availabilityLabel(hotel))}</p>
      <h3>${esc(hotel.name)}</h3>
      <p class="meta">${esc(hotel.area || "")} / ${esc(accessLabel(hotel))}</p>
      <div class="key-facts">
        <span><small>レビュー</small><b>${num(hotel.reviewAverage)}</b></span>
        <span><small>件数</small><b>${reviewCount(hotel)}</b></span>
        <span><small>料金目安</small><b>${yen(hotel.minCharge)}〜</b></span>
      </div>
      <div class="traveler-notes">
        <p><b>おすすめ理由</b>${esc(recommendationReason(hotel))}</p>
        <p><b>向いている人</b>${esc(suitedFor(hotel))}</p>
        <p><b>注意点</b>${esc(cautionFor(hotel))}</p>
      </div>
      <p class="special">${esc(hotel.special || "")}</p>
      <div class="tags">${tags}</div>
    </div>
    <div class="hotel-side">
      <div class="price"><small>1泊1室あたり目安</small>${yen(hotel.minCharge)}〜</div>
      <a class="btn" href="${esc(hotel.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天で空室・料金を見る</a>
      <p class="side-note">実際の空室・料金は楽天トラベル公式ページでご確認ください。</p>
    </div>
  </article>`;
}

function recommendationReason(hotel) {
  const tags = hotel.tags || [];
  const rating = hotel.reviewAverage || 0;
  const price = hotel.minCharge || 0;
  const station = accessLabel(hotel);
  if (rating >= 4.6 && price && price <= 10000 && tags.includes("station")) {
    return `レビュー評価が高く、料金目安も比較的抑えめです。${station}のため、短期旅行や寝るだけ利用にも向いています。`;
  }
  if ((tags.includes("onsen") || tags.includes("bath")) && rating >= 4.2) {
    return "温泉・大浴場系の条件に合いやすく、レビュー評価も安定しています。週末にゆっくり過ごしたい旅行で候補に入れやすい宿です。";
  }
  if (tags.includes("family") && rating >= 4.2) {
    return "子連れ旅行で重視したいアクセスや使いやすさの条件に合いやすく、レビュー評価も比較的高めです。家族での週末旅行の候補に向いています。";
  }
  if (tags.includes("breakfast") && rating >= 4.2) {
    return "朝食やビュッフェ関連の記載があり、レビュー評価も比較的高めです。朝の満足度を重視したい旅行で比較しやすい宿です。";
  }
  if (tags.includes("station") && price && price <= 12000) {
    return `駅や主要スポットから使いやすく、料金目安も比較的抑えめです。移動時間を減らしたい週末旅行に向いています。`;
  }
  if ((hotel.availabilityCount || 0) >= 60) {
    return "楽天API取得時点で空室候補が多めにあり、直前でも比較しやすい宿です。条件を変えながらプランを確認しやすいのが強みです。";
  }
  return "レビュー、料金目安、空室候補のバランスを見て候補に残した宿です。予約前に楽天トラベルで設備やプラン内容を確認してください。";
}

function suitedFor(hotel) {
  const tags = hotel.tags || [];
  const items = [];
  if (tags.includes("station")) items.push("移動時間を減らしたい人");
  if (tags.includes("budget") || (hotel.minCharge && hotel.minCharge <= 12000)) items.push("コスパ重視の人");
  if (tags.includes("onsen") || tags.includes("bath")) items.push("温泉や大浴場で休みたい人");
  if (tags.includes("family")) items.push("子連れ旅行の人");
  if (tags.includes("breakfast")) items.push("朝食を楽しみたい人");
  if (tags.includes("solo")) items.push("一人旅や出張の人");
  if (!items.length) items.push("週末に気軽に泊まりたい人", "楽天トラベルで候補を比較したい人");
  return `${items.slice(0, 3).join("、")}。`;
}

function cautionFor(hotel) {
  const tags = hotel.tags || [];
  if (!hotel.available) return "空室候補は未確認です。楽天トラベル公式ページで日付・人数を指定して確認してください。";
  if (!(tags.includes("onsen") || tags.includes("bath"))) return "温泉や大浴場を重視する場合は、設備情報を楽天トラベル側で再確認してください。";
  if (!hotel.minCharge) return "料金目安を取得できていません。楽天トラベル側で最新プランを確認してください。";
  if ((hotel.reviewCount || 0) < 100) return "レビュー件数が少なめです。口コミ内容を楽天トラベル側で確認してから判断してください。";
  return "掲載情報は取得時点のものです。最新の料金、空室、プラン条件は楽天トラベル公式ページで確認してください。";
}

function emptyState() {
  return `<div class="empty"><b>条件に合う楽天トラベル掲載宿が見つかりませんでした。</b><br>予算上限、テーマ、空室候補の条件を少し広げて再検索してください。</div>`;
}

function pickBest(hotels) {
  return [...hotels].sort(sorter("score"))[0] || null;
}

function pickValue(hotels) {
  return [...hotels]
    .filter((hotel) => hotel.minCharge && (hotel.reviewAverage || 0) >= 4.2)
    .sort((a, b) => valueScore(b) - valueScore(a))[0] || pickBest(hotels);
}

function pickOnsen(hotels) {
  return [...hotels].filter((hotel) => matchesTheme(hotel, "onsen") || matchesTheme(hotel, "bath")).sort(sorter("score"))[0] || pickBest(hotels);
}

function pickStation(hotels) {
  return [...hotels].filter((hotel) => matchesTheme(hotel, "station")).sort(sorter("price"))[0] || pickBest(hotels);
}

function valueScore(hotel) {
  const priceBonus = hotel.minCharge ? Math.max(0, 16000 - hotel.minCharge) / 220 : 0;
  return (hotel.reviewAverage || 0) * 25 + priceBonus + Math.min(hotel.availabilityCount || 0, 80) * 0.3;
}

function accessLabel(hotel) {
  if (hotel.nearestStation) return `${hotel.nearestStation}周辺`;
  if (hotel.address) return hotel.address;
  return "アクセスは楽天トラベルで確認";
}

function availabilityLabel(hotel) {
  const updated = formatDate(state.data.updatedAt);
  return hotel.available
    ? `楽天API取得時点で空室候補あり / 最終更新：${updated}`
    : `空室は楽天トラベルで要確認 / 最終更新：${updated}`;
}

function availabilityShort(hotel) {
  return hotel.available ? "あり" : "要確認";
}

function currentDateLabel() {
  if (state.stayDate !== "all") return `${formatShortDate(state.stayDate)}泊`;
  const date = state.data.stay?.checkinDate;
  return date ? `${formatShortDate(date)}泊中心` : "取得済み日程";
}

function reviewCount(hotel) {
  return `${(hotel.reviewCount || 0).toLocaleString("ja-JP")}件`;
}

function resolveImage(value) {
  return value || "assets/hotel-placeholder.svg";
}

function formatDate(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(`${value}T00:00:00+09:00`));
}

function yen(value) {
  return value ? `${Number(value).toLocaleString("ja-JP")}円` : "要確認";
}

function num(value) {
  return value ? Number(value).toFixed(2) : "未取得";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}
