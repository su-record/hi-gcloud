import { readConfig, writeConfig, configExists, HiGcloudConfig } from '../utils/config.js';

export const gcpSetupDefinition = {
  name: 'gcp_setup',
  description: '설정|초기화|프로필|setup|init|configure - 프로젝트별 GCP 설정을 관리합니다 (.hi-gcloud.json)',
  annotations: {
    title: 'GCP 프로젝트 설정',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'create', 'update'],
        description: '수행할 작업. status: 현재 설정 확인, create: 설정 생성, update: 설정 업데이트',
        default: 'status',
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID',
      },
      region: {
        type: 'string',
        description: '기본 리전 (예: asia-northeast3)',
      },
      account: {
        type: 'string',
        description: '계정 이메일',
      },
    },
    required: [],
  },
};

interface GcpSetupArgs {
  action?: 'status' | 'create' | 'update';
  project_id?: string;
  region?: string;
  account?: string;
}

export async function gcpSetup(args: GcpSetupArgs) {
  const action = args.action || 'status';

  try {
    switch (action) {
      case 'status':
        return await getStatus();
      case 'create':
      case 'update':
        return await saveConfig(args);
      default:
        return {
          content: [{ type: 'text', text: `알 수 없는 액션: ${action}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `오류: ${error.message}` }],
      isError: true,
    };
  }
}

async function getStatus() {
  const config = await readConfig();

  if (!config) {
    return {
      content: [{
        type: 'text',
        text: `📋 GCP 설정 상태

❌ .hi-gcloud.json 파일이 없습니다.

💡 설정 생성:
gcp_setup(action: "create", project_id: "your-project-id", region: "asia-northeast3")`,
      }],
    };
  }

  const lines = [
    '📋 GCP 설정 상태',
    '',
    '✅ .hi-gcloud.json 설정됨',
    `📁 프로젝트: ${config.project_id || '(미설정)'}`,
    `🌍 리전: ${config.region || '(미설정)'}`,
    `👤 계정: ${config.account || '(미설정)'}`,
  ];

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function saveConfig(args: GcpSetupArgs) {
  const existing = await readConfig() || {};

  const newConfig: HiGcloudConfig = {
    ...existing,
    ...(args.project_id && { project_id: args.project_id }),
    ...(args.region && { region: args.region }),
    ...(args.account && { account: args.account }),
  };

  if (!newConfig.project_id) {
    return {
      content: [{
        type: 'text',
        text: '❌ project_id가 필요합니다.\n\n예: gcp_setup(action: "create", project_id: "my-project")',
      }],
      isError: true,
    };
  }

  await writeConfig(newConfig);

  return {
    content: [{
      type: 'text',
      text: `✅ .hi-gcloud.json 저장됨

📁 프로젝트: ${newConfig.project_id}
🌍 리전: ${newConfig.region || '(미설정)'}
👤 계정: ${newConfig.account || '(미설정)'}

💡 .gitignore에 .hi-gcloud.json 추가를 권장합니다.`,
    }],
  };
}
