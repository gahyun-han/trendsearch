# NOWWAVE 🌊

지금 한국에서 뭐가 뜨는지 실시간으로 확인하는 트렌드 분석 서비스

## 데이터 소스
- **Gemini AI + Google Search** — 키워드 탐색 및 언급 횟수 분석 (무료)
- **Reddit** — 서브레딧 hot 게시글 직접 수집 (무료, 키 없음)
- **Pinterest** — 트렌드 키워드 웹서치 기반 (무료)
- **YouTube KR** — 한국 급상승 영상 (YouTube API 키 필요, 선택)

---

## Vercel 배포 방법

### 1. API 키 준비
- **Gemini API 키 (필수, 무료)**: https://aistudio.google.com → Get API key
- **YouTube API 키 (선택)**: https://console.cloud.google.com

### 2. GitHub에 올리기
1. https://github.com → New repository → 이름: `nowwave`
2. 이 폴더 파일들 전체 업로드 (드래그 앤 드롭)

### 3. Vercel 배포
1. https://vercel.com → GitHub 로그인
2. Add New Project → `nowwave` 선택
3. Framework: **Vite** (자동 감지)
4. Environment Variables 추가:
   ```
   VITE_GEMINI_API_KEY = AIza... (필수)
   ```
5. Deploy 클릭 → 완료!

### 4. 앱에서 YouTube 연결 (선택)
배포 후 앱 헤더 **⚙ API 설정**에서 YouTube API 키 입력

---

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local 파일에 실제 Gemini API 키 입력
npm run dev
```

→ http://localhost:5173
