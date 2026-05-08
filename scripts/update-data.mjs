import { mkdir, readFile, writeFile } from "node:fs/promises";

const appId = process.env.RAKUTEN_APPLICATION_ID;
const accessKey = process.env.RAKUTEN_ACCESS_KEY;
const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
const check = process.argv.includes("--check");
const dataPath = "data/hotels.json";
const apiBase = "https://openapi.rakuten.co.jp/engine/api";
const requestDelayMs = 1150;
const apiReferer = resolveSiteUrl();

const themes = [
  { id: "lastminute", label: "直前予約" },
  { id: "onsen", label: "温泉・大浴場" },
  { id: "family", label: "子連れ" },
  { id: "breakfast", label: "朝食評価" },
  { id: "station", label: "駅近" },
  { id: "budget", label: "予算控えめ" }
];

const locations = [
  { label: "神奈川 / 箱根", lat: 35.2324, lng: 139.1069, theme: "onsen", tags: ["lastminute", "onsen", "bath"], squeeze: "onsen" },
  { label: "静岡 / 熱海", lat: 35.0956, lng: 139.0717, theme: "breakfast", tags: ["lastminute", "onsen", "breakfast", "station"], squeeze: "onsen" },
  { label: "群馬 / 草津温泉", lat: 36.6233, lng: 138.5969, theme: "onsen", tags: ["lastminute", "onsen", "bath"], squeeze: "onsen" },
  { label: "栃木 / 鬼怒川温泉", lat: 36.8204, lng: 139.7163, theme: "family", tags: ["lastminute", "onsen", "family"], squeeze: "onsen" },
  { label: "千葉 / 舞浜", lat: 35.6365, lng: 139.8836, theme: "family", tags: ["family", "breakfast", "station"] },
  { label: "神奈川 / 横浜みなとみらい", lat: 35.4579, lng: 139.6329, theme: "station", tags: ["station", "breakfast", "family"] },
  { label: "京都 / 京都駅", lat: 34.9858, lng: 135.7588, theme: "station", tags: ["station", "budget", "solo", "internet"] },
  { label: "大阪 / なんば", lat: 34.6671, lng: 135.5002, theme: "budget", tags: ["station", "budget", "solo"] },
  { label: "福岡 / 博多", lat: 33.5902, lng: 130.4207, theme: "station", tags: ["station", "breakfast", "budget"] },
  { label: "北海道 / 札幌", lat: 43.0687, lng: 141.3508, theme: "breakfast", tags: ["breakfast", "station", "budget"] }
];

if (check) {
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  if (!Array.isArray(data.hotels)) throw new Error("data.hotels must be array");
  if (!Array.isArray(data.themes)) throw new Error("data.themes must be array");
  console.log(`OK: ${data.hotels.length} hotels, source=${data.source?.type || "unknown"}`);
  process.exit(0);
}

const current = await readExistingData();
const stayOptions = buildStayOptions();

if (!appId || !accessKey) {
  if (current) {
    console.log("Rakuten credentials are not set. Keeping existing data.");
    process.exit(0);
  }
  await writeData(buildFallbackData(stayOptions, "Rakuten API credentials are not set."));
  process.exit(0);
}

const report = [];
const rawHotels = [];

for (const loc of locations) {
  const found = await fetchLocationHotels(loc, stayOptions, report);
  rawHotels.push(...found);
}

const list = dedupe(rawHotels)
  .map((hotel) => ({ ...hotel, recommendationScore: score(hotel) }))
  .sort((a, b) => b.recommendationScore - a.recommendationScore)
  .slice(0, 100);

let nextData;
if (list.length > 0) {
  nextData = buildData({
    hotels: list,
    stayOptions,
    report,
    source: {
      type: "rakuten",
      label: "Rakuten Travel API",
      note: "空室検索を複数日・複数条件で試し、空室が少ないエリアは施設検索候補で補完しています。料金・空室は楽天トラベル側で最終確認してください。"
    }
  });
} else if (current?.hotels?.length && current.source?.type !== "fallback") {
  nextData = {
    ...current,
    updatedAt: new Date().toISOString(),
    nextRunLabel: "毎日 07:10 JST",
    stayOptions,
    source: {
      type: "stale",
      label: "前回のRakuten Travel API取得結果",
      note: "今回の空室検索と施設検索が0件だったため、前回のデータを維持しています。料金・空室は必ず楽天トラベルで確認してください。"
    },
    fetchSummary: report
  };
} else {
  nextData = buildFallbackData(stayOptions, "Rakuten API returned no hotel candidates.", report);
}

