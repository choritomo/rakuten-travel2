import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const appId=process.env.RAKUTEN_APPLICATION_ID, accessKey=process.env.RAKUTEN_ACCESS_KEY, affiliateId=process.env.RAKUTEN_AFFILIATE_ID;
const check=process.argv.includes("--check");
const themes=[{id:"lastminute",label:"直前予約"},{id:"onsen",label:"温泉・大浴場"},{id:"family",label:"子連れ"},{id:"breakfast",label:"朝食評価"},{id:"station",label:"駅近"},{id:"budget",label:"予算控えめ"}];
const locations=[
 {label:"神奈川 / 箱根",lat:35.2324,lng:139.1069,theme:"onsen",tags:["lastminute","onsen","bath"]},
 {label:"静岡 / 熱海",lat:35.0956,lng:139.0717,theme:"breakfast",tags:["lastminute","onsen","breakfast","station"]},
 {label:"千葉 / 舞浜",lat:35.6365,lng:139.8836,theme:"family",tags:["family","breakfast","station"]},
 {label:"京都 / 京都駅",lat:34.9858,lng:135.7588,theme:"station",tags:["station","budget","solo","internet"]},
 {label:"大阪 / なんば",lat:34.6671,lng:135.5002,theme:"budget",tags:["station","budget","solo"]}
];
if(check){const data=JSON.parse(await readFile("data/hotels.json","utf8"));if(!Array.isArray(data.hotels))throw new Error("data.hotels must be array");console.log(`OK: ${data.hotels.length} hotels`);process.exit(0)}
if(!appId||!accessKey){console.log("Rakuten credentials are not set. Keeping existing data.");process.exit(0)}
const stay=dates();const hotels=[];
for(const loc of locations){try{hotels.push(...await fetchHotels(loc,stay));await sleep(1100)}catch(e){console.warn(`[skip] ${loc.label}: ${e.message}`)}}
const byId=new Map();for(const h of hotels){const old=byId.get(h.id);byId.set(h.id,old?{...old,...h,tags:[...new Set([...(old.tags||[]),...(h.tags||[])])]}:h)}
const list=[...byId.values()].map(h=>({...h,recommendationScore:score(h)})).sort((a,b)=>b.recommendationScore-a.recommendationScore).slice(0,80);
const data={updatedAt:new Date().toISOString(),nextRunLabel:"毎日 07:10 JST",source:{type:"rakuten",label:"Rakuten Travel API"},stay,themes,hotels:list,drafts:drafts(list)};
await mkdir("data",{recursive:true});await mkdir("drafts",{recursive:true});await writeFile("data/hotels.json",JSON.stringify(data,null,2)+"\n","utf8");await writeFile("drafts/latest-onsen.md",markdown(data),"utf8");console.log(`Updated ${list.length} hotels`);
async function fetchHotels(loc,stay){const p=new URLSearchParams({applicationId:appId,accessKey,format:"json",formatVersion:"2",datumType:"1",searchPattern:"0",responseType:"middle",hotelThumbnailSize:"3",hits:"30",sort:"standard",latitude:String(loc.lat),longitude:String(loc.lng),searchRadius:"3",checkinDate:stay.checkinDate,checkoutDate:stay.checkoutDate,adultNum:"2",roomNum:"1"});if(affiliateId)p.set("affiliateId",affiliateId);if(loc.theme==="onsen")p.set("squeezeCondition","onsen,daiyoku");if(loc.theme==="breakfast")p.set("squeezeCondition","breakfast");const r=await fetch(`https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426?${p}`);const j=await r.json();if(j.error)throw new Error(j.error_description||j.error);return (j.hotels||[]).map(e=>norm(e,loc,stay));}
function norm(entry,loc,stay){const s=flatten(entry.hotel||entry);const b=s.hotelBasicInfo||{};const reserve=Array.isArray(s.hotelReserveInfo)?s.hotelReserveInfo[0]||{}:s.hotelReserveInfo||{};const min=Number(b.hotelMinCharge||0)||null;return {id:String(b.hotelNo||b.hotelName),name:b.hotelName||"名称未取得",area:loc.label,address:[b.address1,b.address2].filter(Boolean).join(" "),nearestStation:b.nearestStation||"",special:b.hotelSpecial||"",minCharge:min,reviewAverage:Number(b.reviewAverage||0)||0,reviewCount:Number(b.reviewCount||0)||0,availabilityCount:Number(reserve.reserveRecordCount||1)||1,available:true,theme:loc.theme,tags:infer(loc,b),imageUrl:b.hotelImageUrl||b.hotelThumbnailUrl||"",rakutenUrl:b.hotelInformationUrl||b.planListUrl||"https://travel.rakuten.co.jp/",checkinDate:stay.checkinDate,checkoutDate:stay.checkoutDate};}
function flatten(v){return (Array.isArray(v)?v:[v]).reduce((a,x)=>{if(x&&typeof x==="object")Object.assign(a,x);return a},{})}
function infer(loc,b){const t=new Set(loc.tags);const text=[b.hotelName,b.hotelSpecial,b.access].join(" ");if(/温泉|露天|大浴場|湯/.test(text))t.add("onsen");if(/朝食|ビュッフェ/.test(text))t.add("breakfast");if(/徒歩|駅/.test(text))t.add("station");if(/ファミリー|子供|キッズ|家族/.test(text))t.add("family");return [...t]}
function score(h){return Math.round(((h.reviewAverage||0)*20+Math.min(h.reviewCount||0,2000)/80+Math.min(h.availabilityCount||0,20)*1.4+((h.minCharge&&h.minCharge<=12000)?8:0)+(h.tags||[]).length*1.5)*10)/10}
function drafts(hotels){return [{id:"latest-onsen",title:"週末直前でも狙える温泉・大浴場つき高評価宿3選",status:"リサーチ完了",theme:"onsen",hotelIds:hotels.filter(h=>(h.tags||[]).includes("onsen")).slice(0,5).map(h=>h.id),updatedAt:new Date().toISOString()}]}
function markdown(data){return `# 週末直前でも狙える温泉・大浴場つき高評価宿3選\n\n> PR: 楽天トラベルのアフィリエイトリンクを含みます。料金・空室は変動します。\n\n${data.hotels.slice(0,5).map((h,i)=>`## ${i+1}. ${h.name}\n- エリア: ${h.area}\n- 料金目安: ${h.minCharge?Number(h.minCharge).toLocaleString("ja-JP")+"円から":"要確認"}\n- レビュー: ${h.reviewAverage} / 5.0\n- URL: ${h.rakutenUrl}\n`).join("\n")}\n`}
function dates(){const d=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Tokyo"}));const add=(6-d.getDay()+7)%7||7;d.setDate(d.getDate()+add);const c=new Date(d);c.setDate(c.getDate()+1);return {checkinDate:fmt(d),checkoutDate:fmt(c),adultNum:2,roomNum:1}}
function fmt(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
