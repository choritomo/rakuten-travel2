import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || process.argv[2] || 4173);
const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".md":"text/markdown; charset=utf-8" };
createServer(async (req,res)=>{try{const u=new URL(req.url||"/",`http://localhost:${port}`);const p=decodeURIComponent(u.pathname).replace(/^\/+/,"")||"index.html";let file=path.resolve(root,p);if(!file.startsWith(root)){res.writeHead(403);res.end("Forbidden");return}const s=await stat(file);if(s.isDirectory())file=path.join(file,"index.html");res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});createReadStream(file).pipe(res)}catch{res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("Not found")}}).listen(port,()=>console.log(`http://localhost:${port}`));