await writeData(nextData);
await writeDraft(nextData);
console.log(`Updated ${nextData.hotels.length} records (${nextData.source.type}).`);

async function fetchLocationHotels(loc, stayOptions, report) {
  const hotels = [];
  const attempts = buildVacantAttempts(loc, stayOptions);

  for (const attempt of attempts) {
    try {
      const rows = await fetchVacantHotels(loc, attempt);
      hotels.push(...rows);
      report.push({ area: loc.label, mode: attempt.label, checkinDate: attempt.stay.checkinDate, count: rows.length });
      if (hotels.length >= 10) break;
    } catch (error) {
      report.push({ area: loc.label, mode: attempt.label, checkinDate: attempt.stay.checkinDate, error: error.message });
    }
  }

  if (hotels.length === 0) {
    try {
      const rows = await fetchFacilityCandidates(loc);
      hotels.push(...rows);
      report.push({ area: loc.label, mode: "facility-fallback", count: rows.length });
    } catch (error) {
      report.push({ area: loc.label, mode: "facility-fallback", error: error.message });
    }
  }

  console.log(`[area] ${loc.label}: ${hotels.length} records`);
  return hotels;
}

function buildVacantAttempts(loc, stayOptions) {
  const attempts = [];
  const nearDates = stayOptions.slice(0, 6);
  if (loc.squeeze) {
    for (const stay of nearDates.slice(0, 3)) {
      attempts.push({ stay, squeeze: loc.squeeze, radius: "3", label: `vacant-${loc.squeeze}` });
    }
  }
  for (const stay of nearDates) {
    attempts.push({ stay, radius: "3", label: "vacant-relaxed" });
  }
  return attempts;
}

async function fetchVacantHotels(loc, attempt) {
  const params = baseParams(loc, {
    searchPattern: "0",
    responseType: "middle",
    hotelThumbnailSize: "3",
    hits: "30",
    sort: "standard",
    checkinDate: attempt.stay.checkinDate,
    checkoutDate: attempt.stay.checkoutDate,
    adultNum: String(attempt.stay.adultNum),
    roomNum: String(attempt.stay.roomNum),
    searchRadius: attempt.radius
  });
  if (attempt.squeeze) params.squeezeCondition = attempt.squeeze;
  const json = await rakuten("Travel/VacantHotelSearch/20170426", params);
  return (json.hotels || []).map((entry) => normalizeHotel(entry, loc, attempt.stay, true));
}

async function fetchFacilityCandidates(loc) {
  const params = baseParams(loc, {
    responseType: "middle",
    hotelThumbnailSize: "3",
    hits: "20",
    sort: "standard",
    searchRadius: "3"
  });
  const json = await rakuten("Travel/SimpleHotelSearch/20170426", params);
  return (json.hotels || []).map((entry) => normalizeHotel(entry, loc, null, false));
}

function baseParams(loc, extra) {
  const params = {
    applicationId: appId,
    accessKey,
    format: "json",
    formatVersion: "2",
    datumType: "1",
    latitude: String(loc.lat),
    longitude: String(loc.lng),
    ...extra
  };
  if (affiliateId) params.affiliateId = affiliateId;
  return params;
}

async function rakuten(endpoint, params) {
  const url = new URL(`${apiBase}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }

  const headers = { "User-Agent": "rakuten-travel2-data-updater" };
  if (apiReferer) headers.Referer = apiReferer;

  try {
    const response = await fetch(url, { headers });
    const body = await response.text();
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`Invalid JSON response: ${body.slice(0, 120)}`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${json.error_description || JSON.stringify(json).slice(0, 160)}`);
    if (json.error) throw new Error(json.error_description || json.error);
    return json;
  } finally {
    await sleep(requestDelayMs);
  }
}

