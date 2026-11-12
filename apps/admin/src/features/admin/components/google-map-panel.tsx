import { useEffect, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * Google Maps JavaScript API panel with the Night Trail map style.
 * Needs VITE_GOOGLE_MAPS_API_KEY (a browser key restricted to the admin
 * origin). Without it the panel shows coordinates instead of a map.
 */

type LatLng = { latitude: number; longitude: number }

type GoogleMapPanelProps = {
  latitude: number | null | undefined
  longitude: number | null | undefined
  label?: string | null
  heightClassName?: string
  /** Optional path drawn with the trail gradient (oldest → newest). */
  trail?: LatLng[] | null
  /** Optional geofence ring. */
  geofence?: {
    latitude: number
    longitude: number
    radiusMeters: number
    label?: string | null
    tone?: 'ok' | 'breach'
  } | null
  /** Initials shown in the pin. */
  pinLabel?: string | null
  className?: string
}

const MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? ''

/** Night Trail basemap: near-black land, quiet roads, muted labels. */
const NIGHT_TRAIL_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0a0a0d' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6e6e78' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0d' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#1c1c22' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#0e0e12' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#0e0e12' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0b130e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#17171d' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0a0a0d' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#58585f' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#1a1a20' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#202027' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#081018' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3a4a5a' }],
  },
]

const MAP_CONTROLS = [
  { label: 'Zoom in', icon: Plus, action: 'in' },
  { label: 'Zoom out', icon: Minus, action: 'out' },
  { label: 'Recenter', icon: LocateFixed, action: 'recenter' },
] as const

const PEACH = '#F5CF8D'
const PINK = '#FF66CB'

let mapsPromise: Promise<google.maps.MapsLibrary> | null = null

function loadMaps() {
  if (!mapsPromise) {
    setOptions({ key: MAPS_API_KEY, v: 'weekly' })
    mapsPromise = importLibrary('maps') as Promise<google.maps.MapsLibrary>
  }
  return mapsPromise
}

