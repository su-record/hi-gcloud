/**
 * Format utilities for hi-cloud output
 */

export interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
  labels?: Record<string, string>;
}

/**
 * Get severity emoji
 */
export function getSeverityEmoji(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'EMERGENCY':
    case 'ALERT':
    case 'CRITICAL':
    case 'ERROR':
      return '🔴';
    case 'WARNING':
      return '🟡';
    case 'NOTICE':
    case 'INFO':
      return '🔵';
    case 'DEBUG':
      return '⚪';
    default:
      return '⚫';
  }
}

/**
 * Format log entries for display
 */
export function formatLogEntries(logs: LogEntry[]): string {
  if (logs.length === 0) {
    return '로그가 없습니다.';
  }

  const lines = logs.map((log) => {
    const emoji = getSeverityEmoji(log.severity);
    const time = formatTimestamp(log.timestamp);
    const severity = log.severity.padEnd(8);
    const message = log.message.substring(0, 200); // Truncate long messages

    return `${emoji} [${time}] ${severity} ${message}`;
  });

  return lines.join('\n');
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return timestamp;
  }
}

/**
 * Format Cloud Run service status
 */
export function formatRunStatus(service: any): string {
  const lines: string[] = [];

  lines.push(`📦 서비스: ${service.name || 'Unknown'}`);
  lines.push(`🌐 URL: ${service.url || 'N/A'}`);
  lines.push(`📍 리전: ${service.region || 'N/A'}`);
  lines.push(`🔄 리비전: ${service.revision || 'N/A'}`);

  if (service.status) {
    const statusEmoji = service.status === 'Ready' ? '✅' : '❌';
    lines.push(`${statusEmoji} 상태: ${service.status}`);
  }

  if (service.traffic) {
    lines.push(`\n📊 트래픽 분배:`);
    service.traffic.forEach((t: any) => {
      lines.push(`  - ${t.revisionName}: ${t.percent}%`);
    });
  }

  if (service.lastDeployed) {
    lines.push(`\n🕐 마지막 배포: ${formatTimestamp(service.lastDeployed)}`);
  }

  return lines.join('\n');
}

/**
 * Format storage bucket/object list
 */
export function formatStorageList(items: any[], isBucketList: boolean): string {
  if (items.length === 0) {
    return isBucketList ? '버킷이 없습니다.' : '객체가 없습니다.';
  }

  const lines: string[] = [];

  if (isBucketList) {
    lines.push('📦 버킷 목록:');
    items.forEach((bucket) => {
      lines.push(`  📁 ${bucket.name}`);
      if (bucket.location) {
        lines.push(`     └ 위치: ${bucket.location}`);
      }
    });
  } else {
    lines.push('📄 객체 목록:');
    items.forEach((obj) => {
      const size = formatFileSize(obj.size);
      lines.push(`  📄 ${obj.name} (${size})`);
    });
  }

  return lines.join('\n');
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(2);

  return `${size} ${units[i]}`;
}

/**
 * Format SQL query result
 */
export function formatSqlResult(rows: any[], columns: string[]): string {
  if (rows.length === 0) {
    return '결과가 없습니다.';
  }

  const lines: string[] = [];
  lines.push(`📊 결과: ${rows.length}행`);
  lines.push('');

  // Simple table format
  lines.push('| ' + columns.join(' | ') + ' |');
  lines.push('|' + columns.map(() => '---').join('|') + '|');

  rows.slice(0, 100).forEach((row) => {
    const values = columns.map((col) => String(row[col] ?? 'NULL').substring(0, 50));
    lines.push('| ' + values.join(' | ') + ' |');
  });

  if (rows.length > 100) {
    lines.push(`\n... 외 ${rows.length - 100}개 행 생략`);
  }

  return lines.join('\n');
}

/**
 * Format error message for user
 */
export function formatError(error: any): string {
  if (error.type && error.suggestion) {
    return `❌ ${error.message}\n\n💡 ${error.suggestion}`;
  }

  return `❌ 오류: ${error.message || error}`;
}

