  import { Injectable } from '@angular/core';
  import { HttpClient, HttpErrorResponse } from '@angular/common/http';
  import { Observable, shareReplay, catchError, throwError } from 'rxjs';
  import { Grave, GravePlot, GeoJSONResponse } from '../models/grave.model';

  @Injectable({
    providedIn: 'root'
  })
  export class CemeteryService {
    private apiUrl = 'https://wipperfuerth.pgconnect.de/api/v1/webgis';
    private gravesCache$: Observable<GeoJSONResponse> | null = null;
    private plotsCache$: Observable<GeoJSONResponse> | null = null;

    constructor(private http: HttpClient) {}

    private handleError(error: HttpErrorResponse) {
      console.error('An error occurred:', error);
      if (error.status === 0) {
        console.error('Network error occurred:', error.error);
      } else {
        console.error(`Backend returned code ${error.status}, body was:`, error.error);
      }
      return throwError(() => new Error('Unable to fetch data. Please try again later.'));
    }

    getGraves(): Observable<GeoJSONResponse> {
      if (!this.gravesCache$) {
        console.log('Fetching graves from:', `${this.apiUrl}/grab`);
        this.gravesCache$ = this.http.get<GeoJSONResponse>(`${this.apiUrl}/grab`).pipe(
          catchError(this.handleError),
          shareReplay(1)
        );
      }
      return this.gravesCache$;
    }

    getGravePlots(): Observable<GeoJSONResponse> {
      if (!this.plotsCache$) {
        console.log('Fetching plots from:', `${this.apiUrl}/grabstelle`);
        this.plotsCache$ = this.http.get<GeoJSONResponse>(`${this.apiUrl}/grabstelle`).pipe(
          catchError(this.handleError),
          shareReplay(1)
        );
      }
      return this.plotsCache$;
    }
  }
