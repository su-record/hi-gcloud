import { executeGcloud, getProjectId } from '../utils/exec.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const gcpSqlProxyDefinition = {
  name: 'gcp_sql_proxy',
  description: 'Cloud SQL 프록시|DB 연결|sql proxy|database connect - Cloud SQL Proxy를 실행하여 로컬에서 Cloud SQL에 연결합니다',
  annotations: {
    title: 'Cloud SQL Proxy 실행',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      instance: {
        type: 'string',
        description: 'Cloud SQL 인스턴스 이름 (예: my-instance)',
      },
      port: {
        type: 'number',
        description: '로컬 포트 (기본: 5432 for PostgreSQL, 3306 for MySQL)',
        default: 5432,
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      region: {
        type: 'string',
        description: '리전 (예: asia-northeast3)',
      },
      action: {
        type: 'string',
        enum: ['start', 'status', 'stop'],
        description: '수행할 작업 (기본: status)',
        default: 'status',
      },
    },
    required: [],
  },
};

interface SqlProxyArgs {
  instance?: string;
  port?: number;
  project_id?: string;
  region?: string;
  action?: 'start' | 'status' | 'stop';
}

// Track running proxy processes
const runningProxies: Map<string, { pid: number; port: number; instance: string }> = new Map();

export async function gcpSqlProxy(args: SqlProxyArgs) {
  const action = args.action || 'status';

  try {
    switch (action) {
      case 'status':
        return await getProxyStatus();
      case 'start':
        return await startProxy(args);
      case 'stop':
        return await stopProxy(args);
      default:
        return {
          content: [{ type: 'text', text: `알 수 없는 액션: ${action}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `오류: ${error.message || error}` }],
      isError: true,
    };
  }
}

async function getProxyStatus() {
  const lines: string[] = ['📊 Cloud SQL Proxy 상태', ''];

  // Check if cloud-sql-proxy is installed
  let proxyInstalled = false;
  let proxyPath = '';

  const possiblePaths = [
    'cloud-sql-proxy',
    'cloud_sql_proxy',
    '/usr/local/bin/cloud-sql-proxy',
    '/usr/local/bin/cloud_sql_proxy',
    `${process.env.HOME}/cloud-sql-proxy`,
    `${process.env.HOME}/google-cloud-sdk/bin/cloud-sql-proxy`,
  ];

  for (const path of possiblePaths) {
    try {
      await execAsync(`${path} --version`, { timeout: 3000 });
      proxyInstalled = true;
      proxyPath = path;
      break;
    } catch {}
  }

  if (!proxyInstalled) {
    lines.push('❌ Cloud SQL Proxy가 설치되지 않았습니다.');
    lines.push('');
    lines.push('## 설치 방법');
    lines.push('```bash');
    lines.push('# macOS');
    lines.push('curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.darwin.arm64');
    lines.push('chmod +x cloud-sql-proxy');
    lines.push('sudo mv cloud-sql-proxy /usr/local/bin/');
    lines.push('');
    lines.push('# Linux');
    lines.push('curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64');
    lines.push('chmod +x cloud-sql-proxy');
    lines.push('sudo mv cloud-sql-proxy /usr/local/bin/');
    lines.push('```');

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }

  lines.push(`✅ Cloud SQL Proxy 설치됨: ${proxyPath}`);
  lines.push('');

  // Check running proxy processes
  try {
    const { stdout } = await execAsync('ps aux | grep -E "cloud[-_]sql[-_]proxy" | grep -v grep', { timeout: 5000 });
    const processes = stdout.trim().split('\n').filter(line => line.length > 0);

    if (processes.length > 0) {
      lines.push('## 실행 중인 프록시');
      for (const proc of processes) {
        const parts = proc.split(/\s+/);
        const pid = parts[1];
        // Extract instance connection string from command
        const instanceMatch = proc.match(/([a-zA-Z0-9-]+:[a-zA-Z0-9-]+:[a-zA-Z0-9-]+)/);
        const portMatch = proc.match(/--port[= ](\d+)/) || proc.match(/:(\d+)$/);

        lines.push(`- PID: ${pid}`);
        if (instanceMatch) lines.push(`  인스턴스: ${instanceMatch[1]}`);
        if (portMatch) lines.push(`  포트: ${portMatch[1]}`);
      }
    } else {
      lines.push('실행 중인 프록시가 없습니다.');
    }
  } catch {
    lines.push('실행 중인 프록시가 없습니다.');
  }

  // List available Cloud SQL instances
  lines.push('');
  lines.push('## 사용 가능한 Cloud SQL 인스턴스');

  try {
    const result = await executeGcloud('sql instances list --format="table(name,region,databaseVersion,state)"', 15000);
    if (result.stdout.trim()) {
      lines.push('```');
      lines.push(result.stdout.trim());
      lines.push('```');
    } else {
      lines.push('사용 가능한 인스턴스가 없습니다.');
    }
  } catch (error: any) {
    lines.push(`인스턴스 목록 조회 실패: ${error.message || error}`);
  }

  lines.push('');
  lines.push('## 프록시 시작');
  lines.push('`gcp_sql_proxy(action: "start", instance: "인스턴스명", region: "리전")`');

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

async function startProxy(args: SqlProxyArgs) {
  if (!args.instance) {
    return {
      content: [{
        type: 'text',
        text: '❌ instance가 필요합니다.\n\n예: gcp_sql_proxy(action: "start", instance: "my-instance", region: "asia-northeast3")',
      }],
      isError: true,
    };
  }

  if (!args.region) {
    return {
      content: [{
        type: 'text',
        text: '❌ region이 필요합니다.\n\n예: gcp_sql_proxy(action: "start", instance: "my-instance", region: "asia-northeast3")',
      }],
      isError: true,
    };
  }

  const projectId = await getProjectId(args.project_id);
  const port = args.port || 5432;
  const connectionName = `${projectId}:${args.region}:${args.instance}`;

  // Find cloud-sql-proxy path
  let proxyPath = '';
  const possiblePaths = [
    'cloud-sql-proxy',
    'cloud_sql_proxy',
    '/usr/local/bin/cloud-sql-proxy',
    '/usr/local/bin/cloud_sql_proxy',
  ];

  for (const path of possiblePaths) {
    try {
      await execAsync(`${path} --version`, { timeout: 3000 });
      proxyPath = path;
      break;
    } catch {}
  }

  if (!proxyPath) {
    return {
      content: [{
        type: 'text',
        text: '❌ Cloud SQL Proxy가 설치되지 않았습니다.\n\ngcp_sql_proxy(action: "status")로 설치 방법을 확인하세요.',
      }],
      isError: true,
    };
  }

  // Check if port is already in use
  try {
    await execAsync(`lsof -i :${port}`, { timeout: 3000 });
    return {
      content: [{
        type: 'text',
        text: `❌ 포트 ${port}가 이미 사용 중입니다.\n\n다른 포트를 지정하세요: gcp_sql_proxy(action: "start", instance: "${args.instance}", port: ${port + 1})`,
      }],
      isError: true,
    };
  } catch {
    // Port is available
  }

  // Start proxy in background
  const proxyProcess = spawn(proxyPath, [
    connectionName,
    '--port', port.toString(),
  ], {
    detached: true,
    stdio: 'ignore',
  });

  proxyProcess.unref();

  // Wait a moment and check if it started
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Verify proxy is running
  try {
    const { stdout } = await execAsync(`lsof -i :${port}`, { timeout: 3000 });
    if (stdout.includes('cloud')) {
      return {
        content: [{
          type: 'text',
          text: `✅ Cloud SQL Proxy 시작됨

📡 연결 정보:
- 인스턴스: ${connectionName}
- 로컬 포트: ${port}
- PID: ${proxyProcess.pid}

💡 연결 예시:
\`\`\`bash
# PostgreSQL
psql -h localhost -p ${port} -U postgres -d your_database

# MySQL
mysql -h 127.0.0.1 -P ${port} -u root -p
\`\`\`

🛑 중지: gcp_sql_proxy(action: "stop")`,
        }],
      };
    }
  } catch {}

  return {
    content: [{
      type: 'text',
      text: `⚠️ 프록시 시작을 시도했지만 확인이 필요합니다.

연결 이름: ${connectionName}
포트: ${port}

gcp_sql_proxy(action: "status")로 상태를 확인하세요.`,
    }],
  };
}

async function stopProxy(args: SqlProxyArgs) {
  const lines: string[] = [];

  try {
    const { stdout } = await execAsync('ps aux | grep -E "cloud[-_]sql[-_]proxy" | grep -v grep', { timeout: 5000 });
    const processes = stdout.trim().split('\n').filter(line => line.length > 0);

    if (processes.length === 0) {
      return {
        content: [{ type: 'text', text: '실행 중인 Cloud SQL Proxy가 없습니다.' }],
      };
    }

    for (const proc of processes) {
      const parts = proc.split(/\s+/);
      const pid = parts[1];

      try {
        await execAsync(`kill ${pid}`, { timeout: 3000 });
        lines.push(`✅ PID ${pid} 종료됨`);
      } catch (error: any) {
        lines.push(`❌ PID ${pid} 종료 실패: ${error.message}`);
      }
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch {
    return {
      content: [{ type: 'text', text: '실행 중인 Cloud SQL Proxy가 없습니다.' }],
    };
  }
}
