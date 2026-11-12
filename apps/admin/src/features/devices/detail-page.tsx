import { useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminDeviceDto, AdminDeviceListItemDto } from "@stepwhere/types";
import {
  Battery,
  Cpu,
  Footprints,
  Link2,
  MapPin,
  Pencil,
  QrCode,
  Radio,
  Satellite,
  Shield,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAdminDevice,
  getAdminDeviceLiveTelemetry,
  listAdminChildren,
  listAdminDeviceLocationEvents,
  unbindAdminDevice,
  updateAdminDevice,
} from "@/lib/api-client";
import { formatAdminDateTimeWithSeconds } from "@/lib/date-format";
import { handleServerError } from "@/lib/handle-server-error";
import { adminQueryKeys } from "@/features/admin/query-keys";
import { CopyableId } from "@/features/admin/components/copyable-id";
import { AdminLastSeen } from "@/features/admin/components/admin-last-seen";
import { GoogleMapPanel } from "@/features/admin/components/google-map-panel";
import { RecordPageHeader } from "@/features/admin/components/record-page-header";
import { RecordPreviewLink } from "@/features/admin/components/record-preview-link";
import { RecordStat } from "@/features/admin/components/record-stat";
import { RelationshipPanel } from "@/features/admin/components/relationship-panel";
import { usePrefetchRelatedRecords } from "@/features/admin/hooks/use-prefetch-related-records";
import {
  DevicePlatformBadge,
  DeviceStatusBadge,
  GpsStateBadge,
  GsmStateBadge,
  LocationSourceBadge,
  TelemetryStateBadge,
} from "@/features/admin/components/status-badge";
import { PageBasedPagination } from "@/components/data-table";
import { Main } from "@/components/layout/main";
import {
  KeyValue,
  KeyValueList,
  MetricList,
  MetricRow,
} from "@/components/patterns/key-value";
import { LiveBadge } from "@/components/patterns/live";
import { MetaRow } from "@/components/patterns/page-header";
import { Panel } from "@/components/patterns/panel";
import { EmptyState } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventTable } from "@/components/patterns/event-table";
import { DeviceOwnershipPanel } from "./components/device-ownership-panel";
import { useLiveNow } from "@/hooks/use-live-now";
import { DeviceDialogs } from "./components/device-dialogs";
import { deriveDeviceConnectionState } from "./lib/device-connection";
import {
  LiveLastSeenCard,
  LiveDeviceConnectionBadge,
  TelemetryReliabilityCard,
} from "./components/telemetry-reliability";

const route = getRouteApi("/_authenticated/devices/$deviceId");

