import { executeGcloud, getProjectId } from '../utils/exec.js';
import { formatRunStatus, formatError } from '../utils/format.js';

export const gcpRunStatusDefinition = {
  name: 'gcp_run_status',
  description: 'Cloud Run 상태|서비스 상태|배포 상태|run status - Cloud Run 서비스 상태를 조회합니다',
  annotations: {
    title: 'Cloud Run 상태 조회',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
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

interface GcpRunStatusArgs {
  service: string;
  region?: string;
  project_id?: string;
  format?: 'text' | 'json';
}

export async function gcpRunStatus(args: GcpRunStatusArgs) {
  try {
    const projectId = await getProjectId(args.project_id);

    // Build command
    let command = `run services describe ${args.service} --project=${projectId} --format=json`;
    if (args.region) {
      command += ` --region=${args.region}`;
    }

    const result = await executeGcloud(command, 30000);

    // Parse JSON output
    let serviceInfo: any = {};
    try {
      serviceInfo = JSON.parse(result.stdout || '{}');
    } catch {
      serviceInfo = {};
    }

    // Extract relevant information
    const status = {
      name: serviceInfo.metadata?.name || args.service,
      url: serviceInfo.status?.url || 'N/A',
      region: args.region || serviceInfo.metadata?.labels?.['cloud.googleapis.com/location'] || 'N/A',
      revision: serviceInfo.status?.latestReadyRevisionName || 'N/A',
      status: serviceInfo.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'Not Ready',
      traffic: serviceInfo.status?.traffic?.map((t: any) => ({
        revisionName: t.revisionName || t.latestRevision ? 'latest' : 'unknown',
        percent: t.percent || 0,
      })) || [],
      lastDeployed: serviceInfo.metadata?.creationTimestamp || null,
      containerImage: serviceInfo.spec?.template?.spec?.containers?.[0]?.image || 'N/A',
    };

    if (args.format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              project: projectId,
              ...status,
              raw: serviceInfo,
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: formatRunStatus(status),
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
