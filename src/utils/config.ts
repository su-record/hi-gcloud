import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface CloudSqlInstance {
  name: string;
  region: string;
  port?: number;  // 로컬 포트 (기본: 5432)
  database?: string;  // 기본 데이터베이스
}

export interface HiGcloudConfig {
  project_id?: string;
  region?: string;
  account?: string;
  cloud_sql?: CloudSqlInstance[];  // Cloud SQL 인스턴스 목록
}

const CONFIG_FILENAME = '.hi-gcloud.json';

// Cache for config to avoid repeated file reads
let cachedConfig: HiGcloudConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Read project config from .hi-gcloud.json
 * Checks common locations: cwd, home directory
 */
export async function readConfig(projectPath?: string): Promise<HiGcloudConfig | null> {
  // Check specific path first
  if (projectPath) {
    const configPath = join(projectPath, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
  }

  // Check home directory for global config
  const homeConfig = join(process.env.HOME || '', CONFIG_FILENAME);
  if (existsSync(homeConfig)) {
    if (cachedConfigPath === homeConfig && cachedConfig) {
      return cachedConfig;
    }
    try {
      const content = await readFile(homeConfig, 'utf-8');
      cachedConfig = JSON.parse(content);
      cachedConfigPath = homeConfig;
      return cachedConfig;
    } catch {
      return null;
    }
  }

  return null;
}
