import { AdminSponsorshipApplications } from "./admin-sponsorship-applications";
import { AdminSponsors } from "./admin-sponsors";

export function AdminSponsorships() {
  return (
    <div className="space-y-6">
      <AdminSponsorshipApplications />
      <AdminSponsors />
    </div>
  );
}
