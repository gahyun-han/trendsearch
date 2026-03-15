import { useState, useEffect, useCallback } from "react";

// ── 설정 ─────────────────────────────────────────────────────
// seedQuery는 실행 시점 날짜를 동적으로 주입해서 항상 최신 트렌드를 탐색
const CATEGORY_META = {
  food: {
    label: "음식 트렌드", color: "#fb923c", icon: "🍜",
    getSeedQueries: (y, m) => [
      `${y}년 ${m}월 한국 음식 SNS 화제 요즘 뜨는`,
      `${y}년 ${m}월 한국 카페 디저트 먹거리 새로운 인기`,
    ],
  },
  tech: {
    label: "테크 / AI", color: "#22d3ee", icon: "🤖",
    getSeedQueries: (y, m) => [
      `${y}년 ${m}월 한국 AI 앱 서비스 새로 화제`,
      `${y}년 ${m}월 한국 IT 기술 트렌드 출시 인기`,
    ],
  },
  lifestyle: {
    label: "라이프스타일", color: "#c084fc", icon: "✨",
    getSeedQueries: (y, m) => [
      `${y}년 ${m}월 한국 MZ 라이프스타일 유행 새로운`,
      `${y}년 ${m}월 한국 운동 뷰티 취미 트렌드 화제`,
    ],
  },
};

// 도메인 → 플랫폼 레이블 매핑
// ⚠ instagram.com, tiktok.com 등은 구글이 인덱싱한 공개 URL 기준 (플랫폼 내부 데이터 아님)
const DOMAIN_LABEL = {
  "youtube.com":        { label: "YouTube",      color: "#ff4444", direct: true  },
  "youtu.be":           { label: "YouTube",      color: "#ff4444", direct: true  },
  "blog.naver.com":     { label: "네이버블로그",  color: "#03c75a", direct: true  },
  "cafe.naver.com":     { label: "네이버카페",    color: "#03c75a", direct: true  },
  "news.naver.com":     { label: "네이버뉴스",    color: "#03c75a", direct: true  },
  "naver.com":          { label: "네이버",        color: "#03c75a", direct: true  },
  "instagram.com":      { label: "인스타(구글노출)", color: "#e1306c", direct: false },
  "tiktok.com":         { label: "틱톡(구글노출)", color: "#69c9d0", direct: false },
  "theqoo.net":         { label: "더쿠",          color: "#a78bfa", direct: true  },
  "dcinside.com":       { label: "DC인사이드",    color: "#6366f1", direct: true  },
  "fmkorea.com":        { label: "에펨코리아",    color: "#84cc16", direct: true  },
  "instiz.net":         { label: "인스티즈",      color: "#f472b6", direct: true  },
  "pann.nate.com":      { label: "판",            color: "#fb7185", direct: true  },
  "clien.net":          { label: "클리앙",        color: "#60a5fa", direct: true  },
  "ppomppu.co.kr":      { label: "뽐뿌",          color: "#f59e0b", direct: true  },
};

function getDomainLabel(url) {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    for (const [domain, meta] of Object.entries(DOMAIN_LABEL)) {
      if (host.includes(domain)) return meta;
    }
    const parts = host.split(".");
    const root = parts.slice(-2).join(".");
    return { label: root, color: "#64748b", direct: true };
  } catch {
    return { label: "기타", color: "#64748b", direct: true };
  }
}

// ── Reddit API (키 없이 무료) ─────────────────────────────────
const REDDIT_SUBS = {
  food: [
    "Korea",           // 한국 전반 — 음식 게시글 많음
    "korean",          // 한국어 커뮤니티
    "KoreanFood",      // 한국 음식 전문
    "AsianFood",       // 아시아 음식 트렌드
    "EatCheapAndHealthy", // 건강식 트렌드
    "Breadit",         // 사워도우 등 빵 트렌드
  ],
  tech: [
    "Korea",
    "artificial",      // AI 전반
    "technology",      // 기술 전반
    "MachineLearning", // ML/AI
    "singularity",     // 미래 기술
  ],
  lifestyle: [
    "Korea",
    "korean",
    "minimalism",
    "ZeroWaste",
    "running",         // 러닝 트렌드
    "SkincareAddiction", // 뷰티/스킨케어
  ],
};

async function fetchRedditPosts(category, onStep) {
  onStep("● Reddit 실시간 게시글 수집 중...");
  const subs = REDDIT_SUBS[category] || ["Korea"];
  const results = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=15`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return;
      const json = await res.json();
      (json?.data?.children || []).forEach(c => {
        results.push({
          title: c.data.title,
          score: c.data.score,
          comments: c.data.num_comments,
          sub: c.data.subreddit,
          url: `https://reddit.com${c.data.permalink}`,
        });
      });
    } catch { /* 개별 서브레딧 실패 무시 */ }
  }));

  return results.sort((a, b) => b.score - a.score);
}
const YT_CATEGORY = { food: "26", tech: "28", lifestyle: "22" };

async function fetchYouTubeTrending(apiKey, category) {
  const catId = YT_CATEGORY[category] || "0";
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&videoCategoryId=${catId}&maxResults=20&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube API: ${err?.error?.message || res.status}`);
  }
  const json = await res.json();
  return (json.items || []).map(v => ({
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    views: parseInt(v.statistics.viewCount || "0"),
    videoId: v.id,
    url: `https://youtube.com/watch?v=${v.id}`,
    thumbnail: v.snippet.thumbnails?.medium?.url,
  }));
}

