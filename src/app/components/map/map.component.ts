import { Component, OnInit } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import { Feature } from 'ol';
import { Point, Polygon } from 'ol/geom';
import { Style, Fill, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { CemeteryService } from '../../services/cemetery.service';
import { Grave, GravePlot, Person, GeoJSONResponse, GeoJSONFeature } from '../../models/grave.model';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { defaults as defaultControls } from 'ol/control';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
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
    // Initialize layers immediately with default styles
    this.gravesLayer = new VectorLayer({
      source: this.gravesSource,
      style: new Style({
        fill: new Fill({ color: 'rgba(128, 128, 128, 0.2)' }),
        stroke: new Stroke({ color: '#666666', width: 1 })
      })
    });
    this.plotsLayer = new VectorLayer({
      source: this.plotsSource,
      style: new Style({
        fill: new Fill({ color: 'rgba(128, 128, 128, 0.2)' }),
        stroke: new Stroke({ color: '#666666', width: 1 })
      })
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
        new TileLayer({ 
          source: new OSM(),
          preload: Infinity // Preload tiles
        }),
        this.plotsLayer,
        this.gravesLayer
      ],
      view: new View({
        center: [386858, 5664073],
        zoom: 19,
        minZoom: 17,
        maxZoom: 20
      })
    });

    this.map.on('click', (event) => {
      const feature = this.map.forEachFeatureAtPixel(event.pixel, (feature) => {
        if (feature instanceof Feature) {
          return feature;
        }
        return null;
      });
      if (feature) {
        this.selectedFeature = feature;
      }
    });
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
    console.log('Starting to load data...');
    this.isLoading = true;
    this.error = null;

    // Create default styles once
    const expiredGraveStyle = new Style({
      fill: new Fill({ color: 'rgba(255, 0, 0, 0.4)' }),
      stroke: new Stroke({ color: 'darkred', width: 2 })
    });

    const occupiedPlotStyle = new Style({
      fill: new Fill({ color: 'rgba(0, 255, 0, 0.4)' }),
      stroke: new Stroke({ color: 'darkgreen', width: 2 })
    });

    forkJoin({
      graves: this.cemeteryService.getGraves(),
      plots: this.cemeteryService.getGravePlots()
    }).subscribe({
      next: (response) => {
        console.log('Data received:', response);
        
        // Process graves
        if (response.graves.features?.length) {
          console.log(`Processing ${response.graves.features.length} graves...`);
          const features = response.graves.features
            .filter(feature => feature.geometry?.coordinates)
            .map(feature => {
              try {
                const coordinates = this.processCoordinates(feature.geometry.coordinates);

                const mapFeature = new Feature({
                  geometry: new Polygon([coordinates]),
                  properties: feature.properties
                });

                // Set style if expired
                const grave = feature.properties as Grave;
                if (new Date(grave.nutzungsfristende) < new Date()) {
                  mapFeature.setStyle(expiredGraveStyle);
                }
                // console.log('Grave feature processed:', mapFeature);

                return mapFeature;
              } catch (e) {
                console.error('Error processing grave:', e);
                return null;
              }
            })
            .filter(feature => feature !== null) as Feature[];

          this.gravesSource.addFeatures(features);
        } else {
          console.warn('No grave features found in response');
        }

        // Process plots
        if (response.plots.features?.length) {
          console.log(`Processing ${response.plots.features.length} plots...`);
          const features = response.plots.features
            .filter(feature => feature.geometry?.coordinates)
            .map(feature => {
              try {
                const coordinates = this.processCoordinates(feature.geometry.coordinates);
                console.log('Plot properties:', feature.properties);

                const mapFeature = new Feature({
                  geometry: new Polygon([coordinates]),
                  properties: feature.properties
                });

                // Set style if occupied
                const plot = feature.properties as Grave;
                console.log('Plot verstorbene:', plot.verstorbene);
                
                // Check if the plot has any deceased persons
                const hasDeceasedPersons = Array.isArray(plot.verstorbene) && plot.verstorbene.length > 0;
                
                if (hasDeceasedPersons) {
                  console.log('Setting occupied style for plot:', plot.grabId);
                  mapFeature.setStyle(occupiedPlotStyle);
                }

                return mapFeature;
              } catch (e) {
                console.error('Error processing plot:', e);
                return null;
              }
            })
            .filter(feature => feature !== null) as Feature[];

          console.log(`Adding ${features.length} plot features to map`);
          this.plotsSource.addFeatures(features);
        } else {
          console.warn('No plot features found in response');
        }

        // Fit view to features
        const extent = this.gravesSource.getExtent();
        if (extent) {
          this.map.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            maxZoom: 19,
            duration: 500 // Smooth animation
          });
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading data:', error);
        this.error = error.message || 'Failed to load cemetery data';
        this.isLoading = false;
      }
    });
  }

  // Required component methods for the template
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
