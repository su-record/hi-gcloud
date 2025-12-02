# Hi-GCloud

[![smithery badge](https://smithery.ai/badge/@su-record/hi-gcloud)](https://smithery.ai/server/@su-record/hi-gcloud)
[![npm version](https://badge.fury.io/js/@su-record%2Fhi-gcloud.svg)](https://www.npmjs.com/package/@su-record/hi-gcloud)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

MCP server for GCP operations - Query logs, check Cloud Run status, and debug deployments with gcloud CLI.

## Features

- **Cloud Logging** - 로그 조회 및 에러 필터링
- **Cloud Run** - 서비스 상태 및 배포 로그 확인
- **Cloud SQL** - 읽기 전용 쿼리 실행
- **Cloud Storage** - 버킷/객체 목록 조회
- **Secret Manager** - 시크릿 관리 및 조회
- **Auth Status** - 인증 상태 확인
- **API Services** - 활성화된 서비스 목록
- **Billing** - 과금 정보 조회
- **프로젝트별 설정** - `.hi-gcloud.json`으로 프로젝트별 GCP 설정

## Prerequisites

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) 설치
2. 인증 완료:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

## Installation

```bash
npm install -g @su-record/hi-gcloud
```

### Claude Desktop Configuration

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hi-gcloud": {
      "command": "npx",
      "args": ["-y", "@su-record/hi-gcloud"]
    }
  }
}
```

## First-Time Setup

처음 GCP 도구를 사용하면 설정을 묻습니다:

```
📋 이 프로젝트에서 GCP를 사용하시나요?

1️⃣  예 → gcp_setup(action: "create")
2️⃣  아니오 → gcp_setup(action: "disable")
```

### GCP 사용 프로젝트

```bash
# 현재 gcloud 설정으로 자동 생성
gcp_setup(action: "create")

# 또는 직접 지정
gcp_setup(action: "create", project_id: "my-project-id")
```

생성되는 `.hi-gcloud.json`:
```json
{
  "enabled": true,
  "project_id": "my-project-id",
  "region": "asia-northeast3"
}
```

### GCP 미사용 프로젝트

```bash
gcp_setup(action: "disable")
```

생성되는 `.hi-gcloud.json`:
```json
{
  "enabled": false
}
```

> 💡 **도구 숨김**: `enabled: false`로 설정하면 hi-gcloud의 모든 도구가 LLM에게 보이지 않습니다.
> GCP를 사용하지 않는 프로젝트에서 불필요한 도구 노출을 방지합니다.

### GCP 재연결

비활성화된 프로젝트에서 다시 GCP를 사용하려면:

```bash
gcp_setup(action: "enable")

