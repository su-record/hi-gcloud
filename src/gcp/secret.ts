import { executeGcloud, getProjectId } from '../utils/exec.js';
import { formatError } from '../utils/format.js';

export const gcpSecretListDefinition = {
  name: 'gcp_secret_list',
  description: '시크릿 목록|비밀 관리|secret manager|secrets - Secret Manager 시크릿을 조회합니다',
  annotations: {
    title: 'Secret Manager 조회',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      secret_name: {
        type: 'string',
        description: '시크릿 이름 (없으면 목록, 있으면 해당 시크릿의 버전 목록)',
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      show_value: {
        type: 'boolean',
        description: '시크릿 값 표시 여부 (기본: false, 보안 주의!)',
        default: false,
      },
      version: {
        type: 'string',
        description: '조회할 버전 (기본: latest)',
        default: 'latest',
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

interface GcpSecretListArgs {
  secret_name?: string;
  project_id?: string;
  show_value?: boolean;
  version?: string;
  format?: 'text' | 'json';
}

export async function gcpSecretList(args: GcpSecretListArgs) {
  try {
    const projectId = await getProjectId(args.project_id);

    if (args.secret_name) {
      if (args.show_value) {
        // Get secret value
        const version = args.version || 'latest';
        const command = `secrets versions access ${version} --secret=${args.secret_name} --project=${projectId}`;
        const result = await executeGcloud(command, 15000);

        const secretValue = result.stdout.trim();

        if (args.format === 'json') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  project: projectId,
                  secret: args.secret_name,
                  version,
                  value: secretValue,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `🔐 시크릿: ${args.secret_name}\n버전: ${version}\n\n값:\n${secretValue}`,
            },
          ],
        };
      } else {
        // Get secret versions
        const command = `secrets versions list ${args.secret_name} --project=${projectId} --format=json`;
        const result = await executeGcloud(command, 15000);

        let versions: any[] = [];
        try {
          versions = JSON.parse(result.stdout || '[]');
        } catch {
          versions = [];
        }

        const versionList = versions.map((v: any) => ({
          name: v.name?.split('/').pop(),
          state: v.state,
          created: v.createTime,
        }));

        if (args.format === 'json') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  project: projectId,
                  secret: args.secret_name,
                  versions: versionList,
                }, null, 2),
              },
            ],
          };
        }

        const lines = ['🔐 시크릿 버전 목록: ' + args.secret_name, ''];
        versionList.forEach((v) => {
          const stateEmoji = v.state === 'ENABLED' ? '✅' : v.state === 'DISABLED' ? '⏸️' : '❌';
          lines.push(`  ${stateEmoji} ${v.name} - ${v.state}`);
        });

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
            },
          ],
        };
      }
    } else {
      // List all secrets
      const command = `secrets list --project=${projectId} --format=json`;
      const result = await executeGcloud(command, 15000);

      let secrets: any[] = [];
      try {
        secrets = JSON.parse(result.stdout || '[]');
      } catch {
        secrets = [];
      }

      const secretList = secrets.map((s: any) => ({
        name: s.name?.split('/').pop(),
        created: s.createTime,
        labels: s.labels,
      }));

      if (args.format === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                project: projectId,
                totalSecrets: secretList.length,
                secrets: secretList,
              }, null, 2),
            },
          ],
        };
      }

      const lines = ['🔐 Secret Manager 시크릿 목록', `프로젝트: ${projectId}`, ''];
      if (secretList.length === 0) {
        lines.push('시크릿이 없습니다.');
      } else {
        secretList.forEach((s) => {
          lines.push(`  🔑 ${s.name}`);
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
    }
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
