import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis Configuration
 * Manages Redis connection for queue system
 */
class RedisConfig {
  private client: Redis | null = null;

  /**
   * Get Redis connection URL from environment
   */
  private getRedisUrl(): string {
    return (
      process.env.REDIS_URL ||
      process.env.REDIS_HOST
        ? `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
        : 'redis://localhost:6379'
    );
  }

  /**
   * Get or create Redis client
   */
  getClient(): Redis {
    if (this.client) {
      return this.client;
    }

    const redisUrl = this.getRedisUrl();
    const redisOptions: any = {};

    // Parse Redis URL if provided
    if (redisUrl.startsWith('redis://')) {
      const url = new URL(redisUrl);
      redisOptions.host = url.hostname;
      redisOptions.port = parseInt(url.port) || 6379;
      if (url.password) {
        redisOptions.password = url.password;
      }
    } else {
      // Use individual environment variables
      redisOptions.host = process.env.REDIS_HOST || 'localhost';
      redisOptions.port = parseInt(process.env.REDIS_PORT || '6379');
      if (process.env.REDIS_PASSWORD) {
        redisOptions.password = process.env.REDIS_PASSWORD;
      }
    }

    // Additional options
    redisOptions.maxRetriesPerRequest = 3;
    redisOptions.retryStrategy = (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    };

    this.client = new Redis(redisOptions);

    // Event handlers
    this.client.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
    });

    this.client.on('error', (error) => {
      console.error('[Redis] Connection error:', error.message);
    });

    this.client.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    return this.client;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  /**
   * Check if Redis is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const redisConfig = new RedisConfig();

