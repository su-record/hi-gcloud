import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface HiGcloudConfig {
  project_id?: string;
  region?: string;
  account?: string;
}

const CONFIG_FILENAME = '.hi-gcloud.json';

/**
 * Get config file path for current working directory
 */
function getConfigPath(): string {
  return join(process.cwd(), CONFIG_FILENAME);
}

/**
 * Read project config from .hi-gcloud.json
 */
export async function readConfig(): Promise<HiGcloudConfig | null> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write project config to .hi-gcloud.json
 */
export async function writeConfig(config: HiGcloudConfig): Promise<void> {
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return existsSync(getConfigPath());
}
