import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const site = resolveSiteUrl();
const check = process.argv.includes("--check");
const copy = {
  all: ["直前予約に強い高評価ホテル一覧", "楽天トラベルの空室候補、施設候補、レビュー、料金目安を整理しています。"],
  lastminute: ["直前予約で探しやすい高評価ホテル", "週末や連休前の宿候補を確認できます。"],
  onsen: ["温泉・大浴場つきの高評価宿", "温泉や大浴場を楽しみたい方向けの宿候補です。"],
  family: ["子連れ旅行で選びやすいホテル", "家族旅行で確認したい宿候補です。"],
  breakfast: ["朝食評価で選びやすいホテル", "朝食付きプランと相性の良いホテル候補です。"],
  station: ["駅近で使いやすいホテル", "観光、出張、一人旅で移動しやすい宿候補です。"],
  budget: ["予算控えめで探しやすいホテル", "料金目安を抑えた宿候補です。"]
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
  const [title, desc] = copy[theme.id] || [`${theme.label}のホテル一覧`, `${theme.label}の宿候補です。`];
  const canonical = site ? `${site}/themes/${theme.id}.html` : "";
  const updated = formatDate(data.updatedAt);
  const source = data.source || {};
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | 週末宿みつけ</title><meta name="description" content="${esc(desc)}">${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}<link rel="stylesheet" href="../styles.css"></head><body><header class="topbar"><a class="brand" href="../index.html"><span class="mark">宿</span><span><b>週末宿みつけ</b><small>楽天トラベル空室リサーチ</small></span></a><nav><a href="../index.html">検索ツールへ戻る</a></nav></header><main class="shell"><section class="hero"><div><p class="eyebrow">Theme Page</p><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><aside class="notice">PR: 当サイトは楽天トラベルのアフィリエイトプログラムに参加予定です。料金・空室状況は変動します。</aside></section><section class="summary"><div class="metric"><strong>${hotels.length}</strong><span>掲載候補</span></div><div class="metric"><strong>${esc(source.type === "rakuten" ? "取得済み" : source.type === "stale" ? "前回維持" : "要確認")}</strong><span>${esc(source.label || "データ状態")}</span></div><div class="metric"><strong>${esc(updated)}</strong><span>最終更新</span></div></section>${source.note ? `<section class="notice">${esc(source.note)}</section>` : ""}<section class="cards">${hotels.length ? hotels.map(card).join("") : emptyState()}</section></main><footer>Powered by Rakuten Web Service. 楽天トラベル公式ページではありません。</footer></body></html>`;
}

function card(hotel) {
  const badge = hotel.available ? "空室候補" : "空室は要確認";
  const reasons = (hotel.reasons || []).slice(0, 3).map((reason) => `<span class="tag">${esc(reason)}</span>`).join("");
  return `<article class="hotel"><img src="${esc(resolveImage(hotel.imageUrl))}" alt="${esc(hotel.name)}"><div><p class="meta">${esc(badge)}</p><h3>${esc(hotel.name)}</h3><p class="meta">${esc(hotel.area || "")}</p><p class="special">${esc(hotel.special || "")}</p>${reasons ? `<div class="tags">${reasons}</div>` : ""}</div><div><div class="price"><small>1泊1室あたり目安</small>${hotel.minCharge ? `${Number(hotel.minCharge).toLocaleString("ja-JP")}円` : "確認"}〜</div><a class="btn" href="${esc(hotel.rakutenUrl || "https://travel.rakuten.co.jp/")}" target="_blank" rel="sponsored noopener">楽天トラベルで見る</a></div></article>`;
}

function emptyState() {
  return `<div class="empty"><b>候補がまだありません。</b><br>自動取得の条件を広げて再取得します。最新の空室・料金は楽天トラベルで確認してください。</div>`;
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

function formatDate(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}
