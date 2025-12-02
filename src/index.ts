#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
import { gcpSetupDefinition, gcpSetup } from './gcp/setup.js';
import { readConfig } from './utils/config.js';

// Collect all tool definitions
const tools = [
  // Setup (first for discoverability)
  gcpSetupDefinition,

  // GCP Tools
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
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const config = readConfig();

    // 설정 파일이 있고 disabled면 도구 없음
    if (config.exists && config.disabled) {
      return { tools: [] };
    }

    // 설정 없거나 enabled면 전체 도구
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // Setup
        case 'gcp_setup':
          return await gcpSetup(args as any) as CallToolResult;

        // GCP Tools
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
