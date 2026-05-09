import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const site = resolveSiteUrl();
const check = process.argv.includes("--check");
const themeCopy = {
  all: ["楽天トラベル掲載宿の候補一覧", "楽天トラベルAPI取得データをもとに、空室候補、レビュー、料金目安、アクセスを整理しています。"],
  lastminute: ["今週末・直前予約に使いやすい宿", "楽天API取得時点で空室候補がある宿を中心に、直前旅行で比較しやすい候補を整理しています。"],
  onsen: ["温泉・大浴場で探す楽天トラベル掲載宿", "温泉や大浴場を重視したい方向けに、楽天トラベル掲載宿から候補を整理しています。"],
  family: ["子連れ旅行で探しやすい楽天トラベル掲載宿", "子連れ旅行で比較しやすい宿を、レビューやアクセスの情報とあわせて整理しています。"],
  breakfast: ["朝食重視で探す楽天トラベル掲載宿", "朝食やビュッフェの記載がある宿を中心に、楽天トラベル掲載宿から候補を整理しています。"],
  station: ["駅近で探す楽天トラベル掲載宿", "駅や主要エリアから使いやすい宿を、料金目安やレビューとあわせて整理しています。"],
  budget: ["コスパ重視で探す楽天トラベル掲載宿", "料金目安が比較的抑えめな宿を中心に、楽天トラベルで確認しやすい候補を整理しています。"]
};

const data = JSON.parse(await readFile(path.join(root, "data/hotels.json"), "utf8"));
const themes = [{ id: "all", label: "すべて" }, ...(data.themes || [])];
const out = [];

for (const theme of themes) {
  const hotels = (data.hotels || []).filter((hotel) => theme.id === "all" || hotel.theme === theme.id || (hotel.tags || []).includes(theme.id));
  out.push([`${theme.id}.html`, page(theme, hotels)]);
}

if (check) {
  console.log(`OK: ${out.length} static theme pages`);
  process.exit(0);
}

await mkdir(path.join(root, "themes"), { recursive: true });
for (const [name, html] of out) await writeFile(path.join(root, "themes", name), html, "utf8");
await writeFile(path.join(root, "robots.txt"), `User-agent: *\nAllow: /\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ""}`, "utf8");
if (site) await writeFile(path.join(root, "sitemap.xml"), sitemap(out.map(([name]) => `/themes/${name}`)), "utf8");
console.log(`Generated ${out.length} pages`);

function page(theme, hotels) {
  const [title, desc] = themeCopy[theme.id] || [`${theme.label}の楽天トラベル掲載宿`, `${theme.label}の宿候補です。`];
  const canonical = site ? `${site}/themes/${theme.id}.html` : "";
  const source = data.source || {};
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | 週末宿さがし</title><meta name="description" content="${esc(desc)}">${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}<link rel="stylesheet" href="../styles.css"></head><body><header class="topbar"><a class="brand" href="../index.html"><span class="mark">宿</span><span><b>週末宿さがし</b><small>楽天トラベル掲載宿からピックアップ</small></span></a><nav><a href="../index.html#searchPanel">条件で探す</a><a href="../index.html#purposePanel">目的別</a><a href="../index.html#results">宿一覧</a></nav></header><main class="shell"><section class="hero"><div class="hero-copy"><h1>${esc(title)}</h1><p>${esc(desc)}</p><p class="disclosure">予約前に必ず楽天トラベル公式ページで最新料金・空室・プラン内容をご確認ください。</p></div></section><section class="status-strip"><span>表示中：楽天トラベル取得データ</span><span>最終更新：${esc(formatDate(data.updatedAt))}</span><span>${esc(source.type === "rakuten" ? "楽天API取得済み" : source.label || "要確認")}</span></section><section class="summary"><div class="metric"><strong>${hotels.length}</strong><span>掲載候補</span></div><div class="metric"><strong>${hotels.filter((hotel) => hotel.available).length}</strong><span>API取得時点で空室候補あり</span></div><div class="metric"><strong>${esc(formatDate(data.updatedAt))}</strong><span>最終更新</span></div></section><section class="cards">${hotels.length ? hotels.map(card).join("") : emptyState()}</section></main><footer><p>当サイトは楽天トラベルの情報をもとに宿泊候補を整理しています。掲載情報は取得時点のものであり、最新の料金・空室・プラン内容は楽天トラベル公式ページでご確認ください。</p><p>当サイトは楽天アフィリエイトを利用しています。リンク経由で予約・購入が発生した場合、当サイトが報酬を受け取ることがあります。</p></footer></body></html>`;
}

function card(hotel) {
  return `<article class="hotel"><img src="${esc(resolveImage(hotel.imageUrl))}" alt="${esc(hotel.name)}"><div class="hotel-main"><p class="availability">${esc(availabilityLabel(hotel))}</p><h3>${esc(hotel.name)}</h3><p class="meta">${esc(hotel.area || "")} / ${esc(accessLabel(hotel))}</p><div class="key-facts"><span><small>レビュー</small><b>${num(hotel.reviewAverage)}</b></span><span><small>件数</small><b>${reviewCount(hotel)}</b></span><span><small>料金目安</small><b>${yen(hotel.minCharge)}〜</b></span></div><div class="traveler-notes"><p><b>おすすめ理由</b>${esc(recommendationReason(hotel))}</p><p><b>向いている人</b>${esc(suitedFor(hotel))}</p><p><b>注意点</b>${esc(cautionFor(hotel))}</p></div><p class="special">${esc(hotel.special || "")}</p></div><div class="hotel-side"><div class="price"><small>1泊1室あたり目安</small>${yen(hotel.minCharge)}〜</div><a class="btn" href="${esc(hotel.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天で空室・料金を見る</a><p class="side-note">実際の空室・料金は楽天トラベル公式ページでご確認ください。</p></div></article>`;
}

