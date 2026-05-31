export interface ImdStationRecord {
  /** cityforecast id or AWS call sign */
  id: string;
  name: string;
  lat: number;
  lon: number;
  callSign?: string;
  state?: string;
}

export interface ImdStationMapFile {
  updatedAt: string;
  stations: ImdStationRecord[];
}

export interface ImdStationBinding {
  station: ImdStationRecord;
  distanceKm: number;
}

export interface ImdAnnualPeak {
  peakTempC: number;
  peakDate: string;
}
