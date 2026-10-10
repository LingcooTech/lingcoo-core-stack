import { AssetLibrary } from '@/components/storage/AssetLibrary';
import { PageContainer } from '@/components/admin/PageContainer';
export function StoragePage() {
  return (
    <PageContainer title="云存储" width="wide">
      <AssetLibrary />
    </PageContainer>
  );
}