function mixHex(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa
    .map((v, i) =>
      Math.round(v + (pb[i] - v) * t)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function GoogleMapPanel({
  latitude,
  longitude,
  label,
  heightClassName = 'h-[360px]',
  trail,
  geofence,
  pinLabel,
  className,
}: GoogleMapPanelProps) {
  const hasCoordinates =
    isFiniteCoordinate(latitude) && isFiniteCoordinate(longitude)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const overlaysRef = useRef<
    { setMap: (map: google.maps.Map | null) => void }[]
  >([])
  const pinRef = useRef<google.maps.OverlayView | null>(null)
  const [error, setError] = useState<string | null>(
    MAPS_API_KEY ? null : 'Map key not configured.'
  )
  const [ready, setReady] = useState(0)

  // Create the map once.
  useEffect(() => {
    if (!MAPS_API_KEY || !hasCoordinates || !nodeRef.current || mapRef.current)
      return
    let cancelled = false
    const win = window as Window & { gm_authFailure?: () => void }
    const previousAuthFailure = win.gm_authFailure
    win.gm_authFailure = () => setError('Google Maps rejected this key.')

    loadMaps()
      .then(({ Map }) => {
        if (cancelled || !nodeRef.current) return
        mapRef.current = new Map(nodeRef.current, {
          center: { lat: latitude, lng: longitude },
          zoom: 15,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          backgroundColor: '#0a0a0d',
          styles: NIGHT_TRAIL_MAP_STYLE,
        })
        setReady((value) => value + 1)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'Failed to load the map.'
          )
        }
      })

    return () => {
      cancelled = true
      win.gm_authFailure = previousAuthFailure
    }
    // Map is created once; later coordinate changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoordinates])

  // Draw trail, geofence and pin whenever inputs change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !hasCoordinates) return

    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []

    if (
      geofence &&
      isFiniteCoordinate(geofence.latitude) &&
      isFiniteCoordinate(geofence.longitude)
    ) {
      const colour = geofence.tone === 'breach' ? '#F87171' : '#4ADE80'
      overlaysRef.current.push(
        new google.maps.Circle({
          map,
          center: { lat: geofence.latitude, lng: geofence.longitude },
          radius: geofence.radiusMeters,
          clickable: false,
          strokeColor: colour,
          strokeOpacity: 0.55,
          strokeWeight: 1.5,
          fillColor: colour,
          fillOpacity: 0.06,
        })
      )
    }

    const path = (trail ?? []).filter(
      (point) =>
        isFiniteCoordinate(point.latitude) &&
        isFiniteCoordinate(point.longitude)
    )
    if (path.length > 1) {
      // Maps polylines can't take a gradient; split into short segments that step peach → pink.
      const steps = Math.min(path.length - 1, 24)
      const size = (path.length - 1) / steps
      for (let step = 0; step < steps; step += 1) {
        const from = Math.floor(step * size)
        const to = Math.min(path.length - 1, Math.ceil((step + 1) * size))
        overlaysRef.current.push(
          new google.maps.Polyline({
            map,
            clickable: false,
            path: path
              .slice(from, to + 1)
              .map((point) => ({ lat: point.latitude, lng: point.longitude })),
            strokeColor: mixHex(
              PEACH,
              PINK,
              steps === 1 ? 1 : step / (steps - 1)
            ),
            strokeOpacity: 0.95,
            strokeWeight: 3,
          })
        )
      }
    }

    // Pin: an HTML overlay so it can use the trail ring and breathing halo.
    pinRef.current?.setMap(null)
    const pin = new google.maps.OverlayView()
    let element: HTMLDivElement | null = null
    pin.onAdd = () => {
      element = document.createElement('div')
      element.className = 'night-trail-pin'
      element.innerHTML = `<span class="night-trail-pin__halo"></span><span class="night-trail-pin__ring"><span>${
        (pinLabel ?? '').slice(0, 2).replace(/[<>&"]/g, '') || ''
      }</span></span>`
      pin.getPanes()?.overlayMouseTarget.appendChild(element)
    }
    pin.draw = () => {
      const point = pin
        .getProjection()
        ?.fromLatLngToDivPixel(new google.maps.LatLng(latitude, longitude))
      if (element && point) {
        element.style.left = `${point.x}px`
        element.style.top = `${point.y}px`
      }
    }
    pin.onRemove = () => {
      element?.remove()
      element = null
    }
    pin.setMap(map)
    pinRef.current = pin

    map.panTo({ lat: latitude, lng: longitude })
  }, [ready, hasCoordinates, latitude, longitude, trail, geofence, pinLabel])

  useEffect(
    () => () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null))
      pinRef.current?.setMap(null)
      mapRef.current = null
    },
    []
  )

  if (!hasCoordinates) {
    return (
      <div
        className={cn(
          'grid place-items-center rounded-lg bg-[#0a0a0d] px-4 text-sm text-ink-3 shadow-[inset_0_0_0_1px_var(--line-faint)]',
          heightClassName,
          className
        )}
      >
        No location available.
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-[#0a0a0d] shadow-[inset_0_0_0_1px_var(--line-faint)]',
        heightClassName,
        className
      )}
      role='region'
      aria-label={label ? `Map: ${label}` : 'Map'}
    >
      <div ref={nodeRef} className='absolute inset-0' />

      {error ? (
        <div className='absolute inset-0 grid place-items-center p-6 text-center'>
          <div>
            <p className='text-sm font-medium text-ink'>Map unavailable</p>
            <p className='mt-1 text-xs text-ink-3'>{error}</p>
            <p className='mt-3 font-mono text-xs text-ink-2 tabular'>
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className='pointer-events-none absolute start-3 bottom-3 rounded-md bg-overlay/90 px-2.5 py-1.5 font-mono text-2xs text-ink-2 tabular shadow-[0_0_0_1px_var(--line)] backdrop-blur'>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </div>
          <div className='absolute end-3 top-3 flex flex-col rounded-md shadow-[0_0_0_1px_var(--line)]'>
            {MAP_CONTROLS.map(
              ({ label: buttonLabel, icon: Icon, action }, index) => (
                <button
                  key={buttonLabel}
                  type='button'
                  aria-label={buttonLabel}
                  onClick={() => {
                    const map = mapRef.current
                    if (!map) return
                    if (action === 'recenter')
                      map.panTo({ lat: latitude, lng: longitude })
                    else
                      map.setZoom(
                        (map.getZoom() ?? 15) + (action === 'in' ? 1 : -1)
                      )
                  }}
                  className={cn(
                    'focus-trail grid size-[30px] place-items-center bg-overlay/90 text-ink-2 backdrop-blur transition-colors hover:text-ink',
                    index === 0 && 'rounded-t-md',
                    index === 2 && 'rounded-b-md',
                    index > 0 && 'border-t border-line-faint'
                  )}
                >
                  <Icon className='size-4' />
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