export function DeviceDetailPage() {
  const { deviceId } = route.useParams();
  const queryClient = useQueryClient();
  const [editingDevice, setEditingDevice] = useState<AdminDeviceDto | null>(
    null,
  );
  const [bindingDevice, setBindingDevice] = useState<AdminDeviceDto | null>(
    null,
  );
  const [qrDevice, setQrDevice] = useState<AdminDeviceDto | null>(null);
  const [pastPage, setPastPage] = useState(1);
  const [pastPageSize, setPastPageSize] = useState(20);

  const deviceQuery = useQuery({
    queryKey: adminQueryKeys.devices.detail(deviceId),
    queryFn: () => getAdminDevice(deviceId),
    refetchInterval: 30_000,
  });
  const liveTelemetryQuery = useQuery({
    queryKey: adminQueryKeys.telemetry.deviceLive(deviceId),
    queryFn: () => getAdminDeviceLiveTelemetry(deviceId),
    refetchInterval: 30_000,
  });
  const pastTelemetryQuery = useQuery({
    queryKey: adminQueryKeys.telemetry.deviceLocationEvents(deviceId, {
      page: pastPage,
      pageSize: pastPageSize,
    }),
    queryFn: () =>
      listAdminDeviceLocationEvents(deviceId, {
        page: pastPage,
        pageSize: pastPageSize,
      }),
    refetchInterval: pastPage === 1 ? 30_000 : false,
  });

  const childrenQuery = useQuery({
    queryKey: adminQueryKeys.children.list({
      page: 1,
      pageSize: 100,
      sort: "name",
      dir: "asc",
    }),
    queryFn: () =>
      listAdminChildren({
        page: 1,
        pageSize: 100,
        sort: "name",
        dir: "asc",
      }),
  });

  const unbindMutation = useMutation({
    mutationFn: (id: string) => unbindAdminDevice(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "devices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "children"] }),
      ]);
      toast.success("Device unbound.");
    },
    onError: handleServerError,
  });

  const blockMutation = useMutation({
    mutationFn: (device: AdminDeviceDto) =>
      updateAdminDevice(device.id, {
        status: device.status === "blocked" ? "inactive" : "blocked",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "devices"] });
    },
    onError: handleServerError,
  });

  const device = deviceQuery.data;
  const liveTelemetry = liveTelemetryQuery.data;
  const telemetryMetrics = useMemo(
    () => [
      {
        icon: MapPin,
        label: "Last resolved location",
        value: (
          <div className="flex flex-wrap items-center gap-2">
            <LocationSourceBadge
              source={liveTelemetry?.location.source ?? null}
            />
            {liveTelemetry?.location.source && liveTelemetry.location.label
              ? liveTelemetry.location.label
              : null}
          </div>
        ),
        meta:
          liveTelemetry?.location.source &&
          liveTelemetry.location.latitude != null &&
          liveTelemetry.location.longitude != null ? (
            <span className="space-y-1">
              <span className="block font-mono tabular-nums">
                {liveTelemetry.location.latitude.toFixed(6)},{" "}
                {liveTelemetry.location.longitude.toFixed(6)}
              </span>
              <span className="block">
                {liveTelemetry.location.accuracyMeters != null
                  ? `±${liveTelemetry.location.accuracyMeters} m · `
                  : ""}
                Observed{" "}
                {formatAdminDateTimeWithSeconds(
                  liveTelemetry.location.occurredAt,
                )}
              </span>
            </span>
          ) : (
            "No coordinates"
          ),
      },
      {
        icon: Battery,
        label: "Battery",
        value:
          liveTelemetry?.battery.percent != null
            ? `${liveTelemetry.battery.percent}%`
            : "Unknown",
        meta:
          liveTelemetry?.battery.voltageMv != null
            ? `${liveTelemetry.battery.voltageMv} mV`
            : "No voltage",
      },
      {
        icon: Radio,
        label: "Signal",
        value:
          liveTelemetry?.signal.strength != null
            ? `${liveTelemetry.signal.strength} / 5`
            : "Unknown",
        meta:
          liveTelemetry?.signal.satelliteCount != null
            ? `${liveTelemetry.signal.satelliteCount} satellites`
            : "No satellite count",
      },
      {
        icon: Footprints,
        label: "Steps",
        value:
          liveTelemetry?.motion.stepCounter != null
            ? String(liveTelemetry.motion.stepCounter)
            : "Unknown",
        meta: `${liveTelemetry?.motion.stepsThisHour ?? 0} steps this hour`,
      },
      {
        icon: Shield,
        label: "Tracking",
        value: liveTelemetry?.state.trackingStatus ?? "Unknown",
        meta: (
          <>
            Last packet{" "}
            <AdminLastSeen value={liveTelemetry?.state.lastSeenAt} />
          </>
        ),
      },
      {
        icon: Satellite,
        label: "Device state",
        value: liveTelemetry?.state.deviceState ?? "Unknown",
        meta: formatAdminDateTimeWithSeconds(
          liveTelemetry?.location.ingestedAt,
        ),
      },
      {
        icon: Radio,
        label: "GSM connection",
        value: liveTelemetry?.state.gsmState ?? "Unknown",
        meta: (
          <>
            Last packet{" "}
            <AdminLastSeen value={liveTelemetry?.state.lastSeenAt} />
          </>
        ),
      },
      {
        icon: Satellite,
        label: "GPS connection",
        value: liveTelemetry?.state.gpsState ?? "Unknown",
        meta: liveTelemetry?.state.lastGpsFixAt ? (
          <>
            Last fix <AdminLastSeen value={liveTelemetry.state.lastGpsFixAt} />
          </>
        ) : (
          "No GPS fix recorded"
        ),
      },
    ],
    [liveTelemetry],
  );

  usePrefetchRelatedRecords([
    { type: "child" as const, id: device?.activeBinding?.childId },
  ]);

  return (
    <>
      <Main>
        <RecordPageHeader
          backTo="/devices"
          title={device?.displayName ?? device?.hardwareIdentifier ?? "Device"}
          icon={<Cpu />}
          meta={
            device ? (
              <>
                <LiveDeviceConnectionBadge device={device} />
                <DeviceLiveBadge device={device} />
              </>
            ) : null
          }
          description={
            device ? (
              <MetaRow>
                {[
                  <span key="hw" className="font-mono">
                    {device.hardwareIdentifier}
                  </span>,
                  device.activeBinding ? (
                    <span key="child">
                      Bound to {device.activeBinding.childName}
                    </span>
                  ) : (
                    <span key="child">Unbound</span>
                  ),
                  <span key="platform" className="capitalize">
                    {device.platform}
                  </span>,
                ]}
              </MetaRow>
            ) : (
              "Identity, telemetry, QR labels and active child relationship."
            )
          }
          onRefresh={() => {
            void deviceQuery.refetch();
            void liveTelemetryQuery.refetch();
            void pastTelemetryQuery.refetch();
          }}
          refreshing={
            deviceQuery.isFetching ||
            liveTelemetryQuery.isFetching ||
            pastTelemetryQuery.isFetching
          }
          actions={
            device ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEditingDevice(device)}
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBindingDevice(device)}
                >
                  <Link2 />
                  Bind to child
                </Button>
                <Button variant="outline" onClick={() => setQrDevice(device)}>
                  <QrCode />
                  QR label
                </Button>
                <Button
                  variant={
                    device.status === "blocked" ? "outline" : "destructive"
                  }
                  onClick={() => blockMutation.mutate(device)}
                >
                  {device.status === "blocked" ? <Shield /> : <ShieldOff />}
                  {device.status === "blocked" ? "Unblock" : "Block"}
                </Button>
              </>
            ) : null
          }
        />

        {!device ? (
          <Panel>
            <EmptyState
              compact
              title={
                deviceQuery.isLoading ? "Loading device…" : "Device not found"
              }
              description={
                deviceQuery.isLoading
                  ? undefined
                  : "This device may have been removed."
              }
            />
          </Panel>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RecordStat
                label="Platform"
                value={<DevicePlatformBadge platform={device.platform} />}
              />
              <RecordStat
                label="Provisioning"
                value={<DeviceStatusBadge status={device.status} />}
              />
              <RecordStat
                label="Connection"
                value={<LiveDeviceConnectionBadge device={device} />}
              />
              <RecordStat
                label="Binding"
                value={
                  device.activeBinding ? (
                    <RecordPreviewLink
                      type="child"
                      id={device.activeBinding.childId}
                      label={device.activeBinding.childName}
                    />
                  ) : (
                    "Unbound"
                  )
                }
              />
              <LiveLastSeenCard device={device} />
              <TelemetryReliabilityCard device={device} />
            </div>

            <Tabs defaultValue="live" className="gap-4">
              <TabsList variant="line">
                <TabsTrigger value="live">Live telemetry</TabsTrigger>
                <TabsTrigger value="details">Device details</TabsTrigger>
                <TabsTrigger value="history" className="group">
                  Past telemetry
                  {pastTelemetryQuery.data?.total ? (
                    <span className="rounded-full bg-white/6 px-1.5 text-2xs text-ink-3 tabular-nums group-data-[state=active]:bg-here-wash group-data-[state=active]:text-here">
                      {pastTelemetryQuery.data.total.toLocaleString()}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.9fr)]">
                  <RelationshipPanel title="Device identity">
                    <KeyValueList columns={2}>
                      <KeyValue
                        label="Hardware ID"
                        value={
                          <CopyableId
                            value={device.hardwareIdentifier}
                            copyLabel="hardware ID"
                          />
                        }
                      />
                      <KeyValue
                        label="Device ID"
                        value={
                          <CopyableId value={device.id} copyLabel="device ID" />
                        }
                      />
                      <KeyValue
                        label="Display name"
                        value={device.displayName ?? "No label"}
                      />
                      <KeyValue
                        label="Platform"
                        value={
                          <DevicePlatformBadge platform={device.platform} />
                        }
                      />
                      <KeyValue
                        label="Provisioning"
                        value={<DeviceStatusBadge status={device.status} />}
                      />
                    </KeyValueList>
                  </RelationshipPanel>

                  <RelationshipPanel title="Active child relationship">
                    {device.activeBinding ? (
                      <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="label-caps">Bound child</span>
                          <RecordPreviewLink
                            type="child"
                            id={device.activeBinding.childId}
                            label={device.activeBinding.childName}
                          />
                        </div>
                        <div className="text-ink-3">
                          Bound at{" "}
                          {formatAdminDateTimeWithSeconds(
                            device.activeBinding.boundAt,
                          )}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => unbindMutation.mutate(device.id)}
                        >
                          Unbind device
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <div className="text-ink-3">
                          No active child binding.
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setBindingDevice(device)}
                        >
                          Bind device
                        </Button>
                      </div>
                    )}
                  </RelationshipPanel>

                  <RelationshipPanel title="Family ownership">
                    <DeviceOwnershipPanel device={device} />
                  </RelationshipPanel>

                  <RelationshipPanel title="QR label">
                    <div className="space-y-2 text-sm">
                      <div className="text-ink-2">
                        The QR payload is the hardware identifier only.
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setQrDevice(device)}
                      >
                        Open QR tools
                      </Button>
                    </div>
                  </RelationshipPanel>

                  <RelationshipPanel title="Reservation and timestamps">
                    <KeyValueList columns={2}>
                      <KeyValue
                        label="Reserved user"
                        value={device.reservation.reservedByUserId ?? "None"}
                      />
                      <KeyValue
                        label="Reserved organization"
                        value={
                          device.reservation.reservedByOrganizationId ?? "None"
                        }
                      />
                      <KeyValue
                        label="Reserved until"
                        value={formatAdminDateTimeWithSeconds(
                          device.reservation.reservedUntil,
                        )}
                      />
                      <KeyValue
                        label="Created"
                        value={formatAdminDateTimeWithSeconds(device.createdAt)}
                      />
                      <KeyValue
                        label="Updated"
                        value={formatAdminDateTimeWithSeconds(device.updatedAt)}
                      />
                      <KeyValue
                        label="Last seen"
                        value={<AdminLastSeen value={device.lastSeenAt} />}
                      />
                    </KeyValueList>
                  </RelationshipPanel>
                </div>
              </TabsContent>

              <TabsContent value="live" className="flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(0,1.6fr)]">
                  <RelationshipPanel
                    title="Live telemetry"
                    actions={
                      liveTelemetry ? (
                        <div className="flex flex-wrap gap-1.5">
                          <GsmStateBadge state={liveTelemetry.state.gsmState} />
                          <GpsStateBadge state={liveTelemetry.state.gpsState} />
                        </div>
                      ) : null
                    }
                  >
                    <MetricList>
                      {telemetryMetrics.map((metric) => (
                        <MetricRow
                          key={metric.label}
                          icon={metric.icon}
                          label={metric.label}
                          value={metric.value}
                          meta={metric.meta}
                        />
                      ))}
                    </MetricList>
                    {liveTelemetry?.child ? (
                      <div className="border-t border-line-faint pt-3 text-sm">
                        <div className="label-caps">Linked child</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <RecordPreviewLink
                            type="child"
                            id={liveTelemetry.child.id}
                            label={liveTelemetry.child.name}
                          />
                          <TelemetryStateBadge
                            state={liveTelemetry.child.summary.telemetryState}
                          />
                        </div>
                      </div>
                    ) : null}
                  </RelationshipPanel>

                  <RelationshipPanel title="Live map">
                    <GoogleMapPanel
                      latitude={
                        liveTelemetry?.location.source
                          ? liveTelemetry.location.latitude
                          : null
                      }
                      longitude={
                        liveTelemetry?.location.source
                          ? liveTelemetry.location.longitude
                          : null
                      }
                      label={liveTelemetry?.location.label}
                      pinLabel={liveTelemetry?.child?.name?.slice(0, 1) ?? null}
                      heightClassName="h-[460px]"
                    />
                  </RelationshipPanel>
                </div>
              </TabsContent>

              <TabsContent value="history" className="flex flex-col gap-4">
                <RelationshipPanel title="Past telemetry">
                  <EventTable>
                    <thead>
                      <tr>
                        <th>Observed</th>
                        <th>Received</th>
                        <th>Child</th>
                        <th>Coordinates</th>
                        <th>Source</th>
                        <th>GPS fix</th>
                        <th>Accuracy</th>
                        <th>Location</th>
                        <th>Battery</th>
                        <th>Signal</th>
                        <th>Satellites</th>
                        <th>Steps</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pastTelemetryQuery.data?.items ?? []).map((item) => (
                        <tr key={item.id}>
                          <td className="tabular-nums">
                            {formatAdminDateTimeWithSeconds(item.occurredAt)}
                          </td>
                          <td className="tabular-nums">
                            {formatAdminDateTimeWithSeconds(item.ingestedAt)}
                          </td>
                          <td>
                            {item.child ? (
                              <RecordPreviewLink
                                type="child"
                                id={item.child.id}
                                label={item.child.name}
                              />
                            ) : (
                              "Unknown child"
                            )}
                          </td>
                          <td className="font-mono text-xs tabular-nums">
                            {item.source !== "none"
                              ? `${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}`
                              : "—"}
                          </td>
                          <td>
                            <LocationSourceBadge source={item.source} />
                          </td>
                          <td>{item.gpsConnected ? "Valid" : "No GPS fix"}</td>
                          <td className="tabular-nums">
                            {item.source !== "none" &&
                            item.accuracyMeters != null
                              ? `±${item.accuracyMeters} m`
                              : "—"}
                          </td>
                          <td>{item.locationLabel ?? "Unknown"}</td>
                          <td>
                            {item.batteryPercent != null
                              ? `${item.batteryPercent}%`
                              : "Unknown"}
                          </td>
                          <td>
                            {item.signalStrength != null
                              ? `${item.signalStrength} / 5`
                              : "Unknown"}
                          </td>
                          <td>{item.satelliteCount ?? "Unknown"}</td>
                          <td>{item.stepCounter}</td>
                          <td className="capitalize">{item.deviceState}</td>
                        </tr>
                      ))}
                    </tbody>
                  </EventTable>

                  <PageBasedPagination
                    page={pastPage}
                    pageSize={pastPageSize}
                    total={pastTelemetryQuery.data?.total ?? 0}
                    onPageChange={setPastPage}
                    onPageSizeChange={(pageSize) => {
                      setPastPage(1);
                      setPastPageSize(pageSize);
                    }}
                    className="pt-3"
                  />
                </RelationshipPanel>
              </TabsContent>
            </Tabs>
          </>
        )}
      </Main>

      <DeviceDialogs
        createOpen={false}
        onCreateOpenChange={() => {}}
        editingDevice={editingDevice}
        onEditingDeviceChange={setEditingDevice}
        bulkOpen={false}
        onBulkOpenChange={() => {}}
        bindingDevice={bindingDevice}
        onBindingDeviceChange={setBindingDevice}
        qrDevice={qrDevice}
        onQrDeviceChange={setQrDevice}
        children={childrenQuery.data?.items ?? []}
      />
    </>
  );
}

/** Shown only while the device is actually reporting, so it never contradicts the connection pill. */
function DeviceLiveBadge({ device }: { device: AdminDeviceListItemDto }) {
  const now = useLiveNow();
  return deriveDeviceConnectionState(device, now) === "connected" ? (
    <LiveBadge />
  ) : null;
}
