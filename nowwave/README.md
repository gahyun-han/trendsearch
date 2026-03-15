# NOWWAVE 🌊

지금 한국에서 뭐가 뜨는지 실시간으로 확인하는 트렌드 분석 서비스

## 데이터 소스
- **구글 웹서치** — 키워드별 언급 횟수 집계
- **Reddit** — 서브레딧 hot 게시글 (무료, 키 없음)
- **Pinterest** — 트렌드 키워드 웹서치 기반
- **YouTube KR** — 한국 급상승 영상 (YouTube API 키 필요)

---

## Vercel 배포 방법

### 1. 환경변수 준비
- Anthropic API 키: https://console.anthropic.com
- YouTube API 키 (선택): https://console.cloud.google.com

### 2. GitHub에 올리기
1. GitHub에서 새 레포지토리 생성 (이름: `nowwave`)
2. 이 폴더 전체를 레포에 업로드

### 3. Vercel 배포
1. https://vercel.com 접속 → GitHub 로그인
2. **Add New Project** → `nowwave` 레포 선택
3. Framework: **Vite** (자동 감지)
4. **Environment Variables** 탭에서 추가:
   ```
   VITE_ANTHROPIC_API_KEY = sk-ant-...
   ```
5. **Deploy** 클릭

### 4. YouTube 연결 (선택)
배포 후 앱 우측 상단 **⚙ API 설정**에서 YouTube API 키 입력

---

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local 에 실제 API 키 입력
npm run dev
```

http://localhost:5173 에서 확인
