import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { executeGcloud } from '../utils/exec.js';

export const gcpSetupDefinition = {
  name: 'gcp_setup',
  description: '설정|초기화|프로필|setup|init|configure - 프로젝트별 GCP 설정 파일(.hi-gcloud.json)을 생성합니다. project_path에 현재 작업 폴더 경로를 지정하세요.',
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
      project_path: {
        type: 'string',
        description: '프로젝트 경로 (현재 작업 폴더 경로를 지정하세요)',
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
  project_path?: string;
  project_id?: string;
  region?: string;
  account?: string;
}

export async function gcpSetup(args: GcpSetupArgs) {
  const action = args.action || 'status';

  try {
    switch (action) {
      case 'status':
        return await getStatus(args.project_path);
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

async function getStatus(projectPath?: string) {
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

  // Check if .hi-gcloud.json exists
  let configExists = false;
  let existingConfig: any = null;
  if (projectPath) {
    const configPath = join(projectPath, '.hi-gcloud.json');
    if (existsSync(configPath)) {
      configExists = true;
      try {
        const { readFile } = await import('fs/promises');
        const content = await readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(content);
      } catch {}
    }
  }

  const lines = [
    '📋 GCP 설정 상태',
    '',
    '## gcloud CLI 설정',
    `- 프로젝트: ${currentProject || '(미설정)'}`,
    `- 리전: ${currentRegion || '(미설정)'}`,
    `- 계정: ${currentAccount || '(미설정)'}`,
  ];

  if (projectPath) {
    lines.push('', '## 프로젝트 설정 파일');
    if (configExists && existingConfig) {
      lines.push(`✅ ${projectPath}/.hi-gcloud.json 존재`);
      lines.push(`- project_id: ${existingConfig.project_id || '(미설정)'}`);
      lines.push(`- region: ${existingConfig.region || '(미설정)'}`);
      lines.push(`- account: ${existingConfig.account || '(미설정)'}`);
    } else {
      lines.push(`❌ ${projectPath}/.hi-gcloud.json 없음`);
      lines.push('');
      lines.push('💡 설정 생성: gcp_setup(action: "create", project_path: "...")');
    }
  } else {
    lines.push('');
    lines.push('💡 project_path를 지정하면 프로젝트별 설정 파일을 확인할 수 있습니다.');
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function saveConfig(args: GcpSetupArgs) {
  if (!args.project_path) {
    return {
      content: [{
        type: 'text',
        text: '❌ project_path가 필요합니다.\n\n예: gcp_setup(action: "create", project_path: "/path/to/project", project_id: "my-project")',
      }],
      isError: true,
    };
  }

  // Get current gcloud config as defaults
  let defaultProject = '';
  let defaultRegion = '';
  let defaultAccount = '';

  try {
    const projectResult = await executeGcloud('config get-value project', 5000);
    defaultProject = projectResult.stdout.trim();
    if (defaultProject === '(unset)') defaultProject = '';
  } catch {}

  try {
    const regionResult = await executeGcloud('config get-value compute/region', 5000);
    defaultRegion = regionResult.stdout.trim();
    // Handle various "unset" responses from gcloud
    if (!defaultRegion || defaultRegion === '(unset)' || defaultRegion === 'unset') {
      defaultRegion = '';
    }
  } catch {
    defaultRegion = '';
  }

  try {
    const accountResult = await executeGcloud('auth list --format="value(account)" --filter="status:ACTIVE"', 5000);
    defaultAccount = accountResult.stdout.trim();
  } catch {}

  // Read existing config if updating
  const configPath = join(args.project_path, '.hi-gcloud.json');
  let existingConfig: any = {};
  if (existsSync(configPath)) {
    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(configPath, 'utf-8');
      existingConfig = JSON.parse(content);
    } catch {}
  }

  const newConfig = {
    project_id: args.project_id || existingConfig.project_id || defaultProject,
    region: args.region || existingConfig.region || defaultRegion || undefined,
    account: args.account || existingConfig.account || defaultAccount,
  };

  if (!newConfig.project_id) {
    return {
      content: [{
        type: 'text',
        text: '❌ project_id가 필요합니다. gcloud에 설정된 프로젝트가 없으므로 직접 지정해주세요.\n\n예: gcp_setup(action: "create", project_path: "...", project_id: "my-project")',
      }],
      isError: true,
    };
  }

  await writeFile(configPath, JSON.stringify(newConfig, null, 2));

  return {
    content: [{
      type: 'text',
      text: `✅ ${configPath} 저장됨

📁 프로젝트: ${newConfig.project_id}
🌍 리전: ${newConfig.region}
👤 계정: ${newConfig.account || '(미설정)'}

> ⚠️ .gitignore에 .hi-gcloud.json 추가를 권장합니다.`,
    }],
  };
}