// ── 설정 모달 ────────────────────────────────────────────────
function SettingsModal({ onSave, onClose, currentYt, currentGemini }) {
  const [yt, setYt]         = useState(currentYt || "");
  const [gemini, setGemini] = useState(currentGemini || "");
  const [showYt, setShowYt]         = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  const canSave = gemini.trim(); // Gemini 키는 필수

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 20, padding: 28, width: "100%", maxWidth: 440,
        boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
          API 설정
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
          키는 이 브라우저에만 저장돼요.
        </p>

        {/* Gemini API 키 — 필수 */}
        <div style={{ marginBottom: 20, padding: "16px", borderRadius: 12,
          background: "rgba(66,133,244,0.06)", border: "1px solid rgba(66,133,244,0.2)" }}>
          <div style={{ fontSize: 11, color: "#4285f4", letterSpacing: 1, marginBottom: 10 }}>
            ✦ Gemini API 키 (필수) — aistudio.google.com에서 무료 발급
          </div>
          <div style={{ position: "relative" }}>
            <input type={showGemini ? "text" : "password"} value={gemini}
              onChange={e => setGemini(e.target.value)}
              placeholder="AIza..."
              style={{ width: "100%", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                color: "#fff", fontSize: 13, padding: "11px 40px 11px 14px",
                fontFamily: "monospace", outline: "none" }} />
            <button onClick={() => setShowGemini(!showGemini)} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "rgba(255,255,255,0.3)",
              cursor: "pointer", fontSize: 14 }}>{showGemini ? "🙈" : "👁"}</button>
          </div>
        </div>

        {/* YouTube API 키 — 선택 */}
        <div style={{ marginBottom: 24, padding: "16px", borderRadius: 12,
          background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}>
          <div style={{ fontSize: 11, color: "#f87171", letterSpacing: 1, marginBottom: 10 }}>
            ▶ YouTube API 키 (선택) — console.cloud.google.com
          </div>
          <div style={{ position: "relative" }}>
            <input type={showYt ? "text" : "password"} value={yt}
              onChange={e => setYt(e.target.value)}
              placeholder="AIza... (없으면 YouTube 데이터 제외)"
              style={{ width: "100%", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                color: "#fff", fontSize: 13, padding: "11px 40px 11px 14px",
                fontFamily: "monospace", outline: "none" }} />
            <button onClick={() => setShowYt(!showYt)} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "rgba(255,255,255,0.3)",
              cursor: "pointer", fontSize: 14 }}>{showYt ? "🙈" : "👁"}</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
            color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            취소
          </button>
          <button onClick={() => canSave && onSave({ gemini: gemini.trim(), yt: yt.trim() })}
            style={{ flex: 2, padding: 12, borderRadius: 10, border: "none",
              background: canSave ? "linear-gradient(135deg,#4285f4,#22d3ee)" : "rgba(255,255,255,0.07)",
              color: canSave ? "#fff" : "rgba(255,255,255,0.25)",
              fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed" }}>
            저장 & 연결
          </button>
        </div>
      </div>
    </div>
  );
}
// ── JSON 안전 파싱 ────────────────────────────────────────────
function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  throw new Error("JSON 파싱 실패");
}

// ── Pinterest 트렌드 (구글 웹서치 기반) ──────────────────────
const PINTEREST_QUERIES = {
  food:      "site:pinterest.com/ideas food trending korea 음식",
  tech:      "site:pinterest.com/ideas technology AI trending",
  lifestyle: "site:pinterest.com/ideas lifestyle trending korea 라이프",
};

async function fetchPinterestTrends(category, onStep) {
  onStep("📌 Pinterest 트렌드 탐색 중...");
  try {
    const { text } = await callClaude({
      useSearch: true,
      maxTokens: 800,
      system: `Pinterest 트렌드 키워드를 웹 검색으로 찾아서 JSON만 반환. 마크다운 없이.
형식: {"pins": ["키워드1", "키워드2", ...], "note": "탐색 요약"}
pins는 5~8개. Pinterest에서 실제로 인기있는 구체적 키워드만.`,
      userMsg: `Pinterest에서 요즘 한국/아시아 관련 "${category}" 분야 트렌드 키워드를 검색해서 JSON으로만 반환하세요. pinterest.com/ideas 와 pinterest trends 위주로 검색하세요.`,
    });
    const parsed = extractJSON(text);
    return parsed.pins || [];
  } catch (e) {
    console.warn("Pinterest 실패:", e.message);
    return [];
  }
}

// ── Gemini API 호출 헬퍼 (Google Search Grounding 포함) ──────
// 키는 환경변수 또는 런타임에 window.__GEMINI_KEY__로 주입
function getGeminiKey() {
  return window.__GEMINI_KEY__ || import.meta.env.VITE_GEMINI_API_KEY || "";
}
const GEMINI_MODEL = "gemini-2.0-flash";

async function callClaude({ system, userMsg, useSearch = false, maxTokens = 1000 }) {
  // Gemini API endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getGeminiKey()}`;

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
    },
  };

  // Google Search Grounding — 웹서치 필요할 때 자동으로 구글 검색
  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini API ${res.status}: ${err?.error?.message || "오류"}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join("") || "";

  return { text, searchResults: [], rawContent: data };
}

