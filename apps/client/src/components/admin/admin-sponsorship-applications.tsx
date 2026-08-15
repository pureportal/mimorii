import type {
  SponsorshipApplicationStatus,
  SponsorshipApplicationsPage,
  SponsorshipApplicationSummary,
} from "@mimorii/contracts";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../page-state";
import { StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Select } from "../ui/input";
import { api, jsonBody } from "../../lib/api";
import { formatCount, formatRelative } from "../../lib/format";

const PAGE_SIZE = 50;

export function AdminSponsorshipApplications() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const applications = useInfiniteQuery({
    queryKey: ["global-admin", "sponsorship-applications", status],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({
        status,
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      return api<SponsorshipApplicationsPage>(`/admin/sponsorship-applications?${query}`);
    },
    getNextPageParam: (page) =>
      page.offset + page.limit < page.total ? page.offset + page.limit : undefined,
  });
  const rows = applications.data?.pages.flatMap((page) => page.applications) ?? [];
  const total = applications.data?.pages[0]?.total ?? 0;

  if (applications.isLoading) return <LoadingState />;
  if (applications.isError) {
    return <ErrorState retry={() => void applications.refetch()} />;
  }

  async function review(
    application: SponsorshipApplicationSummary,
    nextStatus: SponsorshipApplicationStatus
  ) {
    try {
      await api(`/admin/sponsorship-applications/${application.id}`, {
        method: "PATCH",
        ...jsonBody({ status: nextStatus, expectedStatus: application.status }),
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["global-admin", "sponsorship-applications"],
        }),
        queryClient.invalidateQueries({ queryKey: ["global-admin", "statistics"] }),
      ]);
      toast.success("Application updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Application could not be updated");
    }
  }

  return (
    <Card>
      <CardHeader className="items-end">
        <div>
          <h3 className="font-display font-bold">Applications</h3>
          <p className="mt-1 text-xs text-muted">{formatCount(total, "application")}</p>
        </div>
        <Select
          aria-label="Application status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-36"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="all">All</option>
        </Select>
      </CardHeader>
      <CardContent className="divide-y divide-line">
        {rows.map((application) => (
          <div
            key={application.id}
            className="grid gap-4 py-5 first:pt-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{application.organizationName}</p>
                <StatusBadge status={application.status} />
                <span className="text-xs capitalize text-muted">{application.tier}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {application.contactName} · {application.email} ·{" "}
                {formatRelative(application.submittedAt)}
              </p>
              {application.websiteUrl ? (
                <a
                  href={application.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-xs font-semibold text-violet-strong"
                >
                  {application.websiteUrl}
                </a>
              ) : null}
              {application.message ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{application.message}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {application.status !== "approved" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void review(application, "approved")}
                >
                  Approve
                </Button>
              ) : null}
              {application.status !== "declined" ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void review(application, "declined")}
                >
                  Decline
                </Button>
              ) : null}
              {application.status !== "pending" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void review(application, "pending")}
                >
                  Reopen
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {!rows.length ? <EmptyState title="No applications" /> : null}
      </CardContent>
      {applications.hasNextPage ? (
        <div className="flex justify-center border-t border-line p-4">
          <Button
            variant="outline"
            onClick={() => void applications.fetchNextPage()}
            disabled={applications.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
