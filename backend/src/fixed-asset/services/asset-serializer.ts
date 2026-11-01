import { sanitizeAssetForRole } from '../../common/asset-serializer';

export function serializeAssetForRole(asset: any, role?: string): any {
  return sanitizeAssetForRole(asset, role);
}
