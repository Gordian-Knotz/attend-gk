import { PageHeader } from "@/components/admin/page-header";
import { StubPage } from "@/components/admin/stub-page";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Organization, billing, and device configuration."
      />
      <StubPage what="Settings" />
    </div>
  );
}
