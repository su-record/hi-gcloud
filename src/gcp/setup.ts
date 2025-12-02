import {
  readConfig,
  writeConfig,
  writeDisabledConfig,
  getGcloudConfig,
  getConfigTemplate,
  configExists,
  HiGcloudConfig,
} from '../utils/config.js';
import { formatError } from '../utils/format.js';

export const gcpSetupDefinition = {
  name: 'gcp_setup',
  description: '설정|초기화|프로필|setup|init|configure|GCP 사용|비활성화 - GCP 프로젝트 설정을 관리합니다 (.hi-gcloud.json)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'create', 'update', 'disable', 'enable', 'show-template'],
        description: '수행할 작업. status: 현재 설정 확인, create: GCP 설정 생성, disable: GCP 비활성화, enable: GCP 활성화, update: 설정 업데이트, show-template: 템플릿 보기',
        default: 'status',
      },
      project_id: {
        type: 'string',
        description: '프로젝트 ID (create/update/enable 시)',
      },
      region: {
        type: 'string',
        description: '기본 리전 (create/update/enable 시)',
      },
      account: {
        type: 'string',
        description: '계정 이메일 (create/update/enable 시)',
      },
      use_gcloud_defaults: {
        type: 'boolean',
        description: '현재 gcloud 설정을 기본값으로 사용 (create/enable 시)',
        default: true,
      },
    },
    required: [],
  },
};

interface GcpSetupArgs {
  action?: 'status' | 'create' | 'update' | 'disable' | 'enable' | 'show-template';
  project_id?: string;
  region?: string;
  account?: string;
  use_gcloud_defaults?: boolean;
}

