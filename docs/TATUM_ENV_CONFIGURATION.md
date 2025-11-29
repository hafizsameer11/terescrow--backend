# Tatum & Redis Queue - Environment Configuration

## 📋 Required Environment Variables

Add these to your `.env` file:

### 🔴 Redis Configuration (Required for Queue System)

```env
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                    # Optional, leave empty if no password

# Alternative: Use Redis URL format
# REDIS_URL=redis://localhost:6379
# REDIS_URL=redis://:password@localhost:6379
```

### 🔵 Queue Configuration (Optional - Has Defaults)

```env
# Queue Processing Settings
QUEUE_CONCURRENCY=1                # Number of jobs to process simultaneously (default: 1)
QUEUE_MAX_JOBS=10                  # Max jobs per interval (default: 10)
QUEUE_INTERVAL=1000                # Interval in milliseconds (default: 1000ms = 1 second)
```

### 🟢 Tatum API Configuration (Required)

```env
# Tatum API Credentials
TATUM_API_KEY=your_tatum_api_key_here
TATUM_BASE_URL=https://api.tatum.io/v3

# Tatum Webhook URL (where Tatum will send webhooks)
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum
```

### 🔐 Encryption Configuration (Required for Private Keys)

```env
# Private Key Encryption Key (MUST be 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key-here!!
```

**⚠️ Important:** The encryption key must be exactly 32 characters for AES-256-CBC encryption.

### 🌐 Application Configuration (Required)

```env
# Base URL of your application (used for webhook URLs)
BASE_URL=https://yourdomain.com
# OR for development:
# BASE_URL=http://localhost:8000
```

## 📝 Complete .env Example

```env
# ============================================
# Redis Configuration (Queue System)
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue Processing
QUEUE_CONCURRENCY=1
QUEUE_MAX_JOBS=10
QUEUE_INTERVAL=1000

# ============================================
# Tatum API Configuration
# ============================================
TATUM_API_KEY=t-your-api-key-here
TATUM_BASE_URL=https://api.tatum.io/v3
TATUM_WEBHOOK_URL=https://yourdomain.com/api/v2/webhooks/tatum

# ============================================
# Encryption Configuration
# ============================================
ENCRYPTION_KEY=my-super-secret-32-char-key!!

# ============================================
# Application Configuration
# ============================================
BASE_URL=https://yourdomain.com
# For development: BASE_URL=http://localhost:8000

# ============================================
# Database (if not already configured)
# ============================================
DATABASE_URL=mysql://user:password@localhost:3306/database_name
```

## 🔍 Configuration Details

### Redis Configuration

**Purpose:** Redis is used by Bull Queue to store and manage background jobs.

**Options:**
- **REDIS_HOST**: Redis server hostname (default: `localhost`)
- **REDIS_PORT**: Redis server port (default: `6379`)
- **REDIS_PASSWORD**: Redis password (optional, leave empty if not using password)
- **REDIS_URL**: Alternative format - full Redis URL (e.g., `redis://:password@host:port`)

**Testing Redis Connection:**
```bash
redis-cli ping
# Should return: PONG
```

### Queue Configuration

**Purpose:** Controls how background jobs are processed.

**Options:**
- **QUEUE_CONCURRENCY**: How many jobs to process at the same time
  - `1` = Process one job at a time (safer, slower)
  - `5` = Process 5 jobs simultaneously (faster, more resource intensive)
  
- **QUEUE_MAX_JOBS**: Maximum number of jobs to process per interval
  - Prevents overwhelming the system
  
- **QUEUE_INTERVAL**: Time window in milliseconds
  - `1000` = 1 second
  - Used with QUEUE_MAX_JOBS to rate limit processing

**Example:**
```env
QUEUE_CONCURRENCY=2        # Process 2 jobs at once
QUEUE_MAX_JOBS=20          # Max 20 jobs per second
QUEUE_INTERVAL=1000        # Per 1 second
```

