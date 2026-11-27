# 등기로 (Deunggiro)

부동산 등기부등본을 **공유·열람**하여 중복 발급 수수료를 줄이고, 관심 등록한 부동산의 **등기변동 알림**을 받는 웹 서비스입니다.  
**Next.js (App Router) + Supabase (PostgreSQL · Auth · Storage)** 기반으로 구성되어 있습니다.

## 핵심 기능

- **등기 검색 & PDF 뷰어**: 주소·건물명·고유번호로 공유된 최신 등기부등본을 찾고 브라우저 PDF 뷰어로 바로 열람
- **대량 등기 공유 (+P)**: 1건부터 수백 건의 등기 PDF를 드래그&드롭으로 일괄 업로드 (고유번호·발급일 자동 인식, 주민번호 노출 PDF 차단, 포인트 적립)
- **내 관리 물건 (변동 알림)**: 금융권 다건(200건+) 테이블 관리 및 개인 전세집 1건 감시, 상태 필터, 변동 감지 알림
- **알림 & 포인트**: 변동 알림 타임라인 및 포인트 적립·사용 내역 관리

## 로컬 실행

```powershell
Copy-Item .env.example .env.local
# .env.local에 Supabase 키를 입력합니다. (미설정 시 내장 데모 데이터로 체험 가능)
npm install
npm run dev
```

`http://localhost:4173`에서 열립니다.

## 환경변수 설정 (`.env.local` 및 Vercel)

| 변수명 | 용도 | 필수 여부 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 회원·영구 저장 사용 시 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Public Key | 회원·영구 저장 사용 시 |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자 모니터링에 사용하는 서버 전용 키 | 조회 결과 관리자 등록 시 |

## Supabase 초기 설정

1. [Supabase](https://supabase.com)에서 프로젝트를 생성합니다.
2. **SQL Editor**에서 아래 마이그레이션 파일을 순서대로 실행합니다:
   - [0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)
   - [0002_properties_insert_policy.sql](supabase/migrations/0002_properties_insert_policy.sql)
   - [0003_points_and_pdf_viewer.sql](supabase/migrations/0003_points_and_pdf_viewer.sql)
   - [0004_monitor_states.sql](supabase/migrations/0004_monitor_states.sql)
   - [0005_manual_registry_monitor.sql](supabase/migrations/0005_manual_registry_monitor.sql)
3. **Authentication > Providers**에서 Email 인증을 활성화하고 Redirect URL에 `http://localhost:4173/auth/callback`을 등록합니다.

## 인터넷등기소 조회 결과 등록

1. Supabase SQL Editor에서 지정 계정에 `monitor_admin` 권한을 부여합니다. 아래 UUID를 Authentication의 해당 사용자 ID로 바꿉니다.

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"monitor_admin": true}'::jsonb
   where id = '00000000-0000-0000-0000-000000000000'::uuid;
   ```

2. 관리자 계정으로 로그인한 뒤 **내 관리 물건 → 조회 결과 등록**을 엽니다. 경로는 `/admin/monitor`입니다.
3. 관심 등록 목록에서 고유번호를 선택하고 인터넷등기소에서 해당 부동산의 신청사건을 확인합니다. 실제 조회 시각과 결과를 입력하고 번호 일치를 확인한 뒤 등록합니다. 접수일·접수번호·신청 목적·처리상태가 있는 표를 붙여넣을 수 있습니다.
4. 첫 성공 결과는 비교 기준으로 저장합니다. 이후 확인된 신규 접수와 완료는 활성 구독자의 앱 알림함에 기록됩니다. 인터넷등기소 조회는 관리자가 직접 실행합니다.

## 검증 명령

```powershell
npm test
npm run build
```

마이그레이션을 적용한 테스트 DB에서 [수동 모니터링 SQL 검수](test/manual-monitor.sql)를 실행하면 구독자 전달, 중복 방지, 저장 실패 시 복구 및 접근 권한을 확인할 수 있습니다.