# 또는 프로젝트 ID 직접 지정
gcp_setup(action: "enable", project_id: "my-new-project")
```

### 수동 설정

프로젝트 루트에 직접 `.hi-gcloud.json` 파일을 만들 수도 있습니다:

```json
{
  "enabled": true,
  "project_id": "your-project-id",
  "region": "asia-northeast3",
  "account": "your@email.com"
}
```

> ⚠️ `.gitignore`에 `.hi-gcloud.json` 추가를 권장합니다.

## Tools (10 tools)

### gcp_setup
GCP 프로젝트 설정 관리

```
"GCP 설정 상태 확인" → action: "status"
"GCP 활성화" → action: "create" 또는 "enable"
"GCP 비활성화" → action: "disable"
"설정 업데이트" → action: "update"
```

### gcp_logs_read
Cloud Logging에서 로그 조회

```
"최근 에러 로그 보여줘"
"지난 6시간 WARNING 이상 로그"
```

### gcp_run_status
Cloud Run 서비스 상태 조회

```
"my-api 서비스 상태 확인"
"Cloud Run 배포 상태"
```

### gcp_run_logs
Cloud Run 서비스 로그 조회

```
"my-api 에러 로그"
"Cloud Run 최근 로그"
```

### gcp_sql_query
Cloud SQL 읽기 전용 쿼리 (SELECT만 허용)

```
"users 테이블 조회"
```

### gcp_storage_list
Cloud Storage 버킷/객체 목록

```
"버킷 목록 보여줘"
"my-bucket 파일 목록"
```

### gcp_secret_list
Secret Manager 시크릿 조회

```
"시크릿 목록"
"API_KEY 시크릿 값 확인"
```

### gcp_auth_status
GCP 인증 상태 확인

```
"인증 상태 확인"
"어떤 계정으로 로그인되어 있어?"
```

### gcp_services_list
활성화된 API 서비스 목록

```
"어떤 API가 활성화되어 있어?"
"run 관련 서비스 찾아줘"
```

### gcp_billing_info
프로젝트 결제 정보 조회

```
"과금 정보 확인"
"얼마나 나왔어?"
```

## Use Cases

### 배포 실패 디버깅
```
User: "배포가 실패했어"
→ gcp_run_logs로 에러 확인
→ 에러 원인 분석
→ 수정 제안
```

### 비용 모니터링
```
User: "이번 달 비용 확인"
→ gcp_billing_info로 결제 정보 조회
→ 비용 절감 팁 제공
```

### 시크릿 관리
```
User: "DB 비밀번호 확인"
→ gcp_secret_list로 시크릿 조회
```

## Integration with Hi-AI

[hi-ai](https://github.com/su-record/hi-ai)와 함께 사용하면 강력한 GCP 운영 + 코드 수정 워크플로우를 제공합니다.

### 자동 연동 힌트

에러 발견 시 hi-ai 도구를 자동으로 추천합니다:

```
📋 Cloud Run 로그: my-api
🔴 3개의 에러가 발견되었습니다.

📋 에러 요약:
  🔴 ERROR: 3건

🔍 최근 에러 상세:
  1. [12/02 14:30:00] TypeError: Cannot read property 'id' of undefined
     └ 리소스: my-api-00001-abc

💡 hi-ai 연동 가능: 에러 분석이 필요하면 analyze_problem 도구로 원인을 분석하고,
   관련 코드를 찾아 수정 방안을 제시할 수 있습니다.
   메모리에 저장하면 같은 에러 재발 시 빠르게 해결할 수 있습니다.
```

### 연동 도구 매핑

| hi-gcloud 상황 | hi-ai 추천 도구 |
|---------------|-----------------|
| 에러 로그 발견 | `analyze_problem`, `find_symbol` |
| 배포 실패 | `step_by_step_analysis`, `suggest_improvements` |
| 성능 문제 | `analyze_complexity`, `check_coupling_cohesion` |
| 비용 증가 | `break_down_problem`, `format_as_plan` |

### 워크플로우 예시

```
User: "배포가 실패했어"

[hi-gcloud]
→ gcp_run_logs로 에러 로그 조회
→ 에러 3건 발견, hi-ai 연동 힌트 자동 제공

[hi-ai 자동 연동]
→ analyze_problem으로 에러 원인 분석
→ find_symbol로 관련 코드 위치 파악
→ suggest_improvements로 수정 방안 제시
→ save_memory로 해결 방법 저장 (재발 방지)
```

### 함께 설치

```json
{
  "mcpServers": {
    "hi-ai": {
      "command": "npx",
      "args": ["-y", "@su-record/hi-ai"]
    },
    "hi-gcloud": {
      "command": "npx",
      "args": ["-y", "@su-record/hi-gcloud"]
    }
  }
}
```

## Configuration Priority

설정 우선순위:
1. 도구 파라미터로 직접 지정 (예: `project_id: "my-project"`)
2. `.hi-gcloud.json` 파일
3. gcloud CLI 기본 설정

## Required Permissions

| Tool | Required Role |
|------|---------------|
| gcp_logs_read | roles/logging.viewer |
| gcp_run_* | roles/run.viewer |
| gcp_sql_query | roles/cloudsql.viewer |
| gcp_storage_list | roles/storage.objectViewer |
| gcp_secret_list | roles/secretmanager.secretAccessor |
| gcp_billing_info | roles/billing.viewer |

## License

MIT

## Related

- [hi-ai](https://github.com/su-record/hi-ai) - AI development assistant MCP