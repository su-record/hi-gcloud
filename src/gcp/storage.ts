import { executeGcloud, getProjectId } from '../utils/exec.js';
import { formatStorageList, formatError, formatFileSize } from '../utils/format.js';

export const gcpStorageListDefinition = {
  name: 'gcp_storage_list',
  description: 'GCS 목록|버킷 목록|스토리지|storage list - Cloud Storage 버킷/객체 목록을 조회합니다',
  annotations: {
    title: 'Cloud Storage 목록 조회',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      bucket: {
        type: 'string',
        description: '버킷 이름 (없으면 버킷 목록, 있으면 해당 버킷의 객체 목록)',
      },
      prefix: {
        type: 'string',
        description: '객체 필터링 prefix (예: "logs/")',
      },
      project_id: {
        type: 'string',
        description: 'GCP 프로젝트 ID (기본: 현재 설정된 프로젝트)',
      },
      limit: {
        type: 'number',
        description: '최대 항목 수 (기본: 50)',
        default: 50,
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

interface GcpStorageListArgs {
  bucket?: string;
  prefix?: string;
  project_id?: string;
  limit?: number;
  format?: 'text' | 'json';
}

export async function gcpStorageList(args: GcpStorageListArgs) {
  try {
    const projectId = await getProjectId(args.project_id);
    const limit = args.limit || 50;

    if (args.bucket) {
      // List objects in bucket
      let path = `gs://${args.bucket}`;
      if (args.prefix) {
        path += `/${args.prefix}`;
      }

      const command = `storage ls -l "${path}" --project=${projectId}`;
      const result = await executeGcloud(command, 30000);

      // Parse ls output
      const lines = result.stdout.trim().split('\n').filter(Boolean);
      const objects: any[] = [];

      for (const line of lines.slice(0, limit)) {
        // Format: "    SIZE  CREATED  gs://bucket/path"
        const match = line.match(/^\s*(\d+)\s+(\S+)\s+gs:\/\/(.+)$/);
        if (match) {
          objects.push({
            name: match[3].replace(`${args.bucket}/`, ''),
            size: parseInt(match[1], 10),
            created: match[2],
          });
        } else if (line.includes('gs://')) {
          // Directory-like entry
          const pathMatch = line.match(/gs:\/\/(.+)/);
          if (pathMatch) {
            objects.push({
              name: pathMatch[1].replace(`${args.bucket}/`, ''),
              size: 0,
              isDirectory: true,
            });
          }
        }
      }

      if (args.format === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                project: projectId,
                bucket: args.bucket,
                prefix: args.prefix,
                totalObjects: objects.length,
                objects,
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `📦 버킷: ${args.bucket}\n${args.prefix ? `📂 Prefix: ${args.prefix}\n` : ''}\n${formatStorageList(objects, false)}`,
          },
        ],
      };
    } else {
      // List buckets
      const command = `storage buckets list --project=${projectId} --format=json`;
      const result = await executeGcloud(command, 30000);

      let buckets: any[] = [];
      try {
        buckets = JSON.parse(result.stdout || '[]');
      } catch {
        buckets = [];
      }

      const bucketList = buckets.slice(0, limit).map((b: any) => ({
        name: b.name || b.id,
        location: b.location,
        storageClass: b.storageClass,
        created: b.timeCreated,
      }));

      if (args.format === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                project: projectId,
                totalBuckets: bucketList.length,
                buckets: bucketList,
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `프로젝트: ${projectId}\n\n${formatStorageList(bucketList, true)}`,
          },
        ],
      };
    }
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
