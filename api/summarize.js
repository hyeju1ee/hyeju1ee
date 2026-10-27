// POST /api/summarize  {id}  →  보고서 목차별 요약을 텍스트 스트림으로 돌려준다.
// GET  /api/summarize        →  {enabled} : 서버에 API 키가 설정돼 있는지
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JOURNALS } from "../journals.js";

const client = new Anthropic();
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
// 스트림이 끝난 뒤 오류를 알릴 때 쓰는 표식 (클라이언트가 잘라낸다)
const ERR = "\u0000ERR:";

let textsPromise = null;
function loadTexts(){
  textsPromise ||= readFile(path.join(process.cwd(), "journals", "text.json"), "utf8").then(JSON.parse);
  return textsPromise;
}

function findItem(id){
  for (const j of JOURNALS) for (const p of j.parts) for (const it of p.items) if (it.id === id) return {j, it};
  return null;
}

async function verify(req){
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || !FIREBASE_PROJECT_ID) return false;
  try {
    await jwtVerify(token, JWKS, {issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`, audience: FIREBASE_PROJECT_ID});
    return true;
  } catch(e) { return false; }
}

function buildPrompt(j, it, text){
  const toc = it.toc ? it.toc.map(([t]) => "- " + t).join("\n") : "(세부 목차 없음: 보고서 흐름에 맞춰 3~4개 장으로 나눠 요약)";
  const material = text ? "[보고서 원문]\n" + text : "[보고서 요약 자료]\n" + it.points.map(p => "- " + p).join("\n");
  return `성균관대 지속경영전략학회 SUBAC 학회지의 보고서를 목차의 장별로 요약해 주세요. 학회원이 휴대폰에서 읽는 요약입니다.

형식:
- 각 장마다 "## 장 제목" 한 줄, 그 아래 "- "로 시작하는 불릿 2~3개
- 마지막에 "## 한 줄 결론"과 불릿 1개
- 머리말이나 맺음말 없이 위 형식만 출력

아래 자료에 있는 내용만 쓰고, 자료에 없는 수치나 사실은 추측하지 마세요. 근거가 부족한 장은 "- 원문 PDF ${it.page}쪽부터 확인해 주세요."라고 적어 주세요.

[학회지] SUBAC ${j.vol} (${j.season})
[보고서] ${it.title}${it.sub ? " - " + it.sub : ""}
[작성] ${it.team || ""} ${it.authors || ""}
[목차]
${toc}

${material}`;
}

export default async function handler(req, res){
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY && FIREBASE_PROJECT_ID);
  if (req.method === "GET") { res.status(200).json({enabled}); return; }
  if (req.method !== "POST") { res.status(405).json({error: "method_not_allowed"}); return; }
  if (!enabled) { res.status(503).json({error: "not_configured"}); return; }
  if (!(await verify(req))) { res.status(401).json({error: "unauthorized"}); return; }

  const id = req.body && typeof req.body.id === "string" ? req.body.id : "";
  const found = findItem(id);
  if (!found || found.it.kind === "intro") { res.status(404).json({error: "not_found"}); return; }
  const texts = await loadTexts().catch(() => ({}));

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      output_config: {effort: "medium"},
      // 안전 분류기가 거절하면 서버에서 권장 모델로 다시 시도
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{role: "user", content: buildPrompt(found.j, found.it, texts[id])}],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") res.write(ERR + "refusal");
    else if (final.stop_reason === "max_tokens") res.write(ERR + "max_tokens");
  } catch(e) {
    console.error("summarize failed", e);
    const code = e instanceof Anthropic.RateLimitError ? "rate_limited"
      : e instanceof Anthropic.APIConnectionError ? "network"
      : "server";
    if (!res.headersSent) { res.status(code === "rate_limited" ? 429 : 502).json({error: code}); return; }
    res.write(ERR + code);
  }
  res.end();
}
