/**
 * Generate PalmPay RSA Key Pair
 * 
 * Generates a 2048-bit RSA key pair in the format PalmPay expects:
 * - Private key: Base64 encoded PKCS#8 format
 * - Public key: Base64 encoded format
 * 
 * Usage: npx ts-node scripts/generate-palmpay-keys.ts
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function generateKeyPair() {
  console.log('Generating 2048-bit RSA key pair for PalmPay...\n');

  // Generate RSA key pair (2048 bits)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Extract Base64 content from PEM format
  // Private key: Remove PEM headers and newlines, get Base64 content
  const privateKeyBase64 = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .trim();

  // Public key: Remove PEM headers and newlines, get Base64 content
  const publicKeyBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .trim();

  console.log('✅ Key pair generated successfully!\n');
  console.log('='.repeat(80));
  console.log('PRIVATE KEY (Base64 - Add this to your .env file):');
  console.log('='.repeat(80));
  console.log(privateKeyBase64);
  console.log('\n');
  console.log('='.repeat(80));
  console.log('PUBLIC KEY (Base64 - Upload this to PalmPay platform):');
  console.log('='.repeat(80));
  console.log(publicKeyBase64);
  console.log('\n');
  console.log('='.repeat(80));
  console.log('PUBLIC KEY (PEM format - for reference):');
  console.log('='.repeat(80));
  console.log(publicKey);
  console.log('\n');
  console.log('='.repeat(80));
  console.log('INSTRUCTIONS:');
  console.log('='.repeat(80));
  console.log('1. Copy the PRIVATE KEY (Base64) above');
  console.log('2. Add it to your .env file as:');
  console.log('   PALMPAY_PRIVATE_KEY=<paste_base64_key_here>');
  console.log('3. Copy the PUBLIC KEY (Base64) above');
  console.log('4. Upload it to PalmPay merchant platform');
  console.log('5. Also save the PUBLIC KEY (PEM format) for webhook verification');
  console.log('='.repeat(80));
  console.log('\n');

  // Optionally save to files
  const keysDir = path.join(process.cwd(), 'keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  // Save private key (Base64) - for .env
  fs.writeFileSync(
    path.join(keysDir, 'palmpay-private-key-base64.txt'),
    privateKeyBase64,
    'utf8'
  );

  // Save public key (Base64) - for PalmPay upload
  fs.writeFileSync(
    path.join(keysDir, 'palmpay-public-key-base64.txt'),
    publicKeyBase64,
    'utf8'
  );

  // Save public key (PEM) - for webhook verification
  fs.writeFileSync(
    path.join(keysDir, 'palmpay-public-key.pem'),
    publicKey,
    'utf8'
  );

  // Save private key (PEM) - for reference (keep secure!)
  fs.writeFileSync(
    path.join(keysDir, 'palmpay-private-key.pem'),
    privateKey,
    'utf8'
  );

  console.log('✅ Keys saved to ./keys/ directory:');
  console.log('   - palmpay-private-key-base64.txt (for .env)');
  console.log('   - palmpay-public-key-base64.txt (for PalmPay upload)');
  console.log('   - palmpay-public-key.pem (for webhook verification)');
  console.log('   - palmpay-private-key.pem (for reference - KEEP SECURE!)\n');
  console.log('⚠️  WARNING: Keep the private key secure! Do not commit it to git!\n');

  return {
    privateKeyBase64,
    publicKeyBase64,
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
  };
}

// Run if executed directly
if (require.main === module) {
  try {
    generateKeyPair();
  } catch (error: any) {
    console.error('Error generating key pair:', error.message);
    process.exit(1);
  }
}

export { generateKeyPair };

