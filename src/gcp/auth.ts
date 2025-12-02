import { checkGcloudAuth, executeGcloud } from '../utils/exec.js';
import { formatError } from '../utils/format.js';

export const gcpAuthStatusDefinition = {
  name: 'gcp_auth_status',
  description: '인증 상태|로그인 확인|계정 정보|auth status|whoami - GCP 인증 상태와 계정 정보를 확인합니다',
  inputSchema: {
    type: 'object' as const,
    properties: {
      show_all_accounts: {
        type: 'boolean',
        description: '모든 인증된 계정 표시 (기본: false)',
        default: false,
      },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: '출력 형식 (기본: text)',
        default: 'text',
      },
    },
    required: [],
  },
};

interface GcpAuthStatusArgs {
  show_all_accounts?: boolean;
  format?: 'text' | 'json';
}

export async function gcpAuthStatus(args: GcpAuthStatusArgs) {
  try {
    const authStatus = await checkGcloudAuth();

    if (!authStatus.authenticated) {
      return {
        content: [
          {
            type: 'text',
            text: formatError(authStatus.error),
          },
        ],
        isError: true,
      };
    }

    // Get additional configuration
    const configResult = await executeGcloud('config list --format=json', 10000);
    let config: any = {};
    try {
      config = JSON.parse(configResult.stdout || '{}');
    } catch {
      config = {};
    }

    // Get all accounts if requested
    let allAccounts: string[] = [];
    if (args.show_all_accounts) {
      try {
        const accountsResult = await executeGcloud('auth list --format="value(account)"', 10000);
        allAccounts = accountsResult.stdout.trim().split('\n').filter(Boolean);
      } catch {
        // Ignore errors
      }
    }

    const result = {
      authenticated: true,
      activeAccount: authStatus.account,
      project: authStatus.project,
      region: config.compute?.region || 'not set',
      zone: config.compute?.zone || 'not set',
      allAccounts: args.show_all_accounts ? allAccounts : undefined,
    };

    if (args.format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    const lines = [
      '🔑 GCP 인증 상태',
      '',
      `✅ 인증됨`,
      `👤 계정: ${result.activeAccount}`,
      `📁 프로젝트: ${result.project || '(설정 안됨)'}`,
      `🌍 리전: ${result.region}`,
      `📍 존: ${result.zone}`,
    ];

    if (args.show_all_accounts && allAccounts.length > 1) {
      lines.push('', '📋 모든 인증된 계정:');
      allAccounts.forEach((account) => {
        const isActive = account === result.activeAccount;
        lines.push(`  ${isActive ? '→' : ' '} ${account}${isActive ? ' (활성)' : ''}`);
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: formatError(error),
        },
      ],
      isError: true,
    };
  }
}
