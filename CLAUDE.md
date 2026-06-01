# CLAUDE.md

이 저장소에서 작업하는 AI 어시스턴트를 위한 가이드입니다.

## 개요

**cafegate-oneflow-dashboard**는 카페게이트(카페 체인)를 위한 한국어 사내 웹 앱입니다.
두 가지 핵심 업무 흐름을 관리합니다.

- **코드 요청** — 각 팀 → 구매팀 → CJ 물류 → 완료로 이어지는 제품 코드 등록 요청
- **신메뉴 출시 프로젝트** — 신메뉴 출시를 위한 팀 간 업무(태스크)와 일정

구매팀, 메뉴개발팀, 운영팀, 임원진을 대상으로 하며 KPI 대시보드, 리스크 탐지,
주간 요약, 임원 보고(SCQA) 리포트를 제공합니다.

- 배포 URL: `https://first-project-ver2.vercel.app` (Vercel)
- 코드베이스와 UI 문구는 대부분 **한국어**입니다. 사용자 노출 텍스트를 수정할 때는
  주변 언어(한국어)에 맞추세요.

## 기술 스택

- **Next.js 14.2** (App Router, React 18) — 동적 렌더링 기반 서버 컴포넌트
- **Prisma 7.8** + **`@prisma/adapter-neon`** (HTTP 모드) → **Neon Postgres**
- **Tailwind CSS 3.4** — 스타일링
- **jose** (JWT) + **bcryptjs** (비밀번호 해싱) — 인증 사전 준비, 아직 미적용
- **xlsx** (엑셀 일괄 업로드), **recharts** (차트), **next-themes**
- **TypeScript** (strict)

## 명령어

```bash
npm run dev      # next dev (로컬 개발)
npm run build    # prisma generate && next build
npm start        # next start (프로덕션)
npm run lint     # next lint
npm run check    # 배포 검수 스모크 테스트 (scripts/check-deploy.js)

npx prisma generate        # 클라이언트 재생성 → app/generated/prisma
npx prisma migrate dev     # 로컬에서 마이그레이션 생성/적용
tsx prisma/seed.ts         # DB 시드 (prisma.config.ts에 설정됨)
```

`prisma generate`는 `postinstall` 시점과 매 빌드 전에 자동 실행됩니다.

## 디렉터리 구조

```
app/
  page.tsx                       # 홈: 팀 카드 + 월별 달력
  layout.tsx, globals.css        # 루트 레이아웃, 테마/색상
  projects/page.tsx              # 프로젝트 보드
  projects/[id]/page.tsx         # 프로젝트 상세 (팀별 진행도, 태스크, 코드 요청)
  request/new/page.tsx           # 신규 코드 요청 폼 + 엑셀 일괄 업로드
  dashboard/purchasing/page.tsx  # 구매팀 대시보드 (KPI, 리스크, 트래킹)
  executive/page.tsx             # 임원 SCQA 리포트 (인쇄용)
  api/
    health/route.ts                   # DB + 환경변수 헬스체크
    code-requests/route.ts            # 코드 요청 GET/POST/PATCH
    code-requests/bulk/route.ts       # 엑셀 일괄 등록 POST
    kpi/route.ts                      # KPI 계산
    projects/route.ts, [id]/route.ts  # 프로젝트 CRUD
    automation/risk-check/route.ts    # 긴급/경고 항목 탐지
    automation/weekly-summary/route.ts# 마크다운 주간 요약
components/   # KpiCard, ProjectCard, RiskBanner, ScqaReport, TeamCalendar,
              # TrackingTable, ExcelUpload, CjGroupPreview, PrintButton
lib/          # prisma.ts, auth.ts, logger.ts
prisma/       # schema.prisma, seed.ts, migrations/
scripts/      # check-deploy.js (배포 후 검수)
```

## 데이터 모델 (prisma/schema.prisma)

- **CodeRequest** — 핵심 엔티티. 제품/공급사 정보, 물류 필드(shelfLife, leadTime,
  monthlyUsage 등), CJ 납품, 상태 플래그(`status`, `receivedConfirmed`, `cjRequested`,
  `completed`), 요청 맥락(`requestType`, `requestTeam`, `requesterName`). `Project`에
  선택적으로 소속됩니다.
- **Project** — 출시 프로젝트. `tasks[]`와 `codeRequests[]`를 가집니다.
- **ProjectTask** — 팀별 태스크(`teamName`, `taskName`, `dueDate`, `status`, `assignee`,
  `weeklyUpdate`).
- **User** + **ActivityLog** — 인증/감사 로그 사전 준비(아직 라우트에 연결되지 않음).
- **KpiLog** — 추세 추적을 위한 KPI 이력 값.

