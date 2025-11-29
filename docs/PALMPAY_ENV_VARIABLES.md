# PalmPay Environment Variables

This document lists all required and optional environment variables for PalmPay integration.

## Required Variables

These variables **MUST** be set in your `.env` file:

```env
# PalmPay API Credentials (REQUIRED)
PALMPAY_PRIVATE_KEY=your_private_key_here
```

**Note:** `PALMPAY_PRIVATE_KEY` is the only truly required variable. Others have fallbacks or are optional.

**PALMPAY_PRIVATE_KEY**: 
- Base64 encoded RSA private key provided by PalmPay
- Used for signing API requests (MD5 + SHA1WithRSA signature)
- **REQUIRED** for all API requests to PalmPay
- Keep this secure and never commit to version control

---

## Optional Variables (with fallbacks)

```env
# API Key - Used in Authorization: Bearer header
PALMPAY_API_KEY=your_api_key_here
# If not set, will fallback to PALMPAY_MERCHANT_ID or PALMPAY_APP_ID for testing
```

**PALMPAY_API_KEY**: 
- Used in `Authorization: Bearer` header for all API requests
- **For testing**: If not set, will automatically use `PALMPAY_MERCHANT_ID` or `PALMPAY_APP_ID` as fallback
- Get from PalmPay merchant dashboard

---

## Optional Variables (not used)

```env
# API Secret - Currently not used in requests
PALMPAY_API_SECRET=your_api_secret_here
```

**PALMPAY_API_SECRET**: 
- **NOT USED** - Signature generation uses `PALMPAY_PRIVATE_KEY` instead
- Can be left empty or omitted
- May be used in future API versions

---

## Optional Variables (with defaults)

These variables have default values but can be overridden:

```env
# PalmPay Environment (sandbox or production)
PALMPAY_ENVIRONMENT=sandbox
# Options: "sandbox" | "production"
# Default: "sandbox"
# 
# Base URLs:
# - sandbox: https://open-gw-daily.palmpay-inc.com
# - production: https://open-gw.palmpay-inc.com

# API Version
PALMPAY_VERSION=V1.1
# Default: "V1.1"
# Note: Bill payments use "V2" internally

# Country Code
PALMPAY_COUNTRY_CODE=NG
# Default: "NG"
# Options: "NG" (Nigeria), "GH" (Ghana), "TZ" (Tanzania), "KE" (Kenya), "ZA" (South Africa)

# Webhook URL
PALMPAY_WEBHOOK_URL=https://api.terescrow.com/api/v2/webhooks/palmpay
# Default: "https://api.terescrow.com/api/v2/webhooks/palmpay"
# This is the URL where PalmPay will send payment notifications
```

---

## Optional Variables (nullable)

These variables are optional and can be left empty:

```env
# Merchant ID (optional)
PALMPAY_MERCHANT_ID=your_merchant_id
# Used for some PalmPay operations

# App ID (optional)
PALMPAY_APP_ID=your_app_id
# Used for webhook verification

# Public Key (optional)
PALMPAY_PUBLIC_KEY=your_public_key
# Used for signature verification in webhooks
# If not set, webhook signature verification will be skipped (not recommended for production)
```

---

## Complete .env Example

```env
# ============================================
# PalmPay Configuration
# ============================================

# REQUIRED - Only private key is truly required
PALMPAY_PRIVATE_KEY=your_private_key_here  # Base64 encoded RSA private key

# OPTIONAL - API Key (will use MERCHANT_ID as fallback if not set)
PALMPAY_API_KEY=your_api_key_here

# OPTIONAL - API Secret (not currently used, can be omitted)
PALMPAY_API_SECRET=your_api_secret_here

# OPTIONAL - With defaults
PALMPAY_ENVIRONMENT=sandbox                    # or "production"
PALMPAY_VERSION=V1.1                          # API version
PALMPAY_COUNTRY_CODE=NG                       # Country code
PALMPAY_WEBHOOK_URL=https://api.terescrow.com/api/v2/webhooks/palmpay

# OPTIONAL - Can be left empty
PALMPAY_MERCHANT_ID=your_merchant_id          # Optional
PALMPAY_APP_ID=your_app_id                    # Optional
PALMPAY_PUBLIC_KEY=your_public_key            # Optional (but recommended for production)
```

---

## Where to Get These Values

1. **PALMPAY_PRIVATE_KEY** (REQUIRED)
   - Base64 encoded RSA private key provided by PalmPay
   - Used for signing API requests using MD5 + SHA1WithRSA
   - **REQUIRED** for all API requests to PalmPay

2. **PALMPAY_API_KEY** (Optional - has fallback)
   - Used in `Authorization: Bearer` header
   - If not set, will use `PALMPAY_MERCHANT_ID` or `PALMPAY_APP_ID` as fallback
   - Get from PalmPay merchant dashboard

3. **PALMPAY_API_SECRET** (Optional - not used)
   - Currently not used in the implementation
   - Signature uses private key instead
   - Can be omitted

4. **PALMPAY_MERCHANT_ID** and **PALMPAY_APP_ID**
   - Provided by PalmPay when you register as a merchant
   - Check your PalmPay merchant account dashboard

4. **PALMPAY_PUBLIC_KEY**
   - Used for webhook signature verification
   - Get from PalmPay documentation or dashboard
   - **Important:** Required for secure webhook verification in production

4. **PALMPAY_WEBHOOK_URL**
   - Your server's public URL where PalmPay will send webhooks
   - Must be accessible from the internet
   - Format: `https://your-domain.com/api/v2/webhooks/palmpay`

---

## Environment-Specific Settings

### Development/Sandbox
```env
PALMPAY_ENVIRONMENT=sandbox
PALMPAY_WEBHOOK_URL=http://localhost:8000/api/v2/webhooks/palmpay  # Use ngrok for local testing
```

### Production
```env
PALMPAY_ENVIRONMENT=production
PALMPAY_WEBHOOK_URL=https://api.terescrow.com/api/v2/webhooks/palmpay
PALMPAY_PUBLIC_KEY=your_production_public_key  # IMPORTANT: Set this for production
```

---

## Validation

The application uses **lazy validation** - variables are only checked when they're actually used. This means:

- ✅ Application will start even if PalmPay variables are missing
- ❌ Error will occur when trying to use PalmPay services without required variables
- ⚠️ Missing optional variables will use defaults or skip features (like webhook verification)

---

## Testing

To test if your configuration is correct:

1. Set all required variables in `.env`
2. Start the server
3. Try calling a PalmPay endpoint (e.g., deposit or bill payment)
4. Check server logs for any configuration errors

---

## Security Notes

- ⚠️ **Never commit `.env` file to version control**
- ⚠️ **Keep API keys and secrets secure**
- ⚠️ **Use different credentials for sandbox and production**
- ⚠️ **Enable webhook signature verification in production** (set `PALMPAY_PUBLIC_KEY`)

---

## Test Keys

For testing/sandbox environment, see `docs/PALMPAY_TEST_KEYS.md` for test keys provided by PalmPay.

**Quick Test Setup:**
- Use any merchant configuration from the test keys document
- Use the PalmPay platform public key for webhook verification
- Set `PALMPAY_ENVIRONMENT=sandbox`

---

## References

- [PalmPay Signature Documentation](https://docs.palmpay.com/)
- [Test Keys](docs/PALMPAY_TEST_KEYS.md) - PalmPay sandbox test keys
- Implementation: `src/services/palmpay/palmpay.auth.service.ts`
- Configuration: `src/services/palmpay/palmpay.config.ts`

