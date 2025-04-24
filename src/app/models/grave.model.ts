export interface Grave {
  id?: number;
  nutzungsfristende: string;
  verstorbene: Person[];
  coordinates?: number[];
  anonym: boolean;
  archiv: boolean;
  friedhof: string;
  geometrieId: string;
  grabId: string;
  grabart: string;
  grabname: string;
  grabnummer: string;
  grabstatus: string;
  grabstelle: string;
  letzteVerstorbene: string;
  ruhefristende: string;
}

export interface Person {
  vorname: string;
  nachname: string;
  beisetzungsart: string;
  zusatz: string | null;
  sterbedatum: string | null;
}

export interface GravePlot {
  id: number;
  coordinates: number[][];
  graves?: Grave[];
}

export interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[] | number[][];
  };
  properties: any;
}

export interface GeoJSONResponse {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  crs: {
    type: string;
    properties: any;
  };
}