/**
 * Create summary report for hi-ai integration
 */
export function createErrorReport(logs: LogEntry[]): {
  summary: string;
  errors: LogEntry[];
  hasErrors: boolean;
  hiAiHint?: string;
} {
  const errors = logs.filter((log) =>
    ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'].includes(log.severity.toUpperCase())
  );

  let summary: string;
  let hiAiHint: string | undefined;

  if (errors.length > 0) {
    summary = `🔴 ${errors.length}개의 에러가 발견되었습니다.`;
    // hi-ai 통합 힌트 - LLM이 자연스럽게 hi-ai 도구를 호출하도록 유도
    hiAiHint = getHiAiIntegrationHint('error_analysis', {
      errorCount: errors.length,
      errorTypes: [...new Set(errors.map(e => e.severity))],
    });
  } else {
    summary = '✅ 에러가 없습니다.';
  }

  return {
    summary,
    errors,
    hasErrors: errors.length > 0,
    hiAiHint,
  };
}

/**
 * hi-ai 통합 힌트 생성
 * hi-ai MCP가 설치되어 있을 경우 LLM이 자연스럽게 호출할 수 있도록 힌트 제공
 */
export function getHiAiIntegrationHint(
  context: 'error_analysis' | 'deployment_failure' | 'performance_issue' | 'cost_alert',
  data?: Record<string, any>
): string {
  const hints: Record<string, string> = {
    error_analysis: `
💡 hi-ai 연동 가능: 에러 분석이 필요하면 analyze_problem 도구로 원인을 분석하고,
   관련 코드를 찾아 수정 방안을 제시할 수 있습니다.
   메모리에 저장하면 같은 에러 재발 시 빠르게 해결할 수 있습니다.`,

    deployment_failure: `
💡 hi-ai 연동 가능: 배포 실패 원인을 step_by_step_analysis로 단계별 분석하고,
   코드 수정이 필요하면 suggest_improvements로 개선안을 받을 수 있습니다.`,

    performance_issue: `
💡 hi-ai 연동 가능: 성능 문제를 analyze_complexity로 분석하고,
   병목 지점을 찾아 최적화 방안을 제시할 수 있습니다.`,

    cost_alert: `
💡 hi-ai 연동 가능: 비용 증가 원인을 break_down_problem으로 분석하고,
   비용 절감 방안을 체계적으로 정리할 수 있습니다.`,
  };

  return hints[context] || '';
}

/**
 * 에러 로그에 대한 상세 분석 리포트 생성 (hi-ai 연동용)
 */
export function createDetailedErrorReport(logs: LogEntry[]): string {
  const report = createErrorReport(logs);

  if (!report.hasErrors) {
    return report.summary;
  }

  const lines: string[] = [report.summary, ''];

  // 에러 유형별 그룹화
  const errorsByType = new Map<string, LogEntry[]>();
  report.errors.forEach(error => {
    const type = error.severity.toUpperCase();
    if (!errorsByType.has(type)) {
      errorsByType.set(type, []);
    }
    errorsByType.get(type)!.push(error);
  });

  // 유형별 요약
  lines.push('📋 에러 요약:');
  errorsByType.forEach((errors, type) => {
    lines.push(`  ${getSeverityEmoji(type)} ${type}: ${errors.length}건`);
  });
  lines.push('');

  // 최근 에러 상세 (최대 5개)
  lines.push('🔍 최근 에러 상세:');
  report.errors.slice(0, 5).forEach((error, idx) => {
    lines.push(`  ${idx + 1}. [${formatTimestamp(error.timestamp)}] ${error.message.substring(0, 150)}`);
    if (error.resource) {
      lines.push(`     └ 리소스: ${error.resource}`);
    }
  });

  if (report.errors.length > 5) {
    lines.push(`  ... 외 ${report.errors.length - 5}건`);
  }

  // hi-ai 힌트 추가
  if (report.hiAiHint) {
    lines.push('');
    lines.push(report.hiAiHint);
  }

  return lines.join('\n');
}