### Tatum API Configuration

**Purpose:** Connects to Tatum API for virtual account management.

**Options:**
- **TATUM_API_KEY**: Your Tatum API key
  - Format: Usually starts with `t-` for testnet or production key
  - Get from: https://dashboard.tatum.io/
  
- **TATUM_BASE_URL**: Tatum API base URL
  - Production: `https://api.tatum.io/v3`
  - Testnet: `https://api.tatum.io/v3` (same URL, different API key)
  
- **TATUM_WEBHOOK_URL**: Where Tatum will send webhook notifications
  - Must be publicly accessible
  - Format: `https://yourdomain.com/api/v2/webhooks/tatum`
  - For local testing, use ngrok or similar: `https://your-ngrok-url.ngrok.io/api/v2/webhooks/tatum`

**Getting Tatum API Key:**
1. Sign up at https://dashboard.tatum.io/
2. Go to API Keys section
3. Create a new API key
4. Copy the key to `TATUM_API_KEY`

### Encryption Configuration

**Purpose:** Encrypts private keys before storing in database.

**Options:**
- **ENCRYPTION_KEY**: Must be exactly 32 characters
  - Used for AES-256-CBC encryption
  - **CRITICAL:** Keep this secret and never commit to git
  - Generate a secure random key:
    ```bash
    # Generate random 32 character key
    openssl rand -hex 16
    # Or use online generator
    ```

**⚠️ Security Warning:**
- Never share this key
- Use different keys for development and production
- Rotate keys periodically
- Store securely (consider using secrets management)

### Application Configuration

**Purpose:** Base URL for generating webhook URLs and other absolute URLs.

**Options:**
- **BASE_URL**: Full URL of your application
  - Production: `https://yourdomain.com`
  - Development: `http://localhost:8000`
  - Used to construct webhook URLs if `TATUM_WEBHOOK_URL` is not set

## 🚀 Setup Steps

### 1. Install Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**Windows:**
- Download from: https://redis.io/download
- Or use WSL (Windows Subsystem for Linux)

### 2. Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

### 3. Add Environment Variables

Copy the example `.env` above and fill in your values:
- Get Tatum API key from dashboard
- Generate encryption key
- Set your domain/base URL

### 4. Test Configuration

```bash
# Test Redis connection
redis-cli ping

# Test Tatum API (if you have a test script)
# The service will throw an error if TATUM_API_KEY is missing

# Start queue worker
npm run queue:work:tatum
```

## 🔒 Security Best Practices

1. **Never commit `.env` to git**
   - Already in `.gitignore` ✅
   
2. **Use different keys for dev/prod**
   - Development: Test keys
   - Production: Production keys
   
3. **Rotate encryption keys periodically**
   - If compromised, re-encrypt all private keys
   
4. **Use environment-specific values**
   - Development: `localhost`, test API keys
   - Production: Production domain, production API keys

## 🐛 Troubleshooting

### Redis Connection Error

```bash
# Check if Redis is running
redis-cli ping

# Check Redis logs
redis-cli monitor

# Check Redis configuration
redis-cli CONFIG GET "*"
```

### Tatum API Error

- Verify `TATUM_API_KEY` is correct
- Check API key has required permissions
- Verify `TATUM_BASE_URL` is correct
- Check Tatum dashboard for API usage/limits

### Encryption Error

- Verify `ENCRYPTION_KEY` is exactly 32 characters
- Check for special characters that might need escaping
- Ensure key is not empty

### Queue Not Processing

- Verify Redis is running
- Check `REDIS_HOST` and `REDIS_PORT` are correct
- Verify worker is running: `npm run queue:work:tatum`
- Check Redis connection: `redis-cli ping`

## 📚 Additional Resources

- **Tatum Documentation:** https://docs.tatum.io/
- **Bull Queue Documentation:** https://github.com/OptimalBits/bull
- **Redis Documentation:** https://redis.io/documentation

