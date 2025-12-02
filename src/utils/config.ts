import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { checkGcloudAuth, executeGcloud } from './exec.js';

const CONFIG_FILENAME = '.hi-gcloud.json';

export interface HiGcloudConfig {
  enabled: boolean;
  project_id?: string;
  region?: string;
  account?: string;
}

export interface ConfigResult {
  exists: boolean;
  config?: HiGcloudConfig;
  path?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Get the config file path for current working directory
 */
export function getConfigPath(): string {
  return join(process.cwd(), CONFIG_FILENAME);
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return existsSync(getConfigPath());
}

/**
 * Read config from .hi-gcloud.json
 */
export function readConfig(): ConfigResult {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { exists: false, path: configPath };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as HiGcloudConfig;

    // Check if explicitly disabled
    if (config.enabled === false) {
      return {
        exists: true,
        config,
        path: configPath,
        disabled: true,
      };
    }

    // If enabled (or not explicitly disabled), project_id is required
    if (config.enabled === true && !config.project_id) {
      return {
        exists: true,
        path: configPath,
        error: 'project_id가 설정되지 않았습니다.',
      };
    }

    return { exists: true, config, path: configPath, disabled: false };
  } catch (error: any) {
    return {
      exists: true,
      path: configPath,
      error: `설정 파일 파싱 오류: ${error.message}`,
    };
  }
}

/**
 * Write config to .hi-gcloud.json
 */
export function writeConfig(config: HiGcloudConfig): { success: boolean; path: string; error?: string } {
  const configPath = getConfigPath();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return { success: true, path: configPath };
  } catch (error: any) {
    return { success: false, path: configPath, error: error.message };
  }
}

/**
 * Write disabled config
 */
export function writeDisabledConfig(): { success: boolean; path: string; error?: string } {
  return writeConfig({ enabled: false });
}

/**
 * Check if GCP is disabled for this project
 */
export function isGcpDisabled(): boolean {
  const result = readConfig();
  return result.disabled === true;
}

/**
 * Get current gcloud CLI configuration
 */
export async function getGcloudConfig(): Promise<{
  account?: string;
  project?: string;
  region?: string;
  error?: string;
}> {
  const authStatus = await checkGcloudAuth();

  if (!authStatus.authenticated) {
    return { error: authStatus.error?.message };
  }

  let region: string | undefined;
  try {
    const regionResult = await executeGcloud('config get-value compute/region', 5000);
    region = regionResult.stdout.trim();
    if (region === '(unset)') region = undefined;
  } catch {
    // Ignore
  }

  return {
    account: authStatus.account,
    project: authStatus.project,
    region,
  };
}

/**
 * Get effective configuration (from file or gcloud)
 * Returns config and whether it came from file or gcloud default
 */
export async function getEffectiveConfig(): Promise<{
  config?: HiGcloudConfig;
  source: 'file' | 'gcloud' | 'none' | 'disabled';
  needsSetup: boolean;
  setupMessage?: string;
}> {
  // First, try to read from .hi-gcloud.json
  const fileConfig = readConfig();

  // Check if explicitly disabled
  if (fileConfig.disabled) {
    return {
      config: fileConfig.config,
      source: 'disabled',
      needsSetup: false,
    };
  }

  if (fileConfig.exists && fileConfig.config && fileConfig.config.enabled !== false) {
    return {
      config: fileConfig.config,
      source: 'file',
      needsSetup: false,
    };
  }

  if (fileConfig.exists && fileConfig.error) {
    return {
      source: 'none',
      needsSetup: true,
      setupMessage: `⚠️ .hi-gcloud.json 파일 오류: ${fileConfig.error}`,
    };
  }

  // No config file, check gcloud
  const gcloudConfig = await getGcloudConfig();

  if (gcloudConfig.error) {
    return {
      source: 'none',
      needsSetup: true,
      setupMessage: generateSetupMessage(gcloudConfig),
    };
  }

  if (!gcloudConfig.project) {
    return {
      source: 'none',
      needsSetup: true,
      setupMessage: generateSetupMessage(gcloudConfig),
    };
  }

  // Return gcloud config but indicate setup is needed for persistence
  return {
    config: {
      enabled: true,
      project_id: gcloudConfig.project,
      region: gcloudConfig.region,
      account: gcloudConfig.account,
    },
    source: 'gcloud',
    needsSetup: true,
    setupMessage: generateSetupMessage(gcloudConfig),
  };
}

/**
 * Generate setup message for first-time users
 */
function generateSetupMessage(gcloudConfig: {
  account?: string;
  project?: string;
  region?: string;
}): string {
  const lines = [
    '📋 이 프로젝트에서 GCP를 사용하시나요?',
    '',
    '1️⃣  예 → gcp_setup(action: "create") 실행',
    '2️⃣  아니오 → gcp_setup(action: "disable") 실행',
    '',
  ];

  if (gcloudConfig.project) {
    lines.push('현재 gcloud 설정:');
    if (gcloudConfig.account) lines.push(`  👤 계정: ${gcloudConfig.account}`);
    lines.push(`  📁 프로젝트: ${gcloudConfig.project}`);
    if (gcloudConfig.region) lines.push(`  🌍 리전: ${gcloudConfig.region}`);
    lines.push('');
  }

  lines.push('💡 직접 설정하려면 프로젝트 루트에 .hi-gcloud.json 파일 생성:');
  lines.push('');
  lines.push('GCP 사용 시:');
  lines.push('```json');
  lines.push('{');
  lines.push('  "enabled": true,');
  lines.push('  "project_id": "your-project-id",');
  lines.push('  "region": "asia-northeast3"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('GCP 미사용 시:');
  lines.push('```json');
  lines.push('{');
  lines.push('  "enabled": false');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('⚠️ .gitignore에 .hi-gcloud.json 추가를 권장합니다.');

  return lines.join('\n');
}

/**
 * Template for .hi-gcloud.json
 */
export function getConfigTemplate(config?: Partial<HiGcloudConfig>): string {
  const template: HiGcloudConfig = {
    enabled: true,
    project_id: config?.project_id || 'your-project-id',
    region: config?.region || 'asia-northeast3',
    account: config?.account,
  };

  // Remove undefined fields
  if (!template.account) delete template.account;
  if (!template.region) delete template.region;

  return JSON.stringify(template, null, 2);
}

/**
 * Get disabled config message
 */
export function getDisabledMessage(): string {
  return '🚫 이 프로젝트에서 GCP는 비활성화되어 있습니다.\n\n활성화하려면 gcp_setup(action: "enable") 실행';
}
