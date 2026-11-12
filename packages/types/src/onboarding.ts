import type { FamilyContextDto, FamilyDto, JoinFamilyPreviewDto } from "./family";

export type StartFamilyResponseDto = {
  family: FamilyDto;
  context: FamilyContextDto;
};

export type DeviceReservationDto = {
  deviceId: string;
  hardwareIdentifier: string;
  displayName: string | null;
  status: "fresh" | "inactive";
  reservationToken: string;
  expiresAt: string;
};

export type JoinFamilyResponseDto = {
  family: FamilyDto;
  context: FamilyContextDto;
};

export type JoinFamilyPreviewResponseDto = JoinFamilyPreviewDto;
