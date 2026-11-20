import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type { RoomStats } from '../types';

export class StatsModule {
  constructor(private readonly http: AxiosInstance) {}

  /** This server's run counts and top failures, read by the room wall. */
  async room(): Promise<RoomStats> {
    return unwrapResponse(await this.http.get('/stats/room'));
  }
}