상태 값은 Prisma enum이 아니라 일반 **문자열**입니다
(예: `DRAFT`/`RECEIVED`/`CJ_REQUESTED`/`COMPLETED`/`REJECTED`). 생성된 클라이언트는
`app/generated/prisma`에 위치하며 gitignore 처리됩니다.

## 핵심 규칙 & 주의사항

직관적이지 않고 깨지기 쉬운 부분이니 반드시 지켜주세요.

1. **Neon HTTP 모드는 다중 문장 트랜잭션을 지원하지 않습니다.** `createMany()`나
   대화형 `$transaction`을 사용하지 마세요. 일괄 삽입은
   `await Promise.all(rows.map(r => prisma.codeRequest.create({ data: r })))` 형태로
   처리합니다 — `app/api/code-requests/bulk/route.ts` 참고.

2. **DB에 접근하는 모든 페이지/라우트는 `force-dynamic`을 export 해야 합니다.**
   ```ts
   export const dynamic = "force-dynamic";
   ```
   빌드 시점 DB 접근과 정적 생성을 방지합니다.

3. **`lib/prisma.ts`의 싱글턴 Prisma 클라이언트를 재사용하세요** (Neon HTTP 어댑터 사용,
   `DATABASE_URL`의 공백 제거, 프로덕션 외에는 `globalThis`에 캐싱). 라우트에서
   `PrismaClient`를 직접 생성하지 마세요.

4. **`next.config.mjs`의 외부 패키지 목록을 유지하세요**
   (`serverExternalPackages: ["@neondatabase/serverless", "@prisma/adapter-neon", "pg"]`).
   항목을 제거하면 서버리스 번들이 깨집니다.

5. **구조화된 로거 `lib/logger.ts`를 사용하세요** — `apiLogger(route)`가
   `{ info, warn, error }`를 반환하며 Vercel용 JSON 로그를 출력합니다. 라우트에서
   맨 `console.log`은 피하세요.

6. **임포트 별칭** `@/*`는 저장소 루트를 가리킵니다(`tsconfig.json` 참고). 예:
   `import { prisma } from "@/lib/prisma"`.

## 인증 상태

`lib/auth.ts`는 `signToken`/`verifyToken`(jose, HS256, 8시간),
`hashPassword`/`verifyPassword`(bcrypt cost 12), `AUTH_COOKIE = "cg_token"`를 제공합니다.
`User`/`ActivityLog` 모델도 존재합니다. 다만 **인증은 준비만 되어 있고 어떤 라우트에도
아직 적용되지 않았습니다.** 로그인이 연결되기 전까지는 사전 준비 코드로 취급하세요.

## 환경 변수

- `DATABASE_URL` — Neon Postgres 연결 문자열(HTTP 모드). **필수.**
- `JWT_SECRET` — JWT 서명 키(미설정 시 안전하지 않은 기본값 사용).
- `NODE_ENV` — Prisma 싱글턴 캐싱 동작에 영향.
- `CLAUDE_TOOL_INPUT` — `scripts/check-deploy.js`가 `git push` 감지에 사용.

`DATABASE_URL`/`JWT_SECRET`/`NODE_ENV`의 런타임 존재 여부는 `GET /api/health`에서
확인할 수 있습니다.

## 배포 / 검수 워크플로

`scripts/check-deploy.js`는 `git push` 이후 Claude Code **PostToolUse 훅**에서 실행되도록
설계된 배포 후 스모크 테스트입니다. `CLAUDE_TOOL_INPUT`에 `"git push"`가 포함될 때만
동작하며(그 외에는 조용히 종료), 다음을 수행합니다.

1. Vercel(`npx vercel`)에서 최신 배포를 폴링(3분 타임아웃, 6초 간격).
2. 빌드 실패 시 에러 로그를 가져와 출력.
3. 성공 시 `GET /api/health`, 코드 요청 목록 조회, `__auto_check__` `CodeRequest` 생성 +
   정리(`REJECTED` 처리)로 스모크 테스트.

`npm run check`로 수동 실행할 수 있습니다. **참고:** 저장소에는 스크립트만 커밋되어 있고,
훅 연결 설정(`.claude/settings.json`)은 포함되어 있지 않으므로 로컬에서 직접 구성해야
합니다.

## 수정 시 유의사항

- DB를 사용하는 새 페이지/라우트에는 `force-dynamic`을 추가하세요.
- Neon HTTP 모드 제약(`createMany`/트랜잭션 금지)을 지키세요.
- `lib/prisma.ts`, `lib/logger.ts`, `lib/auth.ts`를 재구현하지 말고 재사용하세요.
- 기존 UI에 맞춰 사용자 노출 문구는 한국어로 작성하세요.
- 마이그레이션 후 클라이언트는 빌드 시 재생성됩니다. 로컬에서는 `npx prisma generate` 실행.
