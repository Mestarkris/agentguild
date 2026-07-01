#!/usr/bin/env node
// Generates a Circle entity secret and registers it.
// Run ONCE before setup-circle.js if you haven't registered an entity secret yet.

require('dotenv').config({ path: require('path').join(__dirname, '../orchestrator/.env') });

const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const crypto = require('crypto');
const https = require('https');

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey || apiKey === '') {
    console.error('ERROR: CIRCLE_API_KEY not set in orchestrator/.env');
    process.exit(1);
  }

  // Generate 32-byte random entity secret
  const entitySecret = crypto.randomBytes(32).toString('hex');
  console.log('\n=== GENERATED ENTITY SECRET ===');
  console.log('Save this in orchestrator/.env as:');
  console.log(`CIRCLE_ENTITY_SECRET=${entitySecret}`);
  console.log('\nNow registering public key with Circle...');

  // Use the SDK to get the ciphertext for registration
  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  try {
    const cipherResult = await client.generateEntitySecretCiphertext();
    const ciphertext = cipherResult.data?.entitySecretCiphertext;
    if (!ciphertext) throw new Error('generateEntitySecretCiphertext returned no data');

    // Register via Circle API
    const registered = await registerPublicKey(apiKey, ciphertext);
    if (registered) {
      console.log('✅ Entity secret registered with Circle successfully!');
      console.log('\nAdd to orchestrator/.env:');
      console.log(`CIRCLE_ENTITY_SECRET=${entitySecret}`);
    }
  } catch (err) {
    if (err.message?.includes('already registered') || err.message?.includes('155109')) {
      console.log('ℹ️  Entity already registered for this API key.');
      console.log('\nAdd the entity secret you used previously to orchestrator/.env:');
      console.log('CIRCLE_ENTITY_SECRET=<your-existing-32-byte-hex-secret>');
    } else {
      console.error('Registration failed:', err.message);
      console.log('\nManually register in Circle Console:');
      console.log('  Developer Console → Your Project → Entity Secret → Register');
    }
  }
}

function registerPublicKey(apiKey, ciphertext) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ entitySecretCiphertext: ciphertext });
    const req = https.request({
      hostname: 'api.circle.com',
      path: '/v1/w3s/config/entity/publicKey',
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

main().catch(e => { console.error(e.message); process.exit(1); });