function normalizeHotel(entry, loc, stay, available) {
  const section = flatten(entry.hotel || entry);
  const basic = section.hotelBasicInfo || {};
  const reserve = first(section.hotelReserveInfo) || {};
  const minCharge = numberOrNull(basic.hotelMinCharge || reserve.minCharge);
  const tags = inferTags(loc, basic, minCharge);
  const id = String(basic.hotelNo || `${loc.label}-${basic.hotelName || "hotel"}`);

  return {
    id,
    name: basic.hotelName || `${loc.label}の宿候補`,
    area: loc.label,
    address: [basic.address1, basic.address2].filter(Boolean).join(" "),
    nearestStation: basic.nearestStation || "",
    special: basic.hotelSpecial || (available ? "空室候補として取得しました。" : "施設候補として取得しました。空室は楽天トラベルで確認してください。"),
    minCharge,
    reviewAverage: numberOrNull(basic.reviewAverage) || 0,
    reviewCount: Number(basic.reviewCount || 0) || 0,
    availabilityCount: available ? Number(reserve.reserveRecordCount || 1) || 1 : 0,
    available,
    sourceKind: available ? "vacant" : "facility",
    theme: loc.theme,
    tags,
    imageUrl: basic.hotelImageUrl || basic.hotelThumbnailUrl || "assets/hotel-placeholder.svg",
    rakutenUrl: basic.hotelInformationUrl || basic.planListUrl || "https://travel.rakuten.co.jp/",
    checkinDate: stay?.checkinDate || null,
    checkoutDate: stay?.checkoutDate || null,
    reasons: buildReasons(basic, tags, minCharge, available)
  };
}

