import type { MobileDeviceStatus } from "@mimorii/contracts";
import { formatBytes } from "../lib/format";

export function MobileDeviceStatusSummary({ status }: { status: MobileDeviceStatus }) {
  const battery = status.battery.percent == null ? "—" : `${Math.round(status.battery.percent)}%`;
  const network = status.connectivity.connected
    ? status.connectivity.transport === "vpn"
      ? "VPN"
      : capitalize(status.connectivity.transport)
    : "Offline";
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-xs sm:grid-cols-4">
      <DeviceMetric label="Battery" value={battery} />
      <DeviceMetric label="Memory available" value={formatBytes(status.memory.availableBytes)} />
      <DeviceMetric label="Storage available" value={formatBytes(status.storage.availableBytes)} />
      <DeviceMetric label="Network" value={network} />
    </dl>
  );
}

function DeviceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
