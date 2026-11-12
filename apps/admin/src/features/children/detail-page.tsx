import { useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Battery,
  CalendarDays,
  Footprints,
  MapPin,
  Radio,
  Satellite,
} from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  bindAdminDevice,
  getAdminChild,
  getAdminChildActivity,
  getAdminChildTrail,
  listAdminGeofences,
  listAdminChildLocationEvents,
  listAdminDevices,
  unbindAdminDevice,
  updateAdminChild,
} from "@/lib/api-client";
import {
  formatAdminDate,
  formatAdminDateTime,
  formatAdminDateTimeWithSeconds,
} from "@/lib/date-format";
import { handleServerError } from "@/lib/handle-server-error";
import { adminQueryKeys } from "@/features/admin/query-keys";
import { CopyableId } from "@/features/admin/components/copyable-id";
import { LastSeenFreshness } from "@/features/admin/components/admin-last-seen";
import { GoogleMapPanel } from "@/features/admin/components/google-map-panel";
import { RecordPageHeader } from "@/features/admin/components/record-page-header";
import { RecordPreviewLink } from "@/features/admin/components/record-preview-link";
import { RelationshipPanel } from "@/features/admin/components/relationship-panel";
import { usePrefetchRelatedRecords } from "@/features/admin/hooks/use-prefetch-related-records";
import {
  ChildLifecycleBadge,
  ChildTrackingBadge,
  DevicePlatformBadge,
  DeviceStatusBadge,
  GeofenceStatusBadge,
  GpsStateBadge,
  GsmStateBadge,
  LocationSourceBadge,
  TelemetryStateBadge,
} from "@/features/admin/components/status-badge";
import { PageBasedPagination } from "@/components/data-table";
import { Main } from "@/components/layout/main";
import {
  chartAxisProps,
  chartColors,
  chartTooltipProps,
} from "@/components/patterns/chart-theme";
import { EventTable } from "@/components/patterns/event-table";
import {
  FormField,
  KeyValue,
  KeyValueList,
  LabeledInput,
  MetricList,
  MetricRow,
} from "@/components/patterns/key-value";
import { LiveBadge } from "@/components/patterns/live";
import { Panel } from "@/components/patterns/panel";
import { EmptyState } from "@/components/patterns/states";
import { Stat, StatStrip } from "@/components/patterns/stat-strip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const route = getRouteApi("/_authenticated/children/$childId");

function defaultActivityRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return {
    period: "week" as const,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function ChildDetailPage() {
  const { childId } = route.useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [locationPage, setLocationPage] = useState(1);
  const [locationPageSize, setLocationPageSize] = useState(20);
  const [activityQuery, setActivityQuery] = useState<{
    period: "day" | "week" | "month" | "year";
    startDate: string;
    endDate: string;
    timezone: string;
  }>(defaultActivityRange);
  const [form, setForm] = useState({
    name: "",
    avatarUrl: "",
    schoolName: "",
    gender: "",
    dateOfBirth: "",
    lifecycleStatus: "active" as "active" | "archived",
  });

  const childQuery = useQuery({
    queryKey: adminQueryKeys.children.detail(childId),
    queryFn: () => getAdminChild(childId),
    refetchInterval: 30_000,
  });
  const devicesQuery = useQuery({
    queryKey: adminQueryKeys.devices.list({
      page: 1,
      pageSize: 100,
      binding: "unbound",
      sort: "hardwareIdentifier",
      dir: "asc",
    }),
    queryFn: () =>
      listAdminDevices({
        page: 1,
        pageSize: 100,
        binding: "unbound",
        sort: "hardwareIdentifier",
        dir: "asc",
      }),
  });
  const activityDataQuery = useQuery({
    queryKey: adminQueryKeys.telemetry.childActivity(childId, activityQuery),
    queryFn: () => getAdminChildActivity(childId, activityQuery),
  });
  const locationHistoryQuery = useQuery({
    queryKey: adminQueryKeys.telemetry.childLocationEvents(childId, {
      page: locationPage,
      pageSize: locationPageSize,
    }),
    queryFn: () =>
      listAdminChildLocationEvents(childId, {
        page: locationPage,
        pageSize: locationPageSize,
      }),
    refetchInterval: locationPage === 1 ? 30_000 : false,
  });
  const trailQuery = useQuery({
    queryKey: adminQueryKeys.telemetry.childTrail(childId, {
      distanceMeters: 2000,
      geometry: "roads",
    }),
    queryFn: () =>
      getAdminChildTrail(childId, {
        distanceMeters: 2000,
        geometry: "roads",
      }),
  });
  const geofenceQuery = useQuery({
    queryKey: adminQueryKeys.geofences.list({
      page: 1,
      pageSize: 1,
      childId,
    }),
    queryFn: () =>
      listAdminGeofences({
        page: 1,
        pageSize: 1,
        childId,
      }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAdminChild(childId, {
        name: form.name,
        avatarUrl: form.avatarUrl || null,
        schoolName: form.schoolName || null,
        gender: form.gender || null,
        dateOfBirth: form.dateOfBirth || null,
        lifecycleStatus: form.lifecycleStatus,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "children"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      ]);
      setEditing(false);
      toast.success("Child updated.");
    },
    onError: handleServerError,
  });

  const bindMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDeviceId) {
        throw new Error("Select a device first.");
      }

      return bindAdminDevice(selectedDeviceId, { childId });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "children"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "devices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      ]);
      setBindOpen(false);
      setSelectedDeviceId("");
      toast.success("Device bound.");
    },
    onError: handleServerError,
  });

  const unbindMutation = useMutation({
    mutationFn: (deviceId: string) => unbindAdminDevice(deviceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "children"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "devices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      ]);
      toast.success("Device unbound.");
    },
    onError: handleServerError,
  });

  const child = childQuery.data;
  const activityData = activityDataQuery.data;
  const latestLocation = locationHistoryQuery.data?.items[0] ?? null;
  const resolvedPosition = child?.summary.resolvedPosition ?? null;
  const analyticsCards = useMemo(
    () =>
      (activityData?.metrics ?? []).map((metric) => ({
        label: metric.label,
        value: metric.formattedValue,
        goal: metric.formattedGoal,
      })),
    [activityData],
  );

  const trailPath = useMemo(
    () =>
      [...(trailQuery.data?.points ?? [])].reverse().map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    [trailQuery.data?.points],
  );

  usePrefetchRelatedRecords([
    { type: "user" as const, id: child?.parent?.id },
    { type: "device" as const, id: child?.deviceLink.device?.id },
    { type: "geofence" as const, id: geofenceQuery.data?.items[0]?.id },
  ]);

  return (
    <>
      <Main>
        <RecordPageHeader
          backTo="/children"
          title={child?.name ?? "Child"}
          description="Profile, linked device, telemetry, location history and analytics."
          meta={
            child ? (
              <>
                <ChildTrackingBadge status={child.summary.status} />
                {child.summary.telemetryState === "active" ? (
                  <LiveBadge />
                ) : null}
              </>
            ) : null
          }
          onRefresh={() => {
            void childQuery.refetch();
            void activityDataQuery.refetch();
            void locationHistoryQuery.refetch();
            void trailQuery.refetch();
          }}
          refreshing={
            childQuery.isFetching ||
            activityDataQuery.isFetching ||
            locationHistoryQuery.isFetching ||
            trailQuery.isFetching
          }
          actions={
            child ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!editing) {
                      setForm({
                        name: child.name,
                        avatarUrl: child.avatarUrl ?? "",
                        schoolName: child.schoolName ?? "",
                        gender: child.gender ?? "",
                        dateOfBirth: child.dateOfBirth ?? "",
                        lifecycleStatus: child.lifecycleStatus,
                      });
                    }
                    setEditing((value) => !value);
                  }}
                >
                  {editing ? "Cancel edit" : "Edit child"}
                </Button>
                <Button variant="outline" onClick={() => setBindOpen(true)}>
                  Bind device
                </Button>
                {child.deviceLink.device?.id ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      unbindMutation.mutate(child.deviceLink.device!.id)
                    }
                  >
                    Unbind device
                  </Button>
                ) : null}
              </>
            ) : null
          }
        />

        {!child ? (
          <Panel>
            <EmptyState
              compact
              title={
                childQuery.isLoading ? "Loading child…" : "Child not found"
              }
              description={
                childQuery.isLoading
                  ? undefined
                  : "This record may have been removed."
              }
            />
          </Panel>
        ) : (
          <>
            <StatStrip>
              <Stat
                label="Lifecycle"
                value={<ChildLifecycleBadge status={child.lifecycleStatus} />}
              />
              <Stat
                label="Tracking"
                value={<ChildTrackingBadge status={child.summary.status} />}
              />
              <Stat
                label="Telemetry"
                value={
                  <TelemetryStateBadge state={child.summary.telemetryState} />
                }
              />
              <Stat
                label="Last seen"
                value={
                  <LastSeenFreshness
                    value={child.summary.lastSeenAt}
                    className="text-base"
                  />
                }
                hint={formatAdminDateTime(child.summary.lastSeenAt)}
              />
              <Stat
                label="Battery"
                value={child.summary.batteryPercent ?? "—"}
                unit={child.summary.batteryPercent != null ? "%" : undefined}
                meter={
                  child.summary.batteryPercent != null
                    ? child.summary.batteryPercent / 100
                    : null
                }
                tone={
                  child.summary.batteryPercent != null &&
                  child.summary.batteryPercent < 20
                    ? "caution"
                    : "ok"
                }
              />
            </StatStrip>

            <Tabs defaultValue="details" className="gap-4">
              <TabsList variant="line">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="activity">
                  Activity and analytics
                </TabsTrigger>
                <TabsTrigger value="history">Location history</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)]">
                  <RelationshipPanel title="Child profile">
                    {editing ? (
                      <div className="grid gap-3">
                        <LabeledInput
                          label="Name"
                          value={form.name}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, name: value }))
                          }
                        />
                        <LabeledInput
                          label="Avatar URL"
                          value={form.avatarUrl}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, avatarUrl: value }))
                          }
                        />
                        <LabeledInput
                          label="School"
                          value={form.schoolName}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, schoolName: value }))
                          }
                        />
                        <LabeledInput
                          label="Gender"
                          value={form.gender}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, gender: value }))
                          }
                        />
                        <LabeledInput
                          label="Date of birth"
                          type="date"
                          value={form.dateOfBirth}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, dateOfBirth: value }))
                          }
                        />
                        <FormField label="Lifecycle status">
                          <Select
                            value={form.lifecycleStatus}
                            onValueChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                lifecycleStatus: value as "active" | "archived",
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormField>
                        <Button
                          onClick={() => updateMutation.mutate()}
                          disabled={
                            !form.name.trim() || updateMutation.isPending
                          }
                        >
                          Save changes
                        </Button>
                      </div>
                    ) : (
                      <KeyValueList columns={2}>
                        <KeyValue label="Name" value={child.name} />
                        <KeyValue
                          label="School"
                          value={child.schoolName ?? "Not set"}
                        />
                        <KeyValue
                          label="Gender"
                          value={child.gender ?? "Not set"}
                        />
                        <KeyValue
                          label="Date of birth"
                          value={formatAdminDate(child.dateOfBirth)}
                        />
                        <KeyValue
                          label="Lifecycle"
                          value={
                            <ChildLifecycleBadge
                              status={child.lifecycleStatus}
                            />
                          }
                        />
                        <KeyValue
                          label="Child ID"
                          value={
                            <CopyableId value={child.id} copyLabel="child ID" />
                          }
                        />
                      </KeyValueList>
                    )}
                  </RelationshipPanel>

                  <RelationshipPanel title="Tracking and relationships">
                    <KeyValueList columns={2}>
                      <KeyValue
                        label="Status"
                        value={
                          <ChildTrackingBadge status={child.summary.status} />
                        }
                      />
                      <KeyValue
                        label="Telemetry state"
                        value={
                          <TelemetryStateBadge
                            state={child.summary.telemetryState}
                          />
                        }
                      />
                      <KeyValue
                        label="Connectivity"
                        value={
                          <div className="flex flex-wrap gap-2">
                            <GsmStateBadge
                              state={child.summary.connectivity.gsmState}
                            />
                            <GpsStateBadge
                              state={child.summary.connectivity.gpsState}
                            />
                          </div>
                        }
                      />
                      <KeyValue
                        label="Last GPS fix"
                        value={formatAdminDateTime(
                          child.summary.connectivity.lastGpsFixAt,
                        )}
                      />
                      <KeyValue
                        label="Location"
                        value={child.summary.locationLabel ?? "Unknown"}
                      />
                      <KeyValue
                        label="Battery"
                        value={child.summary.batteryText ?? "Unknown"}
                      />
                      <KeyValue
                        label="Signal"
                        value={child.summary.signalStrength ?? "Unknown"}
                      />
                      <KeyValue
                        label="Satellite count"
                        value={child.summary.satelliteCount ?? "Unknown"}
                      />
                      <KeyValue
                        label="Steps this hour"
                        value={child.summary.stepsThisHour}
                      />
                      <KeyValue
                        label="Steps today"
                        value={
                          child.summary.stepsTodayDate
                            ? `${child.summary.stepsToday} (${child.summary.stepsTodayDate})`
                            : child.summary.stepsToday
                        }
                      />
                      <KeyValue
                        label="Device timezone"
                        value={child.summary.deviceTimezone ?? "Unknown"}
                      />
                      <KeyValue
                        label="Parent user"
                        value={
                          child.parent ? (
                            <RecordPreviewLink
                              type="user"
                              id={child.parent.id}
                              label={child.parent.displayName}
                            />
                          ) : (
                            "No parent user"
                          )
                        }
                      />
                      <KeyValue
                        label="Device relationship"
                        value={
                          child.deviceLink.device ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <RecordPreviewLink
                                type="device"
                                id={child.deviceLink.device.id}
                                label={
                                  child.deviceLink.device.hardwareIdentifier
                                }
                              />
                              <DevicePlatformBadge
                                platform={child.deviceLink.device.platform}
                              />
                              <DeviceStatusBadge
                                status={child.deviceLink.device.status}
                              />
                            </div>
                          ) : (
                            "No active device"
                          )
                        }
                      />
                      <KeyValue
                        label="Geofence"
                        value={
                          geofenceQuery.data?.items[0] ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <RecordPreviewLink
                                type="geofence"
                                id={geofenceQuery.data.items[0].id}
                                label="Open geofence"
                              />
                              <GeofenceStatusBadge
                                status={geofenceQuery.data.items[0].status}
                              />
                            </div>
                          ) : (
                            <GeofenceStatusBadge status="unset" />
                          )
                        }
                      />
                    </KeyValueList>
                  </RelationshipPanel>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="flex flex-col gap-4">
                <RelationshipPanel title="Filters">
                  <div className="grid gap-3 md:grid-cols-4">
                    <FormField label="Period">
                      <Select
                        value={activityQuery.period}
                        onValueChange={(value) =>
                          setActivityQuery((prev) => ({
                            ...prev,
                            period: value as "day" | "week" | "month" | "year",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="week">Week</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
                          <SelectItem value="year">Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <LabeledInput
                      label="Start date"
                      type="date"
                      value={activityQuery.startDate}
                      onChange={(value) =>
                        setActivityQuery((prev) => ({
                          ...prev,
                          startDate: value,
                        }))
                      }
                    />
                    <LabeledInput
                      label="End date"
                      type="date"
                      value={activityQuery.endDate}
                      onChange={(value) =>
                        setActivityQuery((prev) => ({
                          ...prev,
                          endDate: value,
                        }))
                      }
                    />
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => void activityDataQuery.refetch()}
                      >
                        Refresh analytics
                      </Button>
                    </div>
                  </div>
                </RelationshipPanel>

                <StatStrip>
                  {analyticsCards.map((card) => (
                    <Stat
                      key={card.label}
                      label={card.label}
                      value={card.value}
                    />
                  ))}
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-2">
                  <RelationshipPanel title="Daily activity trend">
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={activityData?.series ?? []}
                          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        >
                          <CartesianGrid
                            stroke={chartColors.grid}
                            vertical={false}
                          />
                          <XAxis dataKey="label" {...chartAxisProps} />
                          <YAxis {...chartAxisProps} width={48} />
                          <Tooltip {...chartTooltipProps} />
                          <Line
                            type="monotone"
                            dataKey="steps"
                            stroke={chartColors.series[0]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{
                              r: 3,
                              fill: chartColors.series[0],
                              strokeWidth: 0,
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </RelationshipPanel>

                  <RelationshipPanel title="Hourly rhythm">
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={activityData?.rhythm ?? []}
                          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        >
                          <CartesianGrid
                            stroke={chartColors.grid}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            interval={3}
                            {...chartAxisProps}
                          />
                          <YAxis {...chartAxisProps} width={48} />
                          <Tooltip {...chartTooltipProps} />
                          <Bar
                            dataKey="steps"
                            fill={chartColors.series[1]}
                            radius={[3, 3, 0, 0]}
                            maxBarSize={18}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </RelationshipPanel>
                </div>

                <RelationshipPanel title="Hourly step counts">
                  <EventTable>
                    <thead>
                      <tr>
                        <th>Hour</th>
                        <th>Steps</th>
                        <th>Active minutes</th>
                        <th>Peak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activityData?.rhythm ?? []).map((bucket) => (
                        <tr key={bucket.hour}>
                          <td>{bucket.label}</td>
                          <td>{bucket.steps}</td>
                          <td>{bucket.activeMinutes}</td>
                          <td>{bucket.isPeak ? "Peak" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </EventTable>
                </RelationshipPanel>
              </TabsContent>

              <TabsContent value="history" className="flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.3fr)]">
                  <RelationshipPanel title="Location and latest packet">
                    <MetricList>
                      <MetricRow
                        icon={MapPin}
                        label="Last resolved location"
                        value={
                          <LocationSourceBadge
                            source={resolvedPosition?.source ?? null}
                          />
                        }
                        meta={
                          resolvedPosition ? (
                            <>
                              <span className="block font-mono tabular-nums">
                                {resolvedPosition.latitude.toFixed(6)},{" "}
                                {resolvedPosition.longitude.toFixed(6)}
                              </span>
                              <span className="block">
                                {resolvedPosition.accuracyMeters != null
                                  ? `±${resolvedPosition.accuracyMeters} m · `
                                  : ""}
                                Observed{" "}
                                {formatAdminDateTimeWithSeconds(
                                  resolvedPosition.observedAt,
                                )}
                              </span>
                            </>
                          ) : null
                        }
                      />
                      <MetricRow
                        icon={Satellite}
                        label="Latest packet GPS fix"
                        value={
                          latestLocation
                            ? latestLocation.gpsConnected
                              ? "Valid"
                              : "No GPS fix"
                            : "Unknown"
                        }
                      />
                      <MetricRow
                        icon={Battery}
                        label="Battery"
                        value={
                          latestLocation?.batteryPercent != null
                            ? `${latestLocation.batteryPercent}%`
                            : "Unknown"
                        }
                      />
                      <MetricRow
                        icon={Radio}
                        label="Signal"
                        value={
                          latestLocation?.signalStrength != null
                            ? `${latestLocation.signalStrength} / 5`
                            : "Unknown"
                        }
                      />
                      <MetricRow
                        icon={Satellite}
                        label="Satellites"
                        value={String(
                          latestLocation?.satelliteCount ?? "Unknown",
                        )}
                      />
                      <MetricRow
                        icon={Footprints}
                        label="Steps"
                        value={String(latestLocation?.stepCounter ?? "Unknown")}
                      />
                      <MetricRow
                        icon={CalendarDays}
                        label="Latest sample"
                        value={formatAdminDateTime(latestLocation?.occurredAt)}
                      />
                    </MetricList>
                  </RelationshipPanel>

                  <RelationshipPanel title="Movement map">
                    <GoogleMapPanel
                      latitude={
                        resolvedPosition?.latitude ?? child.summary.latitude
                      }
                      longitude={
                        resolvedPosition?.longitude ?? child.summary.longitude
                      }
                      label={child.summary.locationLabel}
                      trail={trailPath}
                      pinLabel={child.summary.initials}
                      heightClassName="h-[420px]"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3 tabular-nums">
                      <LocationSourceBadge
                        source={resolvedPosition?.source ?? null}
                      />
                      {resolvedPosition
                        ? `Observed ${formatAdminDateTimeWithSeconds(resolvedPosition.observedAt)}`
                        : "No resolved position yet"}
                      {` · ${trailQuery.data?.points.length ?? 0} trail points · last 2 km`}
                    </div>
                  </RelationshipPanel>
                </div>

                <RelationshipPanel title="Location events">
                  <EventTable>
                    <thead>
                      <tr>
                        <th>Occurred</th>
                        <th>Device</th>
                        <th>Coordinates</th>
                        <th>Source</th>
                        <th>GPS fix</th>
                        <th>Location</th>
                        <th>Accuracy</th>
                        <th>Steps</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(locationHistoryQuery.data?.items ?? []).map((item) => (
                        <tr key={item.id}>
                          <td>{formatAdminDateTime(item.occurredAt)}</td>
                          <td>
                            {item.device ? (
                              <RecordPreviewLink
                                type="device"
                                id={item.device.id}
                                label={item.device.hardwareIdentifier}
                              />
                            ) : (
                              "Unknown device"
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
                          <td>{item.locationLabel ?? "Unknown"}</td>
                          <td>
                            {item.source !== "none" &&
                            item.accuracyMeters != null
                              ? `±${item.accuracyMeters} m`
                              : "—"}
                          </td>
                          <td>{item.stepCounter}</td>
                          <td className="capitalize">{item.deviceState}</td>
                        </tr>
                      ))}
                    </tbody>
                  </EventTable>

                  <PageBasedPagination
                    page={locationPage}
                    pageSize={locationPageSize}
                    total={locationHistoryQuery.data?.total ?? 0}
                    onPageChange={setLocationPage}
                    onPageSizeChange={(pageSize) => {
                      setLocationPage(1);
                      setLocationPageSize(pageSize);
                    }}
                    className="pt-3"
                  />
                </RelationshipPanel>
              </TabsContent>
            </Tabs>
          </>
        )}
      </Main>

      <Dialog open={bindOpen} onOpenChange={setBindOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bind device</DialogTitle>
          </DialogHeader>
          <FormField label="Select device">
            <Select
              value={selectedDeviceId}
              onValueChange={setSelectedDeviceId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an unbound device" />
              </SelectTrigger>
              <SelectContent>
                {(devicesQuery.data?.items ?? []).map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.hardwareIdentifier}
                    {device.displayName ? ` · ${device.displayName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedDeviceId || bindMutation.isPending}
              onClick={() => bindMutation.mutate()}
            >
              Bind device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