function flatten(value) {
  const records = Array.isArray(value) ? value : [value];
  return records.reduce((acc, record) => {
    if (record && typeof record === "object" && !Array.isArray(record)) Object.assign(acc, record);
    return acc;
  }, {});
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function inferTags(loc, basic, minCharge) {
  const tags = new Set(loc.tags);
  const text = [basic.hotelName, basic.hotelSpecial, basic.access, basic.nearestStation, basic.address1, basic.address2].join(" ");
  if (/温泉|露天|大浴場|湯|スパ/.test(text)) tags.add("onsen");
  if (/大浴場|共同浴場|露天/.test(text)) tags.add("bath");
  if (/朝食|ビュッフェ|バイキング|ブッフェ/.test(text)) tags.add("breakfast");
  if (/徒歩|駅|ターミナル|空港/.test(text)) tags.add("station");
  if (/ファミリー|子供|子ども|キッズ|家族|添い寝/.test(text)) tags.add("family");
  if (/禁煙/.test(text)) tags.add("nonsmoking");
  if (/Wi-Fi|Wifi|無線LAN|インターネット/.test(text)) tags.add("internet");
  if (minCharge && minCharge <= 12000) tags.add("budget");
  return [...tags];
}

function buildReasons(basic, tags, minCharge, available) {
  const reasons = [];
  const review = Number(basic.reviewAverage || 0) || 0;
  if (available) reasons.push("空室候補として取得");
  if (!available) reasons.push("施設候補として取得、空室は要確認");
  if (review >= 4.3) reasons.push("レビュー高評価");
  if (tags.includes("onsen")) reasons.push("温泉・大浴場系キーワードあり");
  if (tags.includes("station")) reasons.push("駅・徒歩アクセス系キーワードあり");
  if (minCharge && minCharge <= 12000) reasons.push("料金目安が比較的控えめ");
  return reasons;
}

function score(hotel) {
  const review = (hotel.reviewAverage || 0) * 22;
  const reviewVolume = Math.min(hotel.reviewCount || 0, 2000) / 75;
  const vacancy = Math.min(hotel.availabilityCount || 0, 20) * 1.8;
  const price = hotel.minCharge && hotel.minCharge <= 12000 ? 9 : hotel.minCharge && hotel.minCharge <= 18000 ? 5 : 0;
  const tagFit = (hotel.tags || []).length * 1.4;
  const source = hotel.available ? 8 : 0;
  return Math.round((review + reviewVolume + vacancy + price + tagFit + source) * 10) / 10;
}

function dedupe(hotels) {
  const map = new Map();
  for (const hotel of hotels) {
    const old = map.get(hotel.id);
    if (!old) {
      map.set(hotel.id, hotel);
      continue;
    }
    map.set(hotel.id, {
      ...old,
      ...hotel,
      tags: [...new Set([...(old.tags || []), ...(hotel.tags || [])])],
      reasons: [...new Set([...(old.reasons || []), ...(hotel.reasons || [])])],
      availabilityCount: Math.max(old.availabilityCount || 0, hotel.availabilityCount || 0),
      available: Boolean(old.available || hotel.available),
      checkinDate: old.checkinDate || hotel.checkinDate,
      checkoutDate: old.checkoutDate || hotel.checkoutDate
    });
  }
  return [...map.values()];
}

function buildData({ hotels, stayOptions, report, source }) {
  return {
    updatedAt: new Date().toISOString(),
    nextRunLabel: "毎日 07:10 JST",
    source,
    stay: stayOptions[0],
    stayOptions,
    themes,
    fetchSummary: report,
    hotels,
    drafts: drafts(hotels, source.type)
  };
}

function buildFallbackData(stayOptions, reason, report = []) {
  const hotels = locations.slice(0, 8).map((loc, index) => ({
    id: `area-search-${index + 1}`,
    name: `${loc.label}の宿を楽天トラベルで探す`,
    area: loc.label,
    address: "",
    nearestStation: "",
    special: "自動取得が0件だった場合の検索導線です。空室・料金・口コミは楽天トラベル側で確認してください。",
    minCharge: null,
    reviewAverage: 0,
    reviewCount: 0,
    availabilityCount: 0,
    available: false,
    sourceKind: "fallback",
    theme: loc.theme,
    tags: [...new Set(loc.tags)],
    imageUrl: "assets/hotel-placeholder.svg",
    rakutenUrl: "https://travel.rakuten.co.jp/",
    checkinDate: stayOptions[0].checkinDate,
    checkoutDate: stayOptions[0].checkoutDate,
    reasons: ["空室・料金は要確認", "検索導線用の仮カード"]
  }));

  return buildData({
    hotels,
    stayOptions,
    report,
    source: {
      type: "fallback",
      label: "検索導線",
      note: `${reason} 宿カードは仮の検索導線です。実データ取得後に自動で置き換わります。`
    }
  });
}

async function readExistingData() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeData(data) {
  await mkdir("data", { recursive: true });
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeDraft(data) {
  await mkdir("drafts", { recursive: true });
  await writeFile("drafts/latest-onsen.md", markdown(data), "utf8");
}

function drafts(hotels, sourceType) {
  const status = sourceType === "rakuten" ? "リサーチ完了" : "要確認";
  return [
    {
      id: "latest-onsen",
      title: "週末直前でも狙える温泉・大浴場つき高評価宿3選",
      status,
      theme: "onsen",
      hotelIds: hotels.filter((hotel) => (hotel.tags || []).includes("onsen")).slice(0, 5).map((hotel) => hotel.id),
      updatedAt: new Date().toISOString()
    },
    {
      id: "family-breakfast",
      title: "子連れで使いやすい朝食評価ホテル候補",
      status,
      theme: "family",
      hotelIds: hotels.filter((hotel) => (hotel.tags || []).includes("family") || (hotel.tags || []).includes("breakfast")).slice(0, 5).map((hotel) => hotel.id),
      updatedAt: new Date().toISOString()
    }
  ];
}

function markdown(data) {
  const hotels = data.hotels.filter((hotel) => (hotel.tags || []).includes("onsen")).slice(0, 5);
  return `# 週末直前でも狙える温泉・大浴場つき高評価宿3選\n\n> PR: 楽天トラベルのアフィリエイトリンクを含みます。料金・空室は変動します。\n> データ種別: ${data.source.label} / ${data.source.note || ""}\n\n${hotels.map((hotel, index) => `## ${index + 1}. ${hotel.name}\n- エリア: ${hotel.area}\n- 料金目安: ${hotel.minCharge ? `${Number(hotel.minCharge).toLocaleString("ja-JP")}円から` : "要確認"}\n- レビュー: ${hotel.reviewAverage || "未取得"} / 5.0\n- 空室: ${hotel.available ? "候補あり" : "要確認"}\n- 理由: ${(hotel.reasons || []).join("、") || "条件に合う候補"}\n- URL: ${hotel.rakutenUrl}\n`).join("\n") || "現時点では温泉宿候補が不足しています。次回の自動更新を待つか、条件を広げて確認してください。\n"}\n`;
}

function buildStayOptions() {
  const today = todayJstDate();
  const offsets = new Set([1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 28, 35, 42]);
  const daysUntilSaturday = (6 - today.getUTCDay() + 7) % 7 || 7;
  for (let i = 0; i < 8; i += 1) offsets.add(daysUntilSaturday + i * 7);
  return [...offsets]
    .sort((a, b) => a - b)
    .slice(0, 12)
    .map((offset) => {
      const checkin = addDays(today, offset);
      const checkout = addDays(checkin, 1);
      return { checkinDate: fmt(checkin), checkoutDate: fmt(checkout), adultNum: 2, roomNum: 1 };
    });
}

function todayJstDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function resolveSiteUrl() {
  const raw = (process.env.PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (raw && !/github\.com\/.+\.git$/i.test(raw)) return raw;
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo && repo.includes("/")) {
    const [owner, name] = repo.split("/");
    return `https://${owner}.github.io/${name}`;
  }
  return "https://choritomo.github.io/rakuten-travel2";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
