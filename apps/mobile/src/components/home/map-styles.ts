import type { MapStyleElement } from 'react-native-maps';

export const lightMapStyle: MapStyleElement[] = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#F4F7F3' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7B8794' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#F4F7F3' }],
  },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D7E0D7' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#EAF3E7' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#DDF4E4' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6E8A73' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#DDE5DD' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#F8FAF8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D4DDD4' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#E4ECE4' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#DCEEFF' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7292AD' }],
  },
];

export const darkMapStyle: MapStyleElement[] = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#182127' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98A7B5' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#182127' }],
  },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2A3840' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#1D2B2F' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1D3426' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#88A38D' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#24313A' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#30414D' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2B3943' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#3A4C58' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#223038' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#143548' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7EA8BF' }],
  },
];
