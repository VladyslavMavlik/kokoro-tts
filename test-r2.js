/**
 * Test R2 connection and channel structure
 */

import { config } from 'dotenv';
config();

// Debug credentials
console.log('🔑 R2 Credentials:');
console.log('  Account ID:', process.env.R2_ACCOUNT_ID);
console.log('  Access Key:', process.env.R2_ACCESS_KEY_ID?.substring(0, 10) + '...');
console.log('  Secret Key:', process.env.R2_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET');
console.log('  Bucket:', process.env.R2_BUCKET);
console.log();

const { collectChannelInputs, prepareOutput } = await import('./server/r2.js');

async function test() {
  console.log('🧪 Testing R2 Connection...\n');

  try {
    // Test collecting inputs for MilasConfessions channel
    console.log('📂 Collecting inputs for channel: MilasConfessions');
    const inputs = await collectChannelInputs('MilasConfessions');

    console.log('\n✅ Inputs collected:');
    console.log(`  Frames: ${inputs.frames?.length || 0}`);
    console.log(`  Audio: ${inputs.audio ? 'YES' : 'NO'}`);
    console.log(`  Person: ${inputs.person ? 'YES' : 'NO'}`);
    console.log(`  Overlays: ${inputs.overlays?.length || 0}`);
    console.log(`  Text: ${inputs.text ? 'YES' : 'NO'}`);

    if (inputs.frames && inputs.frames.length > 0) {
      console.log(`\n📸 First frame URL: ${inputs.frames[0].substring(0, 100)}...`);
    }

    // Test output preparation
    console.log('\n📤 Preparing output location...');
    const output = await prepareOutput('MilasConfessions', 'test-job-123');

    console.log(`  Output key: ${output.key}`);
    console.log(`  Public URL: ${output.publicUrl}`);
    console.log(`  PUT URL: ${output.putUrl.substring(0, 100)}...`);

    console.log('\n✅ All tests passed!');

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

test();