function recommendationReason(hotel) {
  const tags = hotel.tags || [];
  const rating = hotel.reviewAverage || 0;
  const price = hotel.minCharge || 0;
  if (rating >= 4.6 && price && price <= 10000 && tags.includes("station")) return "レビュー評価が高く、料金目安も比較的抑えめです。駅や主要エリアから使いやすく、短期旅行にも向いています。";
  if ((tags.includes("onsen") || tags.includes("bath")) && rating >= 4.2) return "温泉・大浴場系の条件に合いやすく、レビュー評価も安定しています。週末にゆっくり過ごしたい旅行で候補に入れやすい宿です。";
  if (tags.includes("family") && rating >= 4.2) return "子連れ旅行で重視したいアクセスや使いやすさの条件に合いやすく、レビュー評価も比較的高めです。";
  if (tags.includes("breakfast") && rating >= 4.2) return "朝食やビュッフェ関連の記載があり、レビュー評価も比較的高めです。朝の満足度を重視したい旅行で比較しやすい宿です。";
  if (tags.includes("station") && price && price <= 12000) return "駅や主要スポットから使いやすく、料金目安も比較的抑えめです。移動時間を減らしたい週末旅行に向いています。";
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
  if (!items.length) items.push("週末に気軽に泊まりたい人");
  return `${items.slice(0, 3).join("、")}。`;
}

function cautionFor(hotel) {
  const tags = hotel.tags || [];
  if (!hotel.available) return "空室候補は未確認です。楽天トラベル公式ページで日付・人数を指定して確認してください。";
  if (!(tags.includes("onsen") || tags.includes("bath"))) return "温泉や大浴場を重視する場合は、設備情報を楽天トラベル側で再確認してください。";
  return "掲載情報は取得時点のものです。最新の料金、空室、プラン条件は楽天トラベル公式ページで確認してください。";
}

function emptyState() {
  return `<div class="empty"><b>候補がまだありません。</b><br>最新の空室・料金は楽天トラベル公式ページで確認してください。</div>`;
}

function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc></url>\n${paths.map((urlPath) => `  <url><loc>${site}${urlPath}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function resolveImage(value) {
  if (!value) return "../assets/hotel-placeholder.svg";
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("../")) return value;
  return `../${value.replace(/^\.\//, "")}`;
}

function resolveSiteUrl() {
  const raw = (process.env.PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (raw && !/github\.com\/.+\.git$/i.test(raw)) return raw;
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo && repo.includes("/")) {
    const [owner, name] = repo.split("/");
    return `https://${owner}.github.io/${name}`;
  }
  return "";
}

function accessLabel(hotel) {
  if (hotel.nearestStation) return `${hotel.nearestStation}周辺`;
  if (hotel.address) return hotel.address;
  return "アクセスは楽天トラベルで確認";
}

function availabilityLabel(hotel) {
  const updated = formatDate(data.updatedAt);
  return hotel.available ? `楽天API取得時点で空室候補あり / 最終更新：${updated}` : `空室は楽天トラベルで要確認 / 最終更新：${updated}`;
}

function reviewCount(hotel) {
  return `${(hotel.reviewCount || 0).toLocaleString("ja-JP")}件`;
}

function formatDate(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
