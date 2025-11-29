# Queue System Setup Guide

This guide explains how to set up and use the Laravel-style queue system with Redis (without Docker).

## Prerequisites

1. **Redis Server** - Must be installed and running on your system
2. **Node.js** - Already installed
3. **Packages** - Already installed (`bull`, `ioredis`)

## Installation Steps

### 1. Install Redis (if not already installed)

#### macOS (using Homebrew):
```bash
brew install redis
brew services start redis
```

#### Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Windows:
Download and install from: https://redis.io/download

Or use WSL (Windows Subsystem for Linux) and follow Ubuntu instructions.

### 2. Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

### 3. Environment Variables

Add these to your `.env` file:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Optional, leave empty if no password
# OR use Redis URL format:
# REDIS_URL=redis://localhost:6379

# Queue Configuration (Optional)
QUEUE_CONCURRENCY=1        # Number of jobs to process simultaneously
QUEUE_MAX_JOBS=10          # Max jobs per interval
QUEUE_INTERVAL=1000        # Interval in milliseconds
```

### 4. Project Structure

```
src/
├── config/
│   └── redis.config.ts          # Redis connection configuration
├── queue/
│   ├── queue.manager.ts         # Queue manager (creates/manages queues)
│   ├── worker.ts                # Worker process (processes jobs)
│   └── jobs/
│       └── billpayment.status.job.ts  # Example job processor
```

## Usage

### Starting a Worker

Workers run as **separate processes** from your main server. This means they don't affect your server performance.

#### Start worker for bill payments queue:
```bash
npm run queue:work:bill-payments
```

#### Or manually:
```bash
ts-node src/queue/worker.ts bill-payments
```

#### Start worker for default queue:
```bash
npm run queue:work
```

### Adding Jobs to Queue

In your controllers or services:

```typescript
import { queueManager } from '../queue/queue.manager';

// Add a job to the queue
await queueManager.addJob(
  'bill-payments',           // Queue name
  'check-status',            // Job name
  {                          // Job data
    billPaymentId: 'xxx',
    sceneCode: 'airtime',
    outOrderNo: 'xxx',
  },
  {
    delay: 5000,             // Optional: delay job by 5 seconds
    attempts: 3,             // Optional: retry 3 times on failure
  }
);
```

### Running Multiple Workers

You can run multiple workers in separate terminal windows:

```bash
# Terminal 1
npm run queue:work:bill-payments

# Terminal 2 (another worker for the same queue)
npm run queue:work:bill-payments

# Terminal 3 (worker for different queue)
npm run queue:work default
```

### Production Deployment

#### Using PM2 (Recommended)

Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'terescrow-api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'queue-worker-bill-payments',
      script: 'dist/queue/worker.js',
      args: 'bill-payments',
      instances: 2, // Run 2 workers
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
    },
  ],
};
```

Start with PM2:
```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # For auto-start on system reboot
```

#### Using systemd (Linux)

Create `/etc/systemd/system/terescrow-queue-worker.service`:
```ini
[Unit]
Description=TereScrow Queue Worker
After=network.target redis.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/terescrow--backend
ExecStart=/usr/bin/node dist/queue/worker.js bill-payments
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable terescrow-queue-worker
sudo systemctl start terescrow-queue-worker
```

## Queue Management

### Check Queue Statistics

```typescript
import { queueManager } from './queue/queue.manager';

const stats = await queueManager.getQueueStats('bill-payments');
console.log(stats);
// {
//   queueName: 'bill-payments',
//   waiting: 5,
//   active: 2,
//   completed: 100,
//   failed: 3,
//   delayed: 1
// }
```

### Monitoring

Use Redis CLI to monitor:
```bash
redis-cli
> KEYS bull:bill-payments:*
> LLEN bull:bill-payments:wait
> LLEN bull:bill-payments:active
```

## Available Queues

1. **bill-payments** - Processes bill payment status checks
   - Job: `check-status`
   - Data: `{ billPaymentId, sceneCode, outOrderNo?, orderNo? }`

## Adding New Queues

1. Create job processor in `src/queue/jobs/your-job.ts`
2. Register processor in `src/queue/worker.ts`
3. Add queue name to `package.json` scripts if needed
4. Use `queueManager.addJob()` to dispatch jobs

## Important Notes

- **Workers are separate processes** - They don't block your main server
- **Redis must be running** - Workers won't start without Redis
- **Multiple workers** - You can run multiple workers for the same queue for parallel processing
- **Graceful shutdown** - Workers handle SIGTERM/SIGINT for clean shutdown
- **Auto-retry** - Failed jobs are automatically retried (configurable)
- **Job persistence** - Jobs are stored in Redis, so they survive server restarts

## Troubleshooting

### Redis Connection Error
```bash
# Check if Redis is running
redis-cli ping

# Check Redis logs
redis-cli monitor
```

### Worker Not Processing Jobs
1. Check if worker is running: `ps aux | grep worker`
2. Check Redis connection: `redis-cli ping`
3. Check queue for jobs: `redis-cli KEYS bull:*`

### Jobs Stuck
1. Check for stalled jobs in Redis
2. Restart worker: `pm2 restart queue-worker-bill-payments`
3. Clear stuck jobs: Use Bull's UI or Redis CLI

