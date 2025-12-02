import { executeGcloud, getProjectId, parseTimeRange } from '../utils/exec.js';
import { formatLogEntries, formatError, createErrorReport, createDetailedErrorReport, LogEntry } from '../utils/format.js';

export const gcpLogsReadDefinition = {
  name: 'gcp_logs_read',
  description: '로그 조회|에러 확인|Cloud Logging|gcp logs|에러 로그 - GCP Cloud Logging에서 로그를 조회합니다',
  inputSchema: {
    type: 'object' as const,
    properties: {
      filter: {
        type: 'string',
        description: '로그 필터 (예: "severity=ERROR", "resource.type=cloud_run_revision")',
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      time_range: {
        type: 'string',
        description: '시간 범위 (예: "1h", "6h", "24h", "7d"). 기본: "1h"',
        default: '1h',
      },
      limit: {
        type: 'number',
        description: '최대 로그 수 (기본: 50, 최대: 500)',
        default: 50,
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

interface GcpLogsReadArgs {
  filter?: string;
  project_id?: string;
  time_range?: string;
  limit?: number;
  format?: 'text' | 'json';
}

export async function gcpLogsRead(args: GcpLogsReadArgs) {
  try {
    const projectId = await getProjectId(args.project_id);
    const timeRange = args.time_range || '1h';
    const limit = Math.min(args.limit || 50, 500);
    const timestamp = parseTimeRange(timeRange);

    // Build filter
    let filter = `timestamp>="${timestamp}"`;
    if (args.filter) {
      filter += ` AND ${args.filter}`;
    }

    // Execute gcloud logging read
    const command = `logging read '${filter}' --project=${projectId} --limit=${limit} --format=json`;
    const result = await executeGcloud(command, 60000);

    // Parse JSON output
    let logs: any[] = [];
    try {
      logs = JSON.parse(result.stdout || '[]');
    } catch {
      logs = [];
    }

    // Transform to LogEntry format
    const logEntries: LogEntry[] = logs.map((log: any) => ({
      timestamp: log.timestamp || log.receiveTimestamp || '',
      severity: log.severity || 'DEFAULT',
      message: log.textPayload || log.jsonPayload?.message || JSON.stringify(log.jsonPayload || {}),
      resource: log.resource?.type,
      labels: log.labels,
    }));

    // Create error report for hi-ai integration
    const errorReport = createErrorReport(logEntries);

    if (args.format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              project: projectId,
              timeRange,
              totalLogs: logEntries.length,
              ...errorReport,
              logs: logEntries,
            }, null, 2),
          },
        ],
      };
    }

    // Format text output
    const header = `📋 Cloud Logging 조회 결과\n프로젝트: ${projectId}\n시간 범위: ${timeRange}\n총 ${logEntries.length}개 로그\n`;
    const formattedLogs = formatLogEntries(logEntries);

    // 에러가 있으면 상세 리포트 (hi-ai 힌트 포함), 없으면 기본 요약
    const reportSection = errorReport.hasErrors
      ? createDetailedErrorReport(logEntries)
      : errorReport.summary;

    return {
      content: [
        {
          type: 'text',
          text: `${header}\n${reportSection}\n\n${formattedLogs}`,
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
