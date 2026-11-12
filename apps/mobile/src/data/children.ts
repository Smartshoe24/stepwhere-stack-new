export type ChildStatus = 'safe' | 'transit' | 'alert' | 'offline';
export type AvatarTone = 'mint' | 'amber' | 'blue' | 'rose';

export type Child = {
  id: string;
  name: string;
  initials: string;
  status: ChildStatus;
  statusLabel: string;
  locationLabel: string;
  lastUpdated: string;
  etaLabel: string;
  batteryText: string;
  signalStrength: 1 | 2 | 3;
  latitude: number;
  longitude: number;
  avatarTone: AvatarTone;
};

export const defaultSelectedChildId = 'aarav';

export const children: Child[] = [
  {
    id: 'aarav',
    name: 'Aarav',
    initials: 'AA',
    status: 'safe',
    statusLabel: 'School',
    locationLabel: 'Mission District',
    lastUpdated: 'just now',
    etaLabel: 'ETA',
    batteryText: 'Till 6:30PM',
    signalStrength: 3,
    latitude: 37.7749,
    longitude: -122.4194,
    avatarTone: 'mint',
  },
  {
    id: 'diya',
    name: 'Diya',
    initials: 'DI',
    status: 'transit',
    statusLabel: 'On the way',
    locationLabel: 'Market Street',
    lastUpdated: '2 min ago',
    etaLabel: '12 mins',
    batteryText: 'Till 5:45PM',
    signalStrength: 3,
    latitude: 37.7798,
    longitude: -122.4146,
    avatarTone: 'amber',
  },
  {
    id: 'kabir',
    name: 'Kabir',
    initials: 'KA',
    status: 'safe',
    statusLabel: 'Home',
    locationLabel: 'Duboce Park',
    lastUpdated: '6 min ago',
    etaLabel: 'Home',
    batteryText: 'Till 7:15PM',
    signalStrength: 2,
    latitude: 37.7689,
    longitude: -122.4294,
    avatarTone: 'blue',
  },
  {
    id: 'myra',
    name: 'Myra',
    initials: 'MY',
    status: 'alert',
    statusLabel: 'Left School',
    locationLabel: 'SoMa',
    lastUpdated: '1 min ago',
    etaLabel: 'Alert',
    batteryText: 'Till 4:50PM',
    signalStrength: 2,
    latitude: 37.7842,
    longitude: -122.4089,
    avatarTone: 'rose',
  },
];
