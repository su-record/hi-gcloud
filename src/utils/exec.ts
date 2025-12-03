import { exec } from 'child_process';
import { promisify } from 'util';
import { readConfig } from './config.js';

const execAsync = promisify(exec);

// Cache for discovered gcloud path
let cachedGcloudPath: string | null = null;

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface GcloudError {
  type: 'NOT_INSTALLED' | 'NOT_AUTHENTICATED' | 'NO_PROJECT' | 'PERMISSION_DENIED' | 'UNKNOWN';
  message: string;
  suggestion: string;
}

/**
 * Execute a gcloud command
 */
export async function executeGcloud(command: string, timeout = 30000): Promise<ExecResult> {
  // Use cached gcloud path if available, otherwise find it
  const gcloudPath = cachedGcloudPath || await findGcloudPath() || 'gcloud';

  try {
    const result = await execAsync(`${gcloudPath} ${command}`, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error: any) {
    const errorMessage = error.message || error.stderr || '';
    throw parseGcloudError(errorMessage);
  }
}

/**
 * Parse gcloud error messages into structured errors
 */
function parseGcloudError(errorMessage: string): GcloudError {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('command not found') || lowerError.includes('not recognized')) {
    return {
      type: 'NOT_INSTALLED',
      message: 'gcloud CLI가 설치되지 않았습니다.',
      suggestion: 'https://cloud.google.com/sdk/docs/install 에서 Google Cloud SDK를 설치해주세요.',
    };
  }

  if (lowerError.includes('not logged in') || lowerError.includes('authentication') || lowerError.includes('credentials')) {
    return {
      type: 'NOT_AUTHENTICATED',
      message: 'GCP 인증이 필요합니다.',
      suggestion: '`gcloud auth login` 명령어를 실행해주세요.',
    };
  }

  if (lowerError.includes('project') && (lowerError.includes('not set') || lowerError.includes('not specified'))) {
    return {
      type: 'NO_PROJECT',
      message: '프로젝트가 설정되지 않았습니다.',
      suggestion: 'project_id를 지정하거나 `gcloud config set project PROJECT_ID` 명령어를 실행해주세요.',
    };
  }

  if (lowerError.includes('permission denied') || lowerError.includes('403') || lowerError.includes('access denied')) {
    return {
      type: 'PERMISSION_DENIED',
      message: '권한이 없습니다.',
      suggestion: '필요한 IAM 역할이 부여되었는지 확인해주세요.',
    };
  }

  return {
    type: 'UNKNOWN',
    message: errorMessage,
    suggestion: '오류 메시지를 확인하고 다시 시도해주세요.',
  };
}

/**
 * Find gcloud CLI path (with caching)
 */
async function findGcloudPath(): Promise<string | null> {
  // Return cached path if available
  if (cachedGcloudPath) {
    return cachedGcloudPath;
  }

  try {
    // Fast path: use 'which' to find gcloud
    const result = await execAsync('which gcloud', { timeout: 500 });
    const path = result.stdout.trim();
    if (path) {
      cachedGcloudPath = path;
      return path;
    }
  } catch {
    // 'which' failed, gcloud not in PATH
  }

  return null;
}

/**
 * Check if gcloud CLI is installed and authenticated
 */
export async function checkGcloudAuth(): Promise<{ authenticated: boolean; project?: string; account?: string; error?: GcloudError }> {
  const gcloudPath = await findGcloudPath();

  if (!gcloudPath) {
    return {
      authenticated: false,
      error: {
        type: 'NOT_INSTALLED',
        message: 'gcloud CLI가 설치되지 않았습니다.',
        suggestion: 'https://cloud.google.com/sdk/docs/install 에서 Google Cloud SDK를 설치해주세요.',
      },
    };
  }

  try {
    // Check authentication status
    const authResult = await execAsync(`${gcloudPath} auth list --format="value(account)" --filter="status:ACTIVE"`, { timeout: 10000 });
    const account = authResult.stdout.trim();

    if (!account) {
      return {
        authenticated: false,
        error: {
          type: 'NOT_AUTHENTICATED',
          message: 'GCP 인증이 필요합니다.',
          suggestion: '`gcloud auth login` 명령어를 실행해주세요.',
        },
      };
    }

    // Get current project
    const projectResult = await execAsync(`${gcloudPath} config get-value project`, { timeout: 5000 });
    const project = projectResult.stdout.trim();

    return {
      authenticated: true,
      account,
      project: project || undefined,
    };
  } catch (error: any) {
    return {
      authenticated: false,
      error: parseGcloudError(error.message || ''),
    };
  }
}

/**
 * Get current project ID (priority: parameter > .hi-gcloud.json > gcloud config)
 */
export async function getProjectId(providedProjectId?: string): Promise<string> {
  // 1. Parameter takes highest priority
  if (providedProjectId) {
    return providedProjectId;
  }

  // 2. Check .hi-gcloud.json config
  const config = await readConfig();
  if (config?.project_id) {
    return config.project_id;
  }

  // 3. Fall back to gcloud config
  const gcloudPath = cachedGcloudPath || await findGcloudPath() || 'gcloud';

  try {
    const result = await execAsync(`${gcloudPath} config get-value project`, { timeout: 5000 });
    const project = result.stdout.trim();

    if (!project || project === '(unset)') {
      throw {
        type: 'NO_PROJECT',
        message: '프로젝트가 설정되지 않았습니다.',
        suggestion: '.hi-gcloud.json 파일을 생성하거나 `gcloud config set project PROJECT_ID` 명령어를 실행해주세요.',
      } as GcloudError;
    }

    return project;
  } catch (error: any) {
    if (error.type) {
      throw error;
    }
    throw parseGcloudError(error.message || '');
  }
}

/**
 * Get region (priority: parameter > .hi-gcloud.json > gcloud config)
 */
export async function getRegion(providedRegion?: string): Promise<string | undefined> {
  // 1. Parameter takes highest priority
  if (providedRegion) {
    return providedRegion;
  }

  // 2. Check .hi-gcloud.json config
  const config = await readConfig();
  if (config?.region) {
    return config.region;
  }

  // 3. Fall back to gcloud config
  const gcloudPath = cachedGcloudPath || await findGcloudPath() || 'gcloud';

  try {
    const result = await execAsync(`${gcloudPath} config get-value compute/region`, { timeout: 5000 });
    const region = result.stdout.trim();
    return region && region !== '(unset)' ? region : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse time range string to timestamp
 */
export function parseTimeRange(timeRange: string): string {
  const now = new Date();
  const match = timeRange.match(/^(\d+)([hmd])$/);

  if (!match) {
    // Default to 1 hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return oneHourAgo.toISOString();
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let milliseconds: number;
  switch (unit) {
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
    case 'm':
      milliseconds = value * 60 * 1000;
      break;
    default:
      milliseconds = 60 * 60 * 1000; // 1 hour default
  }

  const timestamp = new Date(now.getTime() - milliseconds);
  return timestamp.toISOString();
}
