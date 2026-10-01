import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

@Injectable()
export class ConfigService {
  private envConfig: Record<string, any>;

  constructor() {
    this.envConfig = process.env;
  }

  get(key: string, defaultValue?: any): any {
    const value = this.envConfig[key];
    return value !== undefined ? value : defaultValue;
  }

  getNumber(key: string, defaultValue?: number): number {
    const value = this.get(key, defaultValue);
    return value ? parseInt(value, 10) : (defaultValue ?? 0);
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.get(key, defaultValue);
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' ? true : false;
  }

  isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }
}
