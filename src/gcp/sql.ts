import { executeGcloud, getProjectId } from '../utils/exec.js';
import { formatSqlResult, formatError } from '../utils/format.js';

export const gcpSqlQueryDefinition = {
  name: 'gcp_sql_query',
  description: 'Cloud SQL 쿼리|DB 조회|sql query - Cloud SQL에서 읽기 전용 쿼리를 실행합니다',
  annotations: {
    title: 'Cloud SQL 쿼리 실행',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      instance: {
        type: 'string',
        description: 'Cloud SQL 인스턴스 이름',
      },
      database: {
        type: 'string',
        description: '데이터베이스 이름',
      },
      query: {
        type: 'string',
        description: 'SELECT 쿼리 (읽기 전용만 허용)',
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: '출력 형식 (기본: text)',
        default: 'text',
      },
    },
    required: ['instance', 'database', 'query'],
  },
};

interface GcpSqlQueryArgs {
  instance: string;
  database: string;
  query: string;
  project_id?: string;
  format?: 'text' | 'json';
}

export async function gcpSqlQuery(args: GcpSqlQueryArgs) {
  try {
    const projectId = await getProjectId(args.project_id);

    // Security check: only allow SELECT queries
    const normalizedQuery = args.query.trim().toLowerCase();
    if (!normalizedQuery.startsWith('select')) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ 보안 제한: SELECT 쿼리만 허용됩니다.\n\nINSERT, UPDATE, DELETE, DROP 등의 쿼리는 실행할 수 없습니다.',
          },
        ],
        isError: true,
      };
    }

    // Check for dangerous keywords
    const dangerousKeywords = ['insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create', 'grant', 'revoke'];
    for (const keyword of dangerousKeywords) {
      if (normalizedQuery.includes(keyword)) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 보안 제한: "${keyword.toUpperCase()}" 키워드가 포함된 쿼리는 실행할 수 없습니다.`,
            },
          ],
          isError: true,
        };
      }
    }

    // Add LIMIT if not present (safety measure)
    let safeQuery = args.query.trim();
    if (!normalizedQuery.includes('limit')) {
      safeQuery += ' LIMIT 100';
    }

    // Note: Cloud SQL direct query requires Cloud SQL Proxy or gcloud sql connect
    // This implementation uses gcloud sql connect with --quiet flag
    // For production, consider using Cloud SQL Admin API

    const command = `sql connect ${args.instance} --database=${args.database} --project=${projectId} --quiet <<< "${safeQuery.replace(/"/g, '\\"')}"`;

    // This is a simplified implementation
    // Real implementation would need proper SQL connection handling
    return {
      content: [
        {
          type: 'text',
          text: `⚠️ Cloud SQL 직접 연결 기능\n\n현재 구현에서는 Cloud SQL Proxy 또는 직접 연결이 필요합니다.\n\n실행하려던 쿼리:\n${safeQuery}\n\n대안:\n1. Cloud SQL Studio 사용 (GCP Console)\n2. Cloud SQL Proxy 설정 후 로컬에서 연결\n3. gcloud sql connect ${args.instance} --database=${args.database} 명령어 직접 실행`,
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
