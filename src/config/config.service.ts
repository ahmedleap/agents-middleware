import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

@Injectable()
export class ConfigService {
  private envConfig: Record<string, any>;
  private cachedPrivateKey: string | null = null;
  private cachedPublicKey: string | null = null;

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

  /**
   * Get JWT Private Key for signing tokens
   * Supports both base64-encoded env variables and file paths
   */
  getJwtPrivateKey(): string {
    if (this.cachedPrivateKey) {
      return this.cachedPrivateKey;
    }

    const privateKeyBase64 = this.get('JWT_PRIVATE_KEY');
    if (!privateKeyBase64) {
      throw new Error('JWT_PRIVATE_KEY is not configured');
    }

    // Decode from base64 if it looks like base64, otherwise treat as PEM
    let privateKey: string;
    try {
      // Check if it's valid base64 by attempting to decode
      if (privateKeyBase64.includes('-----BEGIN')) {
        // It's already a PEM string
        privateKey = privateKeyBase64;
      } else {
        // Try to decode from base64
        privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf-8');
      }
    } catch (error) {
      throw new Error('Failed to decode JWT_PRIVATE_KEY');
    }

    this.cachedPrivateKey = privateKey;
    return privateKey;
  }

  /**
   * Get JWT Public Key for verifying tokens
   * Supports both base64-encoded env variables and file paths
   */
  getJwtPublicKey(): string {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    const publicKeyBase64 = this.get('JWT_PUBLIC_KEY');
    if (!publicKeyBase64) {
      throw new Error('JWT_PUBLIC_KEY is not configured');
    }

    // Decode from base64 if it looks like base64, otherwise treat as PEM
    let publicKey: string;
    try {
      // Check if it's valid base64 by attempting to decode
      if (publicKeyBase64.includes('-----BEGIN')) {
        // It's already a PEM string
        publicKey = publicKeyBase64;
      } else {
        // Try to decode from base64
        publicKey = Buffer.from(publicKeyBase64, 'base64').toString('utf-8');
      }
    } catch (error) {
      throw new Error('Failed to decode JWT_PUBLIC_KEY');
    }

    this.cachedPublicKey = publicKey;
    return publicKey;
  }

  isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }
}
