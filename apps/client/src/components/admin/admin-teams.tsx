import type { GlobalAdminTeamSummary, GlobalAdminTeamsPage } from "@mimorii/contracts";
import { logDeletionGraceDays } from "@mimorii/contracts";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../page-state";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { ConfirmationDialog } from "../ui/confirmation-dialog";
import { Input, Select } from "../ui/input";
import { Switch } from "../ui/switch";
import { api, jsonBody } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatCount, formatRelative } from "../../lib/format";

const PAGE_SIZE = 20;

export function AdminTeams() {
  const queryClient = useQueryClient();
  const { session, refreshIdentity } = useAuth();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState("all");
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [disableTeam, setDisableTeam] = useState<GlobalAdminTeamSummary | null>(null);
  const teams = useInfiniteQuery({
    queryKey: ["global-admin", "teams", search, logs],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
        logs,
      });
      if (search) query.set("search", search);
      return api<GlobalAdminTeamsPage>(`/admin/teams?${query}`);
    },
    getNextPageParam: (page) =>
      page.offset + page.limit < page.total ? page.offset + page.limit : undefined,
  });

  if (teams.isLoading) return <LoadingState />;
  if (teams.isError) return <ErrorState retry={() => void teams.refetch()} />;

  const rows = teams.data?.pages.flatMap((page) => page.teams) ?? [];
  const total = teams.data?.pages[0]?.total ?? 0;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(draftSearch.trim());
  }

  async function setTeamLogs(team: GlobalAdminTeamSummary, enabled: boolean) {
    setPendingTeamId(team.id);
    try {
      await api<GlobalAdminTeamSummary>(`/admin/teams/${team.id}/logs`, {
        method: "PATCH",
        ...jsonBody({ enabled }),
      });
      await queryClient.invalidateQueries({ queryKey: ["global-admin", "teams"] });
      if (session?.teams.some((membership) => membership.id === team.id)) await refreshIdentity();
      toast.success(enabled ? `Logs enabled for ${team.name}` : `Logs disabled for ${team.name}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Logs could not be changed");
    } finally {
      setPendingTeamId(null);
      setDisableTeam(null);
    }
  }

  const deletionDate = new Date(Date.now() + logDeletionGraceDays * 86_400_000).toLocaleDateString(
    undefined,
    { dateStyle: "medium" }
  );

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row sm:items-end">
        <div>
          <h3 className="font-display font-bold">Teams</h3>
          <p className="mt-1 text-xs text-muted">{formatCount(total, "team")}</p>
        </div>
        <form
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto"
          onSubmit={submitSearch}
        >
          <Input
            aria-label="Search teams"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            maxLength={100}
            className="min-w-0 sm:w-56"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
          <Select
            aria-label="Logs"
            value={logs}
            onChange={(event) => setLogs(event.target.value)}
            className="col-span-2 w-full sm:w-40"
          >
            <option value="all">All teams</option>
            <option value="enabled">Logs enabled</option>
            <option value="disabled">Logs disabled</option>
          </Select>
        </form>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((team) => (
              <li
                key={team.id}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{team.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[team.ownerName, formatCount(team.memberCount, "member")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="text-xs text-muted">
                  Created
                  {formatRelative(team.createdAt)}
                </p>
                <p className="text-xs">
                  {team.logsDeletionScheduledAt ? (
                    <span className="text-warning-strong">
                      Logs deleted{" "}
                      {new Date(team.logsDeletionScheduledAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </span>
                  ) : team.lastLogAt ? (
                    <span className="text-muted">Last log {formatRelative(team.lastLogAt)}</span>
                  ) : null}
                </p>
                <label className="flex items-center justify-between gap-3 text-sm font-medium sm:justify-end">
                  Logs
                  <Switch
                    checked={team.logsEnabled}
                    disabled={pendingTeamId === team.id}
                    aria-label={`Logs for ${team.name}`}
                    onCheckedChange={(enabled) => {
                      if (enabled) void setTeamLogs(team, true);
                      else setDisableTeam(team);
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No teams" />
        )}
      </CardContent>
      {teams.hasNextPage ? (
        <div className="flex justify-center border-t border-line p-4">
          <Button
            variant="outline"
            onClick={() => void teams.fetchNextPage()}
            disabled={teams.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
      <ConfirmationDialog
        open={Boolean(disableTeam)}
        onOpenChange={(open) => {
          if (!open) setDisableTeam(null);
        }}
        title={`Disable logs for ${disableTeam?.name ?? "this team"}?`}
        description={`Stored logs are deleted on ${deletionDate} unless logs are enabled again before then.`}
        confirmLabel="Disable logs"
        pending={Boolean(disableTeam && pendingTeamId === disableTeam.id)}
        onConfirm={() => {
          if (disableTeam) void setTeamLogs(disableTeam, false);
        }}
      />
    </Card>
  );
}
