import { describe, expect, it } from "vitest";

import { imdDataRows } from "../src/resolvers/imd/resolver.js";

describe("imdDataRows", () => {
  it("reads top-level array", () => {
    const rows = imdDataRows([{ Station_Code: "1", Latitude: 1, Longitude: 2 }]);
    expect(rows).toHaveLength(1);
  });

  it("reads lowercase data wrapper", () => {
    const rows = imdDataRows({
      status: "success",
      data: [{ Station_Code: "42182", Latitude: 28.58, Longitude: 77.2 }],
    });
    expect(rows).toHaveLength(1);
  });

  it("reads Data wrapper", () => {
    const rows = imdDataRows({
      status: "success",
      Data: [{ ID: "NDL", Latitude: 28.58, Longitude: 77.2, STATION: "Delhi" }],
    });
    expect(rows).toHaveLength(1);
  });
});