// ── Step 1: 씨드 검색 + YouTube + Reddit + Pinterest 키워드 추출
async function extractKeywordCandidates(category, onStep, ytVideos = [], redditPosts = [], pinterestPins = []) {
  const meta = CATEGORY_META[category];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.toISOString().split("T")[0];
  const queries = meta.getSeedQueries(year, month);

  onStep(`🔍 ${year}년 ${month}월 트렌드 탐색 중...`);

  const ytHint = ytVideos.length > 0
    ? `\n\n[YouTube KR 급상승 영상 제목]\n` +
      ytVideos.slice(0, 10).map((v, i) => `${i+1}. ${v.title}`).join("\n")
    : "";

  const rdHint = redditPosts.length > 0
    ? `\n\n[Reddit 인기 게시글 제목 — 업보트 순]\n` +
      redditPosts.slice(0, 12).map((p, i) => `${i+1}. [r/${p.sub}] ${p.title} (👍${p.score})`).join("\n")
    : "";

  const ptHint = pinterestPins.length > 0
    ? `\n\n[Pinterest 인기 트렌드 키워드]\n` +
      pinterestPins.map((p, i) => `${i+1}. ${p}`).join("\n")
    : "";

  const { text } = await callClaude({
    useSearch: true,
    maxTokens: 1500,
    system: `한국 트렌드 키워드를 찾아서 JSON 배열만 반환하세요. 마크다운 없이 순수 JSON만.
형식: {"keywords": ["키워드1", "키워드2", ...]}

규칙:
- 키워드는 6~8개
- 반드시 구체적인 단어 (예: "버터떡", "사워도우", "저당식단", "러닝크루")
- "트렌드", "유행", "음식" 같은 일반 단어 절대 금지
- YouTube·Reddit·Pinterest 데이터에서도 핵심 키워드 추출할 것
- 지금 이 시점에 새로 뜨거나 급상승 중인 것 위주
- 최근 1~2달 안에 화제된 것만`,
    userMsg: `오늘은 ${today}입니다. ${year}년 ${month}월 현재 한국에서 새로 뜨는 트렌드 키워드 6~8개를 JSON으로만 반환하세요.
검색1: "${queries[0]}"
검색2: "${queries[1]}"${ytHint}${rdHint}${ptHint}`,
  });

  const parsed = extractJSON(text);
  return (parsed.keywords || []).slice(0, 8);
}

// ── Step 2: 각 키워드를 개별 검색해서 언급 사이트 카운팅 ────────
async function countKeywordMentions(keyword, onStep) {
  onStep(`📊 "${keyword}" 언급 횟수 집계 중...`);

  const { rawContent } = await callClaude({
    useSearch: true,
    maxTokens: 800,
    system: `검색 결과의 URL과 제목을 분석해서 키워드 언급 정보를 JSON으로만 반환하세요. 마크다운 없이.
형식:
{
  "keyword": "키워드",
  "totalMentions": 숫자,
  "siteBreakdown": [
    { "url": "실제URL", "title": "페이지제목" }
  ]
}
siteBreakdown은 검색 결과에서 찾은 실제 URL과 제목을 그대로 넣으세요. 최대 10개.`,
    userMsg: `"${keyword}" 키워드를 검색해서 어떤 사이트에서 몇 번 언급되는지 JSON으로만 반환하세요.`,
  });

  // rawContent에서 웹서치 결과 직접 파싱
  const toolResults = rawContent.filter(b =>
    b.type === "tool_result" || (b.type === "text" && b.text?.includes("http"))
  );

  // 텍스트 블록에서 JSON 파싱
  const textBlock = rawContent.filter(b => b.type === "text").pop();
  let parsed = { keyword, totalMentions: 0, siteBreakdown: [] };
  if (textBlock?.text) {
    try { parsed = extractJSON(textBlock.text); } catch {}
  }

  // siteBreakdown에서 도메인별 집계
  const domainCount = {};
  (parsed.siteBreakdown || []).forEach(item => {
    const meta = getDomainLabel(item.url || "");
    const key = meta.label;
    if (!domainCount[key]) {
      domainCount[key] = { label: meta.label, color: meta.color, count: 0, urls: [] };
    }
    domainCount[key].count++;
    domainCount[key].urls.push({ url: item.url, title: item.title });
  });

  const sites = Object.values(domainCount).sort((a, b) => b.count - a.count);
  const totalMentions = sites.reduce((s, x) => s + x.count, 0) || parsed.totalMentions || 0;

  return { keyword, totalMentions, sites };
}

