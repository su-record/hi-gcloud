import { readConfig } from './dist/utils/config.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

const CONFIG_FILE = '.hi-gcloud.json';

console.log('=== Hi-GCloud 도구 로딩 테스트 ===\n');

// 테스트 1: 설정 파일 없을 때
if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE);
let config = readConfig();
console.log('테스트 1: 설정 파일 없음');
console.log('  exists:', config.exists);
console.log('  disabled:', config.disabled);
console.log('  → 결과: 전체 도구 노출\n');

// 테스트 2: enabled: true
writeFileSync(CONFIG_FILE, JSON.stringify({ enabled: true, project_id: 'test-project' }, null, 2));
config = readConfig();
console.log('테스트 2: enabled: true');
console.log('  exists:', config.exists);
console.log('  disabled:', config.disabled);
console.log('  project_id:', config.config?.project_id);
console.log('  → 결과: 전체 도구 노출\n');

// 테스트 3: enabled: false
writeFileSync(CONFIG_FILE, JSON.stringify({ enabled: false }, null, 2));
config = readConfig();
console.log('테스트 3: enabled: false');
console.log('  exists:', config.exists);
console.log('  disabled:', config.disabled);
console.log('  → 결과: 도구 0개 (완전히 숨김)\n');

// 정리
unlinkSync(CONFIG_FILE);
console.log('=== 테스트 완료 ===');
