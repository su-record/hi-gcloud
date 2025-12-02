import { executeGcloud, getProjectId } from '../utils/exec.js';
import { formatError } from '../utils/format.js';

export const gcpServicesListDefinition = {
  name: 'gcp_services_list',
  description: 'API 목록|활성화된 서비스|enabled APIs|services - 프로젝트에서 활성화된 API 서비스 목록을 조회합니다',
  annotations: {
    title: 'GCP API 서비스 목록',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      filter: {
        type: 'string',
        description: '서비스 이름 필터 (예: "run", "sql", "storage")',
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

interface GcpServicesListArgs {
  project_id?: string;
  filter?: string;
  format?: 'text' | 'json';
}

export async function gcpServicesList(args: GcpServicesListArgs) {
  try {
    const projectId = await getProjectId(args.project_id);

    const command = `services list --enabled --project=${projectId} --format=json`;
    const result = await executeGcloud(command, 30000);

    let services: any[] = [];
    try {
      services = JSON.parse(result.stdout || '[]');
    } catch {
      services = [];
    }

    // Extract service info
    let serviceList = services.map((s: any) => ({
      name: s.config?.name || s.name,
      title: s.config?.title,
      state: s.state,
    }));

    // Apply filter if provided
    if (args.filter) {
      const filterLower = args.filter.toLowerCase();
      serviceList = serviceList.filter((s) =>
        s.name?.toLowerCase().includes(filterLower) ||
        s.title?.toLowerCase().includes(filterLower)
      );
    }

    if (args.format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              project: projectId,
              filter: args.filter,
              totalServices: serviceList.length,
              services: serviceList,
            }, null, 2),
          },
        ],
      };
    }

    const lines = [
      '🔌 활성화된 API 서비스',
      `프로젝트: ${projectId}`,
      args.filter ? `필터: "${args.filter}"` : '',
      `총 ${serviceList.length}개`,
      '',
    ].filter(Boolean);

    if (serviceList.length === 0) {
      lines.push('활성화된 서비스가 없습니다.');
    } else {
      // Group by category
      const categories: Record<string, any[]> = {
        'Compute': [],
        'Storage': [],
        'Database': [],
        'AI/ML': [],
        'Networking': [],
        'Security': [],
        'Other': [],
      };

      serviceList.forEach((s) => {
        const name = s.name?.toLowerCase() || '';
        if (name.includes('run') || name.includes('compute') || name.includes('functions') || name.includes('appengine')) {
          categories['Compute'].push(s);
        } else if (name.includes('storage') || name.includes('firestore')) {
          categories['Storage'].push(s);
        } else if (name.includes('sql') || name.includes('spanner') || name.includes('bigtable') || name.includes('redis')) {
          categories['Database'].push(s);
        } else if (name.includes('ai') || name.includes('ml') || name.includes('vision') || name.includes('speech') || name.includes('translate') || name.includes('vertex')) {
          categories['AI/ML'].push(s);
        } else if (name.includes('vpc') || name.includes('dns') || name.includes('loadbalancing') || name.includes('network')) {
          categories['Networking'].push(s);
        } else if (name.includes('iam') || name.includes('secret') || name.includes('kms') || name.includes('security')) {
          categories['Security'].push(s);
        } else {
          categories['Other'].push(s);
        }
      });

      for (const [category, items] of Object.entries(categories)) {
        if (items.length > 0) {
          lines.push(`\n📂 ${category}:`);
          items.forEach((s) => {
            lines.push(`  ✅ ${s.name}`);
            if (s.title) {
              lines.push(`     └ ${s.title}`);
            }
          });
        }
      }
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