async function analyzeKeywordData(keywordData, category, onStep, ytVideos = [], redditPosts = [], pinterestPins = []) {
  const meta = CATEGORY_META[category];
  onStep("🧠 4개 소스 교차 분석 중...");

  const summary = keywordData.map(k =>
    `"${k.keyword}": 총 ${k.totalMentions}건 (${k.sites.map(s => `${s.label} ${s.count}건`).join(", ")})`
  ).join("\n");

  const ytSummary = ytVideos.length > 0
    ? `\n\n[YouTube KR 급상승 영상]\n` +
      ytVideos.slice(0, 8).map((v, i) =>
        `${i+1}. "${v.title}" — ${v.channel} (${(v.views/10000).toFixed(1)}만 조회)`
      ).join("\n") : "";

  const rdSummary = redditPosts.length > 0
    ? `\n\n[Reddit 인기 게시글]\n` +
      redditPosts.slice(0, 10).map((p, i) =>
        `${i+1}. [r/${p.sub}] "${p.title}" (👍${p.score})`
      ).join("\n") : "";

  const ptSummary = pinterestPins.length > 0
    ? `\n\n[Pinterest 트렌드 키워드]\n` +
      pinterestPins.map((p, i) => `${i+1}. ${p}`).join("\n") : "";

  const { text } = await callClaude({
    maxTokens: 1400,
    system: `한국 트렌드 분석 전문가. 구글 웹서치 + YouTube + Reddit + Pinterest 4개 소스를 교차 분석해서 JSON만 반환. 마크다운 없이.
형식:
{
  "headline": "지금 한국 핵심 트렌드 한 문장",
  "topKeyword": "가장 핫한 키워드",
  "insights": [
    {
      "keyword": "키워드",
      "why": "왜 지금 뜨는지 2문장",
      "signal": "🔥 폭발중 | 📈 급상승 | ✨ 신규감지 | 🌀 주목",
      "ytRelated": "관련 YouTube 영상 제목 (있으면, 없으면 null)",
      "rdRelated": "관련 Reddit 게시글 제목 (있으면, 없으면 null)",
      "ptRelated": "관련 Pinterest 트렌드 키워드 (있으면, 없으면 null)"
    }
  ],
  "consumerTip": "소비자를 위한 한 줄 인사이트"
}`,
    userMsg: `카테고리: ${meta.label}\n\n[구글 웹서치 언급 집계]\n${summary}${ytSummary}${rdSummary}${ptSummary}\n\n4개 소스 교차 분석해서 JSON만 반환하세요.`,
  });

  return extractJSON(text);
}

// ── 메인 데이터 파이프라인 ────────────────────────────────────
async function runTrendPipeline(category, onStep, onPartial, ytKey = "") {
  // 0) YouTube + Reddit + Pinterest 병렬 수집
  let ytVideos = [], redditPosts = [], pinterestPins = [];

  await Promise.all([
    // YouTube
    ytKey ? fetchYouTubeTrending(ytKey, category)
      .then(v => { ytVideos = v; onStep("▶ YouTube 수집 완료"); })
      .catch(e => console.warn("YouTube 실패:", e.message)) : Promise.resolve(),

    // Reddit
    fetchRedditPosts(category, onStep)
      .then(p => { redditPosts = p; })
      .catch(e => console.warn("Reddit 실패:", e.message)),

    // Pinterest
    fetchPinterestTrends(category, onStep)
      .then(p => { pinterestPins = p; })
      .catch(e => console.warn("Pinterest 실패:", e.message)),
  ]);

  onPartial({ stage: "sources", ytVideos, redditPosts, pinterestPins });

  // 1) 키워드 후보 추출 (4개 소스 힌트 활용)
  const keywords = await extractKeywordCandidates(category, onStep, ytVideos, redditPosts, pinterestPins);
  onPartial({ stage: "keywords", keywords, ytVideos, redditPosts, pinterestPins });

  // 2) 각 키워드 개별 구글 웹서치
  const keywordData = [];
  for (let i = 0; i < keywords.length; i++) {
    const result = await countKeywordMentions(keywords[i], onStep);
    keywordData.push(result);
    onPartial({ stage: "counting", keywordData: [...keywordData], total: keywords.length, done: i + 1, ytVideos, redditPosts, pinterestPins });
  }

  // 3) 4개 소스 교차 종합 분석
  const analysis = await analyzeKeywordData(keywordData, category, onStep, ytVideos, redditPosts, pinterestPins);

  return { keywordData, analysis, ytVideos, redditPosts, pinterestPins };
}

// ── 컴포넌트: 키워드 통합 카드 (언급횟수 + AI인사이트) ────────
function KeywordCard({ kw, idx, color, maxMentions }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), idx * 100 + 100);
    return () => clearTimeout(t);
  }, [idx]);

  const barWidth = maxMentions > 0 ? (kw.totalMentions / maxMentions) * 100 : 0;

  return (
    <div style={{
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)",
      overflow: "hidden",
      opacity: animated ? 1 : 0,
      transform: animated ? "none" : "translateY(12px)",
      transition: `opacity .5s ease ${idx * 0.08}s, transform .5s ease ${idx * 0.08}s`,
    }}>
      {/* 상단 컬러 라인 */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />

      <div style={{ padding: "22px 24px" }}>

        {/* ── 섹션 1: 키워드명 + 시그널 + 총 언급수 ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <span style={{ fontFamily: "'Pretendard',sans-serif", fontSize: 20,
              fontWeight: 800, color: "#fff" }}>
              {kw.keyword}
            </span>
            <span style={{ marginLeft: 12, fontSize: 15, color, fontFamily: "monospace", fontWeight: 700 }}>
              총 {kw.totalMentions}건
            </span>
          </div>
          {kw.insight?.signal && (
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.07)", padding: "5px 12px",
              borderRadius: 20, flexShrink: 0, marginLeft: 10 }}>
              {kw.insight.signal}
            </span>
          )}
        </div>

        {/* ── 섹션 2: 언급 횟수 바 ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: `linear-gradient(90deg, ${color}55, ${color})`,
              width: animated ? `${barWidth}%` : "0%",
              transition: `width 1s cubic-bezier(.4,0,.2,1) ${idx * 0.1}s`,
              boxShadow: `0 0 10px ${color}44`,
            }} />
          </div>

          {/* 사이트별 뱃지 */}
          {kw.sites?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {kw.sites.map((site, j) => (
                <div key={j} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 22,
                  background: site.color + "15",
                  border: `1px solid ${site.color}${site.direct === false ? "55" : "30"}`,
                  opacity: animated ? 1 : 0,
                  transition: `opacity 0.4s ease ${idx * 0.1 + j * 0.05}s`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%",
                    background: site.color, opacity: site.direct === false ? 0.6 : 1,
                    display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: site.color }}>{site.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff",
                    background: site.color + "28", borderRadius: 12,
                    padding: "0 7px", fontFamily: "monospace" }}>
                    {site.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 구분선 ── */}
        {kw.insight && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
                💡 AI 인사이트
              </span>
            </div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.8, margin: 0 }}>
              {kw.insight.why}
            </p>
            {/* YouTube 관련 영상 */}
            {kw.insight.ytRelated && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 10,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                <span style={{ fontSize: 13, color: "#f87171", flexShrink: 0 }}>▶ YT</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>
                  {kw.insight.ytRelated}
                </span>
              </div>
            )}
            {/* Pinterest 관련 트렌드 */}
            {kw.insight.ptRelated && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 10,
                background: "rgba(230,0,35,0.07)", border: "1px solid rgba(230,0,35,0.2)" }}>
                <span style={{ fontSize: 13, color: "#e60023", flexShrink: 0 }}>📌 PT</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>
                  {kw.insight.ptRelated}
                </span>
              </div>
            )}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 10,
                background: "rgba(255,107,52,0.08)", border: "1px solid rgba(255,107,52,0.2)" }}>
                <span style={{ fontSize: 13, color: "#ff6b34", flexShrink: 0 }}>● RD</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>
                  {kw.insight.rdRelated}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 컴포넌트: 키워드 언급 횟수 바 차트 ──────────────────────
