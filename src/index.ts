#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';

// GCP Tools
import { gcpLogsReadDefinition, gcpLogsRead } from './gcp/logs.js';
import { gcpRunStatusDefinition, gcpRunStatus } from './gcp/runStatus.js';
import { gcpRunLogsDefinition, gcpRunLogs } from './gcp/runLogs.js';
import { gcpSqlQueryDefinition, gcpSqlQuery } from './gcp/sql.js';
import { gcpStorageListDefinition, gcpStorageList } from './gcp/storage.js';
import { gcpSecretListDefinition, gcpSecretList } from './gcp/secret.js';
import { gcpAuthStatusDefinition, gcpAuthStatus } from './gcp/auth.js';
import { gcpServicesListDefinition, gcpServicesList } from './gcp/services.js';
import { gcpBillingInfoDefinition, gcpBillingInfo } from './gcp/billing.js';

// Prompts definitions
const prompts = [
  {
    name: 'debug-deployment',
    description: 'Cloud Run 배포 실패 디버깅을 도와주는 프롬프트',
    arguments: [
      {
        name: 'service',
        description: 'Cloud Run 서비스 이름',
        required: true,
      },
      {
        name: 'region',
        description: '리전 (예: asia-northeast3)',
        required: false,
      },
    ],
  },
  {
    name: 'check-errors',
    description: '최근 에러 로그를 분석하고 해결 방안을 제시하는 프롬프트',
    arguments: [
      {
        name: 'time_range',
        description: '시간 범위 (예: 1h, 6h, 24h)',
        required: false,
      },
    ],
  },
  {
    name: 'cost-review',
    description: 'GCP 비용을 분석하고 최적화 방안을 제안하는 프롬프트',
    arguments: [],
  },
];

// Resources definitions
const resources = [
  {
    uri: 'gcp://auth/status',
    name: 'GCP 인증 상태',
    description: '현재 gcloud 인증 상태 및 계정 정보',
    mimeType: 'application/json',
  },
];

// Collect all tool definitions
const tools = [
  gcpLogsReadDefinition,
  gcpRunStatusDefinition,
  gcpRunLogsDefinition,
  gcpSqlQueryDefinition,
  gcpStorageListDefinition,
  gcpSecretListDefinition,
  gcpAuthStatusDefinition,
  gcpServicesListDefinition,
  gcpBillingInfoDefinition,
];

function createServer() {
  const server = new Server(
    {
      name: 'Hi-GCloud',
      version: '0.1.2',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Prompts handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'debug-deployment':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Cloud Run 서비스 "${args?.service || 'unknown'}" 배포 문제를 디버깅해주세요.

다음 단계로 진행해주세요:
1. gcp_run_status로 서비스 상태 확인
2. gcp_run_logs로 최근 에러 로그 확인 (severity: ERROR)
3. 발견된 문제에 대한 해결 방안 제시

${args?.region ? `리전: ${args.region}` : ''}`,
              },
            },
          ],
        };

      case 'check-errors':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `GCP 프로젝트의 최근 에러 로그를 분석해주세요.

다음 단계로 진행해주세요:
1. gcp_logs_read로 에러 로그 조회 (severity=ERROR, time_range: ${args?.time_range || '1h'})
2. 에러 패턴 분석 및 그룹화
3. 각 에러에 대한 원인 분석 및 해결 방안 제시
4. 우선순위별 조치 사항 정리`,
              },
            },
          ],
        };

      case 'cost-review':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `GCP 프로젝트의 비용을 분석하고 최적화 방안을 제안해주세요.

다음 단계로 진행해주세요:
1. gcp_billing_info로 현재 결제 정보 확인
2. gcp_services_list로 활성화된 서비스 확인
3. 비용 절감 가능한 영역 분석
4. 구체적인 최적화 방안 제시`,
              },
            },
          ],
        };

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
    }
  });

  // Resources handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    switch (uri) {
      case 'gcp://auth/status':
        const authResult = await gcpAuthStatus({ format: 'json' });
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: authResult.content[0].text,
            },
          ],
        };

      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'gcp_logs_read':
          return await gcpLogsRead(args as any) as CallToolResult;
        case 'gcp_run_status':
          return await gcpRunStatus(args as any) as CallToolResult;
        case 'gcp_run_logs':
          return await gcpRunLogs(args as any) as CallToolResult;
        case 'gcp_sql_query':
          return await gcpSqlQuery(args as any) as CallToolResult;
        case 'gcp_storage_list':
          return await gcpStorageList(args as any) as CallToolResult;
        case 'gcp_secret_list':
          return await gcpSecretList(args as any) as CallToolResult;
        case 'gcp_auth_status':
          return await gcpAuthStatus(args as any) as CallToolResult;
        case 'gcp_services_list':
          return await gcpServicesList(args as any) as CallToolResult;
        case 'gcp_billing_info':
          return await gcpBillingInfo(args as any) as CallToolResult;

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  return server;
}

// Default export for Smithery platform
export default function({ sessionId, config }: { sessionId: string; config: any }) {
  return createServer();
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    if (error.message && error.message.includes('EPIPE')) {
      console.error('Connection closed by client');
      return;
    }
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  await server.connect(transport);
}

if (process.argv[1]?.includes('hi-gcloud') || process.argv[1]?.endsWith('index.js')) {
  main().catch((error) => {
    console.error('Server initialization failed:', error);
    process.exit(1);
  });
}
