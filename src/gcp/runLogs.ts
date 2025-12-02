import { executeGcloud, getProjectId, parseTimeRange } from '../utils/exec.js';
import { formatLogEntries, formatError, createErrorReport, createDetailedErrorReport, getHiAiIntegrationHint, LogEntry } from '../utils/format.js';

export const gcpRunLogsDefinition = {
  name: 'gcp_run_logs',
  description: 'Cloud Run 로그|배포 로그|서비스 로그|run logs - Cloud Run 서비스 로그를 조회합니다',
  inputSchema: {
    type: 'object' as const,
    properties: {
      service: {
        type: 'string',
        description: 'Cloud Run 서비스 이름',
      },
      region: {
        type: 'string',
        description: '리전 (예: asia-northeast3). 기본: gcloud 설정값',
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      severity: {
        type: 'string',
        enum: ['ERROR', 'WARNING', 'INFO', 'DEBUG', 'ALL'],
        description: '로그 레벨 필터. 기본: ALL',
        default: 'ALL',
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
    required: ['service'],
  },
};

interface GcpRunLogsArgs {
  service: string;
  region?: string;
  project_id?: string;
  severity?: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'ALL';
  time_range?: string;
  limit?: number;
  format?: 'text' | 'json';
}

export async function gcpRunLogs(args: GcpRunLogsArgs) {
  try {
    const projectId = await getProjectId(args.project_id);
    const timeRange = args.time_range || '1h';
    const limit = Math.min(args.limit || 50, 500);
    const timestamp = parseTimeRange(timeRange);

    // Build filter for Cloud Run logs
    let filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${args.service}" AND timestamp>="${timestamp}"`;

    if (args.severity && args.severity !== 'ALL') {
      filter += ` AND severity="${args.severity}"`;
    }

    if (args.region) {
      filter += ` AND resource.labels.location="${args.region}"`;
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
      resource: log.resource?.labels?.revision_name,
      labels: log.labels,
    }));

    // Create error report
    const errorReport = createErrorReport(logEntries);

    if (args.format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              project: projectId,
              service: args.service,
              region: args.region,
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
    const header = `📋 Cloud Run 로그: ${args.service}\n프로젝트: ${projectId}\n시간 범위: ${timeRange}\n총 ${logEntries.length}개 로그\n`;
    const formattedLogs = formatLogEntries(logEntries);

    // 에러가 있으면 상세 리포트 + 배포 실패 힌트, 없으면 기본 요약
    let reportSection: string;
    if (errorReport.hasErrors) {
      reportSection = createDetailedErrorReport(logEntries);
      // Cloud Run 특화 힌트 추가 (배포 실패 가능성)
      reportSection += '\n' + getHiAiIntegrationHint('deployment_failure');
    } else {
      reportSection = errorReport.summary;
    }

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