function MentionChart({ keywordData, color }) {
  const maxMentions = Math.max(...keywordData.map(k => k.totalMentions), 1);
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 100); return () => clearTimeout(t); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {keywordData
        .sort((a, b) => b.totalMentions - a.totalMentions)
        .map((kw, i) => (
        <div key={kw.keyword} style={{
          padding: "20px 0",
          borderBottom: i < keywordData.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}>
          {/* 키워드명 + 총 언급수 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#fff", fontFamily: "'Pretendard',sans-serif" }}>
              {kw.keyword}
            </span>
            <span style={{ fontSize: 15, color, fontFamily: "monospace", fontWeight: 700 }}>
              총 {kw.totalMentions}건
            </span>
          </div>

          {/* 전체 바 */}
          <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: `linear-gradient(90deg, ${color}55, ${color})`,
              width: animated ? `${(kw.totalMentions / maxMentions) * 100}%` : "0%",
              transition: `width 1s cubic-bezier(.4,0,.2,1) ${i * 0.1}s`,
              boxShadow: `0 0 10px ${color}44`,
            }} />
          </div>

          {/* 사이트별 뱃지 */}
          {kw.sites.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {kw.sites.map((site, j) => (
                <div key={j} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 22,
                  background: site.color + "15",
                  border: `1px solid ${site.color}${site.direct === false ? "55" : "35"}`,
                  opacity: animated ? 1 : 0,
                  transform: animated ? "none" : "translateY(4px)",
                  transition: `all 0.4s ease ${i * 0.1 + j * 0.05}s`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%",
                    background: site.color, flexShrink: 0, display: "inline-block",
                    opacity: site.direct === false ? 0.6 : 1 }} />
                  <span style={{ fontSize: 13, color: site.color }}>
                    {site.label}
                  </span>
                  <span style={{ fontSize: 14, color: "#fff", fontWeight: 700,
                    background: site.color + "28", borderRadius: 12,
                    padding: "0 7px", fontFamily: "monospace" }}>
                    {site.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 데이터 출처 안내 */}
      <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 10,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
          ℹ <strong style={{ color: "rgba(255,255,255,0.6)" }}>데이터 기준 안내</strong><br/>
          • <strong>네이버·YouTube·커뮤니티</strong> — 구글 검색에서 직접 노출된 페이지 수 집계<br/>
          • <strong>인스타(구글노출)·틱톡(구글노출)</strong> — 구글이 인덱싱한 공개 URL만 집계. 플랫폼 내부 실제 게시물 수와 다를 수 있어요.
        </p>
      </div>
    </div>
  );
}

// ── 컴포넌트: 진행 상태 바 ────────────────────────────────────
function ProgressBar({ done, total, color }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13,
        color: "rgba(255,255,255,0.4)" }}>
        <span>키워드 분석 진행</span>
        <span>{done} / {total}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          width: `${pct}%`, transition: "width 0.5s ease",
          boxShadow: `0 0 8px ${color}55`,
        }} />
      </div>
    </div>
  );
}

