import { executeGcloud } from '../utils/exec.js';

export const gcpSetupDefinition = {
  name: 'gcp_setup',
  description: '설정|초기화|프로필|setup|init|configure - GCP 설정 안내 및 현재 gcloud 설정 확인',
  annotations: {
    title: 'GCP 프로젝트 설정 안내',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_path: {
        type: 'string',
        description: '프로젝트 경로 (설정 파일을 만들 위치)',
      },
    },
    required: [],
  },
};

interface GcpSetupArgs {
  project_path?: string;
}

export async function gcpSetup(args: GcpSetupArgs) {
  try {
    // Get current gcloud config
    let currentProject = '';
    let currentRegion = '';
    let currentAccount = '';

    try {
      const projectResult = await executeGcloud('config get-value project', 5000);
      currentProject = projectResult.stdout.trim();
      if (currentProject === '(unset)') currentProject = '';
    } catch {}

    try {
      const regionResult = await executeGcloud('config get-value compute/region', 5000);
      currentRegion = regionResult.stdout.trim();
      if (currentRegion === '(unset)') currentRegion = '';
    } catch {}

    try {
      const accountResult = await executeGcloud('auth list --format="value(account)" --filter="status:ACTIVE"', 5000);
      currentAccount = accountResult.stdout.trim();
    } catch {}

    const projectPath = args.project_path || '프로젝트_경로';

    const configContent = JSON.stringify({
      project_id: currentProject || 'your-project-id',
      region: currentRegion || 'asia-northeast3',
      account: currentAccount || 'your@email.com',
    }, null, 2);

    const lines = [
      '📋 GCP 설정 안내',
      '',
      '## 현재 gcloud 설정',
      `- 프로젝트: ${currentProject || '(미설정)'}`,
      `- 리전: ${currentRegion || '(미설정)'}`,
      `- 계정: ${currentAccount || '(미설정)'}`,
      '',
      '## 프로젝트별 설정 방법',
      '',
      `프로젝트 루트에 \`.hi-gcloud.json\` 파일을 생성하세요:`,
      '',
      '```json',
      configContent,
      '```',
      '',
      `**파일 생성 위치:** \`${projectPath}/.hi-gcloud.json\``,
      '',
      '> ⚠️ `.gitignore`에 `.hi-gcloud.json` 추가를 권장합니다.',
      '',
      '## 설정 우선순위',
      '1. 도구 파라미터 (예: `project_id: "my-project"`)',
      '2. `.hi-gcloud.json` 파일',
      '3. gcloud CLI 기본 설정',
    ];

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `❌ gcloud CLI를 찾을 수 없습니다.

Google Cloud SDK를 설치해주세요:
https://cloud.google.com/sdk/docs/install

설치 후:
\`\`\`bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
\`\`\``,
      }],
      isError: true,
    };
  }
}
