import { Component, OnInit } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Style, Fill, Stroke } from 'ol/style';
import { fromLonLat, transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import { CemeteryService } from '../../services/cemetery.service';
import {
  Grave,
  GeoJSONResponse,
  Person,
} from '../../models/grave.model';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { defaults as defaultControls } from 'ol/control';
import {
  extend as extendExtent,
  createEmpty as createEmptyExtent,
} from 'ol/extent';

// Register EPSG:25832
proj4.defs(
  'EPSG:25832',
  '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs'
);
register(proj4);

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
})
export class MapComponent implements OnInit {
  private map!: Map;
  private gravesSource = new VectorSource();
  private plotsSource = new VectorSource();
  private gravesLayer: VectorLayer<VectorSource>;
  private plotsLayer: VectorLayer<VectorSource>;
  selectedFeature: Feature | null = null;
  isLoading = true;
  error: string | null = null;

  constructor(private cemeteryService: CemeteryService) {
    this.gravesLayer = new VectorLayer({
      source: this.gravesSource,
      style: new Style({
        fill: new Fill({ color: 'rgba(128, 128, 128, 0.2)' }),
        stroke: new Stroke({ color: '#666666', width: 1 }),
      }),
    });
    this.plotsLayer = new VectorLayer({
      source: this.plotsSource,
      style: new Style({
        fill: new Fill({ color: 'rgba(128, 128, 128, 0.2)' }),
        stroke: new Stroke({ color: '#666666', width: 1 }),
      }),
    });
  }

  ngOnInit(): void {
    this.initMap();
    this.loadData();
  }

  private initMap(): void {
    this.map = new Map({
      target: 'map',
      controls: defaultControls(),
      layers: [
        new TileLayer({ source: new OSM() }),
        this.plotsLayer,
        this.gravesLayer,
      ],
      view: new View({
        center: fromLonLat([7.6, 51.96]), // Center of Münster
        zoom: 17,
        minZoom: 16,
        maxZoom: 20,
      }),
    });

    this.map.on('click', (event) => {
      const feature = this.map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => feature as Feature
      );
      if (feature) {
        this.selectedFeature = feature;
      }
    });
  }

  private transformCoordinatesFrom25832To3857(coords: number[][]): number[][] {
    return coords.map((coord) =>
      transform(coord, 'EPSG:25832', 'EPSG:3857')
    );
  }

  private processCoordinates(coords: unknown): number[][] {
    if (!Array.isArray(coords)) {
      throw new Error('Coordinates must be an array');
    }

    if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
      return coords[0] as number[][];
    }
    return coords as number[][];
  }

  private loadData(): void {
    this.isLoading = true;
    this.error = null;

    const expiredGraveStyle = new Style({
      fill: new Fill({ color: 'rgba(255, 0, 0, 0.4)' }),
      stroke: new Stroke({ color: 'darkred', width: 2 }),
    });

    const occupiedPlotStyle = new Style({
      fill: new Fill({ color: 'rgba(0, 255, 0, 0.4)' }),
      stroke: new Stroke({ color: 'darkgreen', width: 2 }),
    });

    forkJoin({
      graves: this.cemeteryService.getGraves(),
      plots: this.cemeteryService.getGravePlots(),
    }).subscribe({
      next: (response) => {
        // Graves
        if (response.graves.features?.length) {
          const features = response.graves.features
            .filter((f) => f.geometry?.coordinates)
            .map((f) => {
              try {
                const coords = this.transformCoordinatesFrom25832To3857(
                  this.processCoordinates(f.geometry.coordinates)
                );
                const feat = new Feature({
                  geometry: new Polygon([coords]),
                  properties: f.properties,
                });

                const grave = f.properties as Grave;
                if (new Date(grave.nutzungsfristende) < new Date()) {
                  feat.setStyle(expiredGraveStyle);
                }
                return feat;
              } catch (e) {
                console.error('Grave error:', e);
                return null;
              }
            })
            .filter((f) => f !== null) as Feature[];

          this.gravesSource.addFeatures(features);
        }

        // Plots
        if (response.plots.features?.length) {
          const features = response.plots.features
            .filter((f) => f.geometry?.coordinates)
            .map((f) => {
              try {
                const coords = this.transformCoordinatesFrom25832To3857(
                  this.processCoordinates(f.geometry.coordinates)
                );
                const feat = new Feature({
                  geometry: new Polygon([coords]),
                  properties: f.properties,
                });

                const plot = f.properties as Grave;
                const hasDeceased =
                  Array.isArray(plot.verstorbene) &&
                  plot.verstorbene.length > 0;

                if (hasDeceased) {
                  feat.setStyle(occupiedPlotStyle);
                }
                return feat;
              } catch (e) {
                console.error('Plot error:', e);
                return null;
              }
            })
            .filter((f) => f !== null) as Feature[];

          this.plotsSource.addFeatures(features);
        }

        const combinedExtent = createEmptyExtent();
        extendExtent(combinedExtent, this.gravesSource.getExtent());
        extendExtent(combinedExtent, this.plotsSource.getExtent());

        if (combinedExtent.every(isFinite)) {
          this.map.getView().fit(combinedExtent, {
            padding: [50, 50, 50, 50],
            maxZoom: 19,
            duration: 500,
          });
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Loading error:', error);
        this.error = error.message || 'Failed to load data';
        this.isLoading = false;
      },
    });
  }

  isGrave(feature: Feature | null): boolean {
    if (!feature) return false;
    const properties = feature.get('properties');
    return properties && 'nutzungsfristende' in properties;
  }

  getExpirationDate(feature: Feature): string {
    const grave = feature.get('properties') as Grave;
    return new Date(grave.nutzungsfristende).toLocaleDateString();
  }

  getDeceasedPersons(feature: Feature): Person[] {
    const grave = feature.get('properties') as Grave;
    return grave.verstorbene || [];
  }

  closeInfoPanel(): void {
    this.selectedFeature = null;
  }
}