// ── 컴포넌트: 로딩 ───────────────────────────────────────────
function LoadingView({ stepMsg, partial, color }) {
  const [dotIdx, setDotIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDotIdx(i => (i + 1) % 3), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: "48px 0" }}>
      {/* 회전 링 */}
      <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto 20px" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${color}20` }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
          border: "2px solid transparent", borderTopColor: color,
          animation: "spin 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 8, borderRadius: "50%",
          border: `1px solid ${color}30`, borderTopColor: color + "80",
          animation: "spin 1.5s linear infinite reverse" }} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
          {stepMsg || "분석 준비 중"}<span style={{ opacity: dotIdx >= 0 ? 1 : 0 }}>.</span><span style={{ opacity: dotIdx >= 1 ? 1 : 0 }}>.</span><span style={{ opacity: dotIdx >= 2 ? 1 : 0 }}>.</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
          구글 웹서치 기반 · 키워드당 1회 검색
        </div>
      </div>

      {/* 부분 결과 미리보기 */}
      {partial?.keywords?.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14,
          padding: "16px 20px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", letterSpacing: 1,
            marginBottom: 14 }}>
            발견된 트렌드 키워드
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {partial.keywords.map((kw, i) => {
              const counted = partial.keywordData?.find(k => k.keyword === kw);
              return (
                <div key={i} style={{
                  padding: "7px 14px", borderRadius: 22,
                  background: counted ? color + "18" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${counted ? color + "40" : "rgba(255,255,255,0.08)"}`,
                  fontSize: 14, color: counted ? color : "rgba(255,255,255,0.4)",
                  display: "flex", alignItems: "center", gap: 7, transition: "all 0.3s",
                }}>
                  {counted ? (
                    <>
                      <span style={{ width: 6, height: 6, borderRadius: "50%",
                        background: color, boxShadow: `0 0 6px ${color}`,
                        display: "inline-block" }} />
                      {kw}
                      <span style={{ fontSize: 13, fontFamily: "monospace", opacity: 0.8 }}>
                        {counted.totalMentions}건
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ width: 6, height: 6, borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,0.2)",
                        display: "inline-block",
                        animation: partial.keywordData?.length === i ? "pulse 1s infinite" : "none" }} />
                      {kw}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {partial.keywordData?.length > 0 && (
            <ProgressBar done={partial.keywordData.length} total={partial.keywords.length} color={color} />
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 앱 ──────────────────────────────────────────────────
export default function NowWave() {
  const [activeTab, setActiveTab]   = useState("food");
  const [showSettings, setShowSettings] = useState(false);
  const [ytKey, setYtKey]     = useState(() => { try { return localStorage.getItem("yt_api_key") || ""; } catch { return ""; } });
  const [geminiKey, setGeminiKey] = useState(() => { try { return localStorage.getItem("gemini_api_key") || ""; } catch { return ""; } });
  const [state, setState] = useState({
    food:      { status: "idle", result: null, partial: null, stepMsg: "", errorMsg: "", lastUpdated: null },
    tech:      { status: "idle", result: null, partial: null, stepMsg: "", errorMsg: "", lastUpdated: null },
    lifestyle: { status: "idle", result: null, partial: null, stepMsg: "", errorMsg: "", lastUpdated: null },
  });
  const [view, setView] = useState("combined");

  const meta    = CATEGORY_META[activeTab];
  const current = state[activeTab];
  const isLoading = current.status === "loading";

  const saveKeys = ({ gemini, yt }) => {
    try {
      localStorage.setItem("gemini_api_key", gemini);
      if (yt) localStorage.setItem("yt_api_key", yt);
    } catch {}
    setGeminiKey(gemini);
    setYtKey(yt);
    setShowSettings(false);
    // 키 저장 후 현재 탭 리셋
    setState(s => ({ ...s, [activeTab]: { ...s[activeTab], status: "idle" } }));
  };

  // Gemini API 키를 전역 변수에 주입 (동적)
  useEffect(() => {
    if (geminiKey) {
      window.__GEMINI_KEY__ = geminiKey;
    }
  }, [geminiKey]);

  const load = useCallback(async (cat, ytk = "") => {
    setState(s => ({ ...s, [cat]: { status: "loading", result: null, partial: null, stepMsg: "준비 중...", errorMsg: "", lastUpdated: null } }));
    try {
      const result = await runTrendPipeline(
        cat,
        (msg) => setState(s => ({ ...s, [cat]: { ...s[cat], stepMsg: msg } })),
        (partial) => setState(s => ({ ...s, [cat]: { ...s[cat], partial } })),
        ytk,
      );
      setState(s => ({ ...s, [cat]: { status: "done", result, partial: null, stepMsg: "", errorMsg: "", lastUpdated: new Date() } }));
    } catch (err) {
      setState(s => ({ ...s, [cat]: { status: "error", result: null, partial: null, stepMsg: "", errorMsg: err.message, lastUpdated: null } }));
    }
  }, []);

  useEffect(() => {
    if (state[activeTab].status === "idle" && geminiKey) {
      load(activeTab, ytKey);
    } else if (!geminiKey) {
      setShowSettings(true); // Gemini 키 없으면 설정창 바로 열기
    }
  }, [activeTab, geminiKey]);

  const fmt = (d) => d ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} 기준` : "";

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#07090c; font-family:'Pretendard',-apple-system,sans-serif}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#1e2530;border-radius:2px}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}
        @keyframes fadeup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(110vh)}}
      `}</style>

      {showSettings && (
        <SettingsModal
          onSave={saveKeys}
          onClose={() => setShowSettings(false)}
          currentYt={ytKey}
          currentGemini={geminiKey}
        />
      )}

      <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Pretendard',-apple-system,sans-serif" }}>
        {/* 배경 */}
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,255,255,.01) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.01) 1px,transparent 1px)",
          backgroundSize: "44px 44px" }} />
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.025),transparent)",
            animation: "scanline 14s linear infinite" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "0 20px 80px" }}>

          {/* 헤더 */}
          <header style={{ padding: "36px 0 28px", marginBottom: 28 }}>

            {/* 메인 타이틀 — 최상단 */}
            <h1 style={{
              fontFamily: "'Pretendard', -apple-system, sans-serif",
              fontSize: "clamp(44px,8vw,82px)", fontWeight: 900,
              lineHeight: 1, letterSpacing: -3, margin: "0 0 16px 0",
              display: "flex", alignItems: "baseline", gap: "0.05em",
            }}>
              <span style={{ color: "#fff" }}>NOW</span>
              <span style={{
                color: "transparent",
                WebkitTextStroke: `2.5px ${meta.color}`,
                filter: `drop-shadow(0 0 14px ${meta.color}55)`,
              }}>WAVE</span>
            </h1>

            {/* 태그라인 + 소스 상태 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80",
                  boxShadow: "0 0 12px #4ade80", display: "inline-block", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 13, letterSpacing: 1, color: "rgba(255,255,255,0.4)" }}>
                  구글 웹서치 기반 실시간 트렌드 분석
                </span>
              </div>
              {/* 소스 뱃지 + 설정 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* Gemini 뱃지 */}
                <div style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11,
                  border: `1px solid ${geminiKey ? "rgba(66,133,244,0.4)" : "rgba(255,80,80,0.4)"}`,
                  background: geminiKey ? "rgba(66,133,244,0.1)" : "rgba(255,80,80,0.08)",
                  color: geminiKey ? "#4285f4" : "#f87171",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%",
                    background: geminiKey ? "#4285f4" : "#f87171",
                    boxShadow: geminiKey ? "0 0 6px #4285f4" : "none",
                    display: "inline-block",
                    animation: geminiKey ? "pulse 2s infinite" : "none" }} />
                  {geminiKey ? "Gemini 연결됨" : "Gemini 키 필요"}
                </div>
                <div style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11,
                  border: "1px solid rgba(255,107,52,0.4)",
                  background: "rgba(255,107,52,0.1)", color: "#ff6b34",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%",
                    background: "#ff6b34", boxShadow: "0 0 6px #ff6b34",
                    display: "inline-block", animation: "pulse 2s infinite" }} />
                  Reddit
                </div>
                {/* Pinterest 뱃지 */}
                <div style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11,
                  border: "1px solid rgba(230,0,35,0.4)",
                  background: "rgba(230,0,35,0.1)", color: "#e60023",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%",
                    background: "#e60023", boxShadow: "0 0 6px #e60023",
                    display: "inline-block", animation: "pulse 2.4s infinite" }} />
                  Pinterest
                </div>
                {/* YouTube 뱃지 */}
                <div style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11,
                  border: `1px solid ${ytKey ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)"}`,
                  background: ytKey ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.03)",
                  color: ytKey ? "#f87171" : "rgba(255,255,255,0.3)",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%",
                    background: ytKey ? "#f87171" : "#444",
                    boxShadow: ytKey ? "0 0 6px #f87171" : "none",
                    display: "inline-block" }} />
                  {ytKey ? "YouTube 연결됨" : "YouTube 미연결"}
                </div>
                <button onClick={() => setShowSettings(true)} style={{
                  padding: "4px 12px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 11, cursor: "pointer",
                }}>
                  ⚙ API 설정
                </button>
              </div>
            </div>

            {/* 구분선 + 업데이트 시각 */}
            <div style={{ display: "flex", alignItems: "center", gap: 16,
              paddingTop: 16, borderTop: `1px solid ${meta.color}30` }}>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
                {current.lastUpdated ? `${fmt(current.lastUpdated)} 기준` : "분석 대기 중"}
              </span>
              <span style={{ width: 4, height: 4, borderRadius: "50%",
                background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
                키워드 × 사이트 언급 집계
              </span>
            </div>
          </header>

          {/* 카테고리 탭 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            {Object.entries(CATEGORY_META).map(([id, m]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                padding: "11px 22px", borderRadius: 26,
                border: `1px solid ${activeTab === id ? m.color : "rgba(255,255,255,0.1)"}`,
                background: activeTab === id ? m.color + "18" : "rgba(255,255,255,0.02)",
                color: activeTab === id ? m.color : "rgba(255,255,255,0.45)",
                fontSize: 15, cursor: "pointer", transition: "all .2s",
                fontWeight: activeTab === id ? 600 : 400,
                boxShadow: activeTab === id ? `0 0 18px ${m.color}18` : "none",
              }}>
                {m.icon} {m.label}
              </button>
            ))}
            <button onClick={() => load(activeTab, ytKey)} disabled={isLoading} style={{
              marginLeft: "auto", padding: "11px 18px", borderRadius: 26,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
              color: isLoading ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)",
              fontSize: 14, cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <span style={{ display: "inline-block", animation: isLoading ? "spin 1s linear infinite" : "none" }}>↻</span>
              {isLoading ? "분석중" : "새로고침"}
            </button>
          </div>

          {/* 로딩 */}
          {isLoading && <LoadingView stepMsg={current.stepMsg} partial={current.partial} color={meta.color} />}

          {/* 에러 */}
          {current.status === "error" && (
            <div style={{ padding: "22px 26px", borderRadius: 14,
              background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.18)",
              color: "#f87171", fontSize: 15, lineHeight: 1.8 }}>
              <div>⚠ 분석 실패: {current.errorMsg}</div>
              <button onClick={() => load(activeTab)} style={{ marginTop: 12,
                color: "#f87171", background: "none", border: "1px solid rgba(255,100,100,0.3)",
                borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>
                ↻ 다시 시도
              </button>
            </div>
          )}

          {/* 결과 */}
          {!isLoading && current.status === "done" && current.result && (() => {
            const { keywordData, analysis } = current.result;
            const maxMentions = Math.max(...keywordData.map(k => k.totalMentions), 1);

            // 키워드 데이터와 인사이트를 keyword 기준으로 병합
            const merged = keywordData
              .sort((a, b) => b.totalMentions - a.totalMentions)
              .map(kw => ({
                ...kw,
                insight: (analysis.insights || []).find(ins =>
                  ins.keyword === kw.keyword ||
                  kw.keyword.includes(ins.keyword) ||
                  ins.keyword.includes(kw.keyword)
                ) || null,
              }));

            return (
              <div style={{ animation: "fadeup .4s ease" }}>

                {/* 헤드라인 배너 */}
                <div style={{ padding: "22px 26px", borderRadius: 16, marginBottom: 28,
                  background: `linear-gradient(135deg,${meta.color}0d,${meta.color}04)`,
                  border: `1px solid ${meta.color}20`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", right: -20, top: -20, width: 100, height: 100,
                    borderRadius: "50%", background: `radial-gradient(circle,${meta.color}12,transparent 70%)` }} />
                  <div style={{ fontSize: 12, color: meta.color, letterSpacing: 2, marginBottom: 10 }}>
                    {meta.icon} {meta.label} · 웹서치 언급 분석
                  </div>
                  <p style={{ fontFamily: "'Pretendard',sans-serif", fontSize: 19, fontWeight: 600, color: "#fff", lineHeight: 1.65, marginBottom: 14 }}>
                    {analysis.headline}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>💡 {analysis.consumerTip}</p>
                    {analysis.topKeyword && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 18px", borderRadius: 24,
                        background: meta.color + "18", border: `1px solid ${meta.color}35` }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%",
                          background: meta.color, boxShadow: `0 0 8px ${meta.color}`,
                          display: "inline-block", animation: "pulse 1.5s infinite" }} />
                        <span style={{ fontSize: 12, color: meta.color, fontFamily: "monospace", letterSpacing: 1 }}>TOP</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "'Pretendard',sans-serif" }}>
                          {analysis.topKeyword}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 키워드 카드 목록 — 언급횟수 + AI인사이트 통합 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {merged.map((kw, i) => (
                    <KeywordCard
                      key={kw.keyword}
                      kw={kw}
                      idx={i}
                      color={meta.color}
                      maxMentions={maxMentions}
                    />
                  ))}
                </div>

                {/* YouTube 급상승 피드 (키 있을 때) */}
                {current.result.ytVideos?.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%",
                        background: "#f87171", boxShadow: "0 0 8px #f87171",
                        display: "inline-block", animation: "pulse 2s infinite" }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                        YouTube KR 급상승
                      </span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                        {current.result.ytVideos.length}개
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {current.result.ytVideos.slice(0, 8).map((v, i) => (
                        <a key={i} href={v.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", gap: 12, alignItems: "center",
                            padding: "10px 14px", borderRadius: 12,
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            textDecoration: "none", transition: "background .15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.025)"}>
                          {v.thumbnail && (
                            <img src={v.thumbnail} alt="" style={{
                              width: 64, height: 48, borderRadius: 8,
                              objectFit: "cover", flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)",
                              lineHeight: 1.4, overflow: "hidden",
                              display: "-webkit-box", WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical" }}>
                              {v.title}
                            </div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
                              {v.channel} · {(v.views/10000).toFixed(1)}만 조회
                            </div>
                          </div>
                          <span style={{ fontSize: 12, color: "#f87171", flexShrink: 0 }}>▶</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reddit 인기 게시글 피드 */}
                {current.result.redditPosts?.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%",
                        background: "#ff6b34", boxShadow: "0 0 8px #ff6b34",
                        display: "inline-block", animation: "pulse 2s infinite" }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                        Reddit 인기 게시글
                      </span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                        {REDDIT_SUBS[activeTab]?.map(s => `r/${s}`).join(" · ")}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {current.result.redditPosts.slice(0, 10).map((p, i) => (
                        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", gap: 12, alignItems: "flex-start",
                            padding: "10px 14px", borderRadius: 10,
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            textDecoration: "none", transition: "background .15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.025)"}>
                          {/* 업보트 수 */}
                          <div style={{ minWidth: 44, textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 13, color: "#ff6b34", fontFamily: "monospace", fontWeight: 700 }}>
                              {p.score > 999 ? `${(p.score/1000).toFixed(1)}k` : p.score}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                              💬{p.comments}
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                              {p.title}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                              r/{p.sub}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 데이터 기준 안내 */}
                <div style={{ marginTop: 20, padding: "16px 18px", borderRadius: 12,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.8 }}>
                    ℹ <strong style={{ color: "rgba(255,255,255,0.5)" }}>데이터 소스 안내</strong><br/>
                    • <strong style={{ color: "#ff6b34" }}>Reddit</strong> — 서브레딧 hot 게시글 직접 수집<br/>
                    • <strong style={{ color: "#e60023" }}>Pinterest</strong> — 트렌드 페이지 웹서치 기반<br/>
                    • <strong style={{ color: "#f87171" }}>YouTube KR</strong> — 한국 급상승 영상 직접 수집 (API 연결 시)<br/>
                    • <strong style={{ color: "#4ade80" }}>구글 웹서치</strong> — 검색 상위 결과 URL 기반 언급 횟수 집계
                  </p>
                </div>

                <div style={{ marginTop: 14, fontSize: 13, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>
                  키워드 {keywordData.length}개 × 구글 검색 결과 기반 · Claude AI 분석
                </div>
              </div>
            );
          })()}
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,.04)", padding: "14px 20px",
          textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.15)",
          fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 2 }}>
          NOWWAVE · Claude AI Web Search · {new Date().getFullYear()}
        </div>
      </div>
    </>
  );
}
