# 등기로 (Next.js + Supabase)

지도에서 개별 부동산의 등기 정보를 찾고, 회원이 확보한 등기 자료를 허용 범위에서 공유하며, 관심 부동산의 등기변동을 알리는 웹 서비스입니다. **Next.js (App Router) + Supabase (PostgreSQL · Auth · Storage)** 기반으로 구성되어 있으며 Vercel에 바로 배포할 수 있습니다.

## 로컬 실행

```powershell
Copy-Item .env.example .env.local
# .env.local에 카카오맵, Supabase, 공공데이터포털 키를 입력합니다.
npm install
npm run dev
```

`http://localhost:4173`에서 열립니다.

## 환경변수 설정 (`.env.local` 및 Vercel)

| 변수명 | 용도 | 필수 여부 |
| --- | --- | --- |
| `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` | 카카오맵 JavaScript SDK 지도·검색 (기존 `KAKAO_MAP_JS_KEY` 호환) | 실지도 사용 시 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 회원·관심목록 사용 시 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Public Key | 회원·관심목록 사용 시 |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 국토교통부 건축HUB 건축물대장 인증키(Decoding) | 실주소 건축물대장 조회 시 |

## Supabase 초기 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트를 생성합니다.
2. **SQL Editor**에서 [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)을 실행해 테이블(`properties`, `registry_documents`, `change_events`, `watchlists`, `notifications`), RLS 정책, Private Storage 버킷(`registry-originals`)을 생성합니다.
3. **Authentication > Providers**에서 Email 및 필요 시 Kakao / Google OAuth를 활성화하고, Redirect URL에 `http://localhost:4173/auth/callback`과 Vercel 배포 도메인 `https://<도메인>/auth/callback`을 등록합니다.

## Vercel 배포

1. GitHub 저장소를 Vercel에 연결합니다 (Framework Preset: `Next.js`).
2. Project Settings > Environment Variables에 위 환경변수를 등록하고 배포합니다.

## 검증 명령

```powershell
npm test
npm run build
```
