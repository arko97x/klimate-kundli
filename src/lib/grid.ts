export function gridCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export function gridKey(lat: number, lon: number): string {
  return `${gridCoord(lat).toFixed(1)}:${gridCoord(lon).toFixed(1)}`;
}
