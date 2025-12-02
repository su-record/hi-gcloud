import { executeGcloud, getProjectId } from '../utils/exec.js';
import { formatError, getHiAiIntegrationHint } from '../utils/format.js';

export const gcpBillingInfoDefinition = {
  name: 'gcp_billing_info',
  description: '과금 정보|비용 확인|요금|billing|cost|얼마 나왔어 - GCP 프로젝트 결제 정보와 비용을 조회합니다',
  annotations: {
    title: 'GCP 결제 정보 조회',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
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
    required: [],
  },
};

interface GcpBillingInfoArgs {
  project_id?: string;
  format?: 'text' | 'json';
}

export async function gcpBillingInfo(args: GcpBillingInfoArgs) {
  try {
    const projectId = await getProjectId(args.project_id);

    // Get billing account linked to project
    const billingCommand = `billing projects describe ${projectId} --format=json`;
    let billingInfo: any = {};

    try {
      const result = await executeGcloud(billingCommand, 15000);
      billingInfo = JSON.parse(result.stdout || '{}');
    } catch (error: any) {
      // Billing API might not be enabled or no permission
      if (error.type === 'PERMISSION_DENIED') {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 결제 정보 조회 권한이 없습니다.\n\n필요한 역할: roles/billing.viewer\n\n💡 프로젝트 소유자에게 권한을 요청하거나,\nGCP Console에서 직접 확인해주세요:\nhttps://console.cloud.google.com/billing`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }

    const billingEnabled = billingInfo.billingEnabled === true;
    const billingAccountName = billingInfo.billingAccountName || 'N/A';

    // Try to get budget info if available
    let budgetInfo: any = null;
    try {
      const budgetCommand = `billing budgets list --billing-account=${billingAccountName.split('/').pop()} --format=json`;
      const budgetResult = await executeGcloud(budgetCommand, 15000);
      const budgets = JSON.parse(budgetResult.stdout || '[]');
      if (budgets.length > 0) {
        budgetInfo = budgets[0]; // Get first budget
      }
    } catch {
      // Budget API might not be enabled
    }

    const result = {
      project: projectId,
      billingEnabled,
      billingAccount: billingAccountName,
      budget: budgetInfo ? {
        displayName: budgetInfo.displayName,
        amount: budgetInfo.amount?.specifiedAmount?.currencyCode
          ? `${budgetInfo.amount.specifiedAmount.units} ${budgetInfo.amount.specifiedAmount.currencyCode}`
          : 'N/A',
      } : null,
    };

    if (args.format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    const lines = [
      '💰 GCP 결제 정보',
      '',
      `📁 프로젝트: ${projectId}`,
      `${billingEnabled ? '✅' : '❌'} 결제 활성화: ${billingEnabled ? '예' : '아니오'}`,
      `💳 결제 계정: ${billingAccountName}`,
    ];

    if (budgetInfo) {
      lines.push('', '📊 예산 정보:');
      lines.push(`  이름: ${budgetInfo.displayName || 'N/A'}`);
      if (budgetInfo.amount?.specifiedAmount) {
        lines.push(`  금액: ${budgetInfo.amount.specifiedAmount.units} ${budgetInfo.amount.specifiedAmount.currencyCode}`);
      }
    }

    lines.push(
      '',
      '💡 상세 비용 확인:',
      `  https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`,
      '',
      '📈 비용 분석:',
      '  https://console.cloud.google.com/billing/reports'
    );

    // Add tip for cost optimization
    lines.push(
      '',
      '💡 비용 절감 팁:',
      '  - Cloud Run: 최소 인스턴스 0으로 설정',
      '  - Cloud SQL: 사용하지 않을 때 중지',
      '  - Storage: 수명 주기 정책 설정',
      '  - Committed Use 할인 검토'
    );

    // hi-ai 연동 힌트 추가
    lines.push(getHiAiIntegrationHint('cost_alert'));

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
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
