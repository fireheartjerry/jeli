// Minimal types for the one topojson-client call the map build uses.
declare module "topojson-client" {
  export function feature(topology: unknown, object: unknown): {
    type: "FeatureCollection";
    features: {
      type: "Feature";
      id?: string;
      properties: { name: string };
      geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] } | null;
    }[];
  };
}