export async function gcpSetup(args: GcpSetupArgs) {
  const action = args.action || 'status';

  try {
    switch (action) {
      case 'status':
        return await handleStatus();
      case 'create':
        return await handleCreate(args);
      case 'update':
        return await handleUpdate(args);
      case 'disable':
        return handleDisable();
      case 'enable':
        return await handleEnable(args);
      case 'show-template':
        return handleShowTemplate();
      default:
        return {
          content: [{ type: 'text', text: `❌ 알 수 없는 action: ${action}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: formatError(error) }],
      isError: true,
    };
  }
}

async function handleStatus() {
  const fileConfig = readConfig();
  const gcloudConfig = await getGcloudConfig();

  const lines: string[] = ['🔧 Hi-GCloud 설정 상태', ''];

  // File config status
  if (fileConfig.disabled) {
    lines.push('📄 .hi-gcloud.json: 🚫 GCP 비활성화됨');
    lines.push('');
    lines.push('이 프로젝트에서 GCP 기능이 비활성화되어 있습니다.');
    lines.push('활성화하려면: gcp_setup(action: "enable")');
  } else if (fileConfig.exists && fileConfig.config) {
    lines.push('📄 .hi-gcloud.json: ✅ GCP 활성화됨');
    lines.push(`   📁 프로젝트: ${fileConfig.config.project_id}`);
    if (fileConfig.config.region) lines.push(`   🌍 리전: ${fileConfig.config.region}`);
    if (fileConfig.config.account) lines.push(`   👤 계정: ${fileConfig.config.account}`);
  } else if (fileConfig.exists && fileConfig.error) {
    lines.push('📄 .hi-gcloud.json: ⚠️ 오류');
    lines.push(`   ${fileConfig.error}`);
  } else {
    lines.push('📄 .hi-gcloud.json: ❌ 없음');
    lines.push('');
    lines.push('이 프로젝트에서 GCP를 사용하시나요?');
    lines.push('  1️⃣  예 → gcp_setup(action: "create")');
    lines.push('  2️⃣  아니오 → gcp_setup(action: "disable")');
  }

  lines.push('');

  // gcloud config status (only show if not disabled)
  if (!fileConfig.disabled) {
    lines.push('🔧 gcloud CLI 설정:');
    if (gcloudConfig.error) {
      lines.push(`   ❌ ${gcloudConfig.error}`);
    } else {
      if (gcloudConfig.account) lines.push(`   👤 계정: ${gcloudConfig.account}`);
      if (gcloudConfig.project) lines.push(`   📁 프로젝트: ${gcloudConfig.project}`);
      if (gcloudConfig.region) lines.push(`   🌍 리전: ${gcloudConfig.region}`);
    }
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function handleCreate(args: GcpSetupArgs) {
  const existing = readConfig();

  // Check if already exists and enabled
  if (existing.exists && !existing.disabled && existing.config) {
    return {
      content: [{
        type: 'text',
        text: '⚠️ .hi-gcloud.json이 이미 존재합니다.\n\n업데이트하려면 action: "update"를 사용하세요.',
      }],
      isError: true,
    };
  }

  // If disabled, suggest enable instead
  if (existing.disabled) {
    return {
      content: [{
        type: 'text',
        text: '⚠️ GCP가 비활성화되어 있습니다.\n\n활성화하려면: gcp_setup(action: "enable")',
      }],
      isError: true,
    };
  }

  let config: HiGcloudConfig;

  if (args.use_gcloud_defaults !== false && !args.project_id) {
    // Use gcloud defaults
    const gcloudConfig = await getGcloudConfig();

    if (!gcloudConfig.project) {
      return {
        content: [{
          type: 'text',
          text: '❌ gcloud 프로젝트가 설정되지 않았습니다.\n\nproject_id를 직접 지정해주세요:\ngcp_setup(action: "create", project_id: "your-project-id")',
        }],
        isError: true,
      };
    }

    config = {
      enabled: true,
      project_id: gcloudConfig.project,
      region: args.region || gcloudConfig.region,
      account: args.account || gcloudConfig.account,
    };
  } else {
    if (!args.project_id) {
      return {
        content: [{
          type: 'text',
          text: '❌ project_id가 필요합니다.\n\ngcp_setup(action: "create", project_id: "your-project-id")',
        }],
        isError: true,
      };
    }

    config = {
      enabled: true,
      project_id: args.project_id,
      region: args.region,
      account: args.account,
    };
  }

  // Remove undefined fields
  if (!config.region) delete config.region;
  if (!config.account) delete config.account;

  const result = writeConfig(config);

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: `❌ 파일 생성 실패: ${result.error}`,
      }],
      isError: true,
    };
  }

  const lines = [
    '✅ .hi-gcloud.json 생성 완료!',
    '',
    '생성된 설정:',
    `  ✅ GCP 활성화: 예`,
    `  📁 프로젝트: ${config.project_id}`,
  ];
  if (config.region) lines.push(`  🌍 리전: ${config.region}`);
  if (config.account) lines.push(`  👤 계정: ${config.account}`);

  lines.push('');
  lines.push('⚠️ .gitignore에 .hi-gcloud.json 추가를 권장합니다:');
  lines.push('   echo ".hi-gcloud.json" >> .gitignore');

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function handleUpdate(args: GcpSetupArgs) {
  const existing = readConfig();

  if (!existing.exists) {
    return {
      content: [{
        type: 'text',
        text: '❌ .hi-gcloud.json이 없습니다.\n\n먼저 생성하세요: gcp_setup(action: "create")',
      }],
      isError: true,
    };
  }

  if (existing.disabled) {
    return {
      content: [{
        type: 'text',
        text: '⚠️ GCP가 비활성화되어 있습니다.\n\n먼저 활성화하세요: gcp_setup(action: "enable")',
      }],
      isError: true,
    };
  }

  if (existing.error) {
    return {
      content: [{
        type: 'text',
        text: `❌ 기존 파일 오류: ${existing.error}\n\n파일을 삭제하고 다시 생성하세요.`,
      }],
      isError: true,
    };
  }

  const config: HiGcloudConfig = {
    ...existing.config!,
    ...(args.project_id && { project_id: args.project_id }),
    ...(args.region && { region: args.region }),
    ...(args.account && { account: args.account }),
  };

  const result = writeConfig(config);

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: `❌ 파일 업데이트 실패: ${result.error}`,
      }],
      isError: true,
    };
  }

  const lines = [
    '✅ .hi-gcloud.json 업데이트 완료!',
    '',
    '현재 설정:',
    `  📁 프로젝트: ${config.project_id}`,
  ];
  if (config.region) lines.push(`  🌍 리전: ${config.region}`);
  if (config.account) lines.push(`  👤 계정: ${config.account}`);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

function handleDisable() {
  const existing = readConfig();

  if (existing.disabled) {
    return {
      content: [{
        type: 'text',
        text: '이미 GCP가 비활성화되어 있습니다.',
      }],
    };
  }

  const result = writeDisabledConfig();

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: `❌ 파일 생성 실패: ${result.error}`,
      }],
      isError: true,
    };
  }

  const lines = [
    '🚫 GCP 비활성화 완료!',
    '',
    '이 프로젝트에서 GCP 관련 기능이 비활성화되었습니다.',
    'GCP 도구 호출 시 자동으로 건너뜁니다.',
    '',
    '나중에 활성화하려면: gcp_setup(action: "enable")',
    '',
    '⚠️ .gitignore에 .hi-gcloud.json 추가를 권장합니다:',
    '   echo ".hi-gcloud.json" >> .gitignore',
  ];

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function handleEnable(args: GcpSetupArgs) {
  const existing = readConfig();

  if (existing.exists && !existing.disabled && existing.config) {
    return {
      content: [{
        type: 'text',
        text: '이미 GCP가 활성화되어 있습니다.\n\n설정을 변경하려면: gcp_setup(action: "update")',
      }],
    };
  }

  // Same logic as create
  let config: HiGcloudConfig;

  if (args.use_gcloud_defaults !== false && !args.project_id) {
    const gcloudConfig = await getGcloudConfig();

    if (!gcloudConfig.project) {
      return {
        content: [{
          type: 'text',
          text: '❌ gcloud 프로젝트가 설정되지 않았습니다.\n\nproject_id를 직접 지정해주세요:\ngcp_setup(action: "enable", project_id: "your-project-id")',
        }],
        isError: true,
      };
    }

    config = {
      enabled: true,
      project_id: gcloudConfig.project,
      region: args.region || gcloudConfig.region,
      account: args.account || gcloudConfig.account,
    };
  } else {
    if (!args.project_id) {
      return {
        content: [{
          type: 'text',
          text: '❌ project_id가 필요합니다.\n\ngcp_setup(action: "enable", project_id: "your-project-id")',
        }],
        isError: true,
      };
    }

    config = {
      enabled: true,
      project_id: args.project_id,
      region: args.region,
      account: args.account,
    };
  }

  // Remove undefined fields
  if (!config.region) delete config.region;
  if (!config.account) delete config.account;

  const result = writeConfig(config);

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: `❌ 파일 생성 실패: ${result.error}`,
      }],
      isError: true,
    };
  }

  const lines = [
    '✅ GCP 활성화 완료!',
    '',
    '설정:',
    `  📁 프로젝트: ${config.project_id}`,
  ];
  if (config.region) lines.push(`  🌍 리전: ${config.region}`);
  if (config.account) lines.push(`  👤 계정: ${config.account}`);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

function handleShowTemplate() {
  const lines = [
    '📝 .hi-gcloud.json 템플릿',
    '',
    '프로젝트 루트에 .hi-gcloud.json 파일을 생성하세요:',
    '',
    '▶ GCP 사용 시:',
    '```json',
    '{',
    '  "enabled": true,',
    '  "project_id": "your-project-id",',
    '  "region": "asia-northeast3",',
    '  "account": "your@email.com"',
    '}',
    '```',
    '',
    '▶ GCP 미사용 시:',
    '```json',
    '{',
    '  "enabled": false',
    '}',
    '```',
    '',
    '필드 설명:',
    '  - enabled (필수): GCP 사용 여부 (true/false)',
    '  - project_id (enabled=true 시 필수): GCP 프로젝트 ID',
    '  - region (선택): 기본 리전 (예: asia-northeast3)',
    '  - account (선택): 사용할 계정 이메일',
    '',
    '⚠️ .gitignore에 추가를 권장합니다:',
    '   echo ".hi-gcloud.json" >> .gitignore',
  ];

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}
