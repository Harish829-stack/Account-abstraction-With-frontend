import Redis from 'ioredis';

// Read the Redis URL from the environment or use a default local instance
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

async function runRedisTests() {
  console.log(`🔌 Connecting to Redis at ${redisUrl}...`);
  
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1
  });

  client.on('error', (error) => {
    console.error(`❌ Redis connection error: ${error.message}`);
    process.exit(1);
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // 1. PING test
    console.log('--- 1. Testing PING ---');
    const pingResult = await client.ping();
    console.log(`PING returned: ${pingResult}\n`);

    // 2. SET test
    console.log('--- 2. Testing SET ---');
    const testKey = 'test_key';
    const testValue = 'Hello, Redis!';
    await client.set(testKey, testValue);
    console.log(`SET '${testKey}' to '${testValue}'\n`);

    // 3. GET test
    console.log('--- 3. Testing GET ---');
    const getResult = await client.get(testKey);
    console.log(`GET '${testKey}' returned: '${getResult}'\n`);

    // 4. SET with EX (TTL) test
    console.log('--- 4. Testing SET with TTL (Expiration) ---');
    const ttlKey = 'ttl_key';
    await client.set(ttlKey, 'Will disappear soon', 'EX', 2);
    console.log(`SET '${ttlKey}' with a 2-second expiration.`);
    
    let ttlResult = await client.get(ttlKey);
    console.log(`GET '${ttlKey}' immediately returned: '${ttlResult}'`);
    
    console.log('Waiting 3 seconds to test expiration...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    ttlResult = await client.get(ttlKey);
    console.log(`GET '${ttlKey}' after 3 seconds returned: '${ttlResult}'\n`);

    // 5. Hash Set (HSET) test
    console.log('--- 5. Testing Hash Set (HSET / HGETALL) ---');
    const hashKey = 'user:1000';
    await client.hset(hashKey, { name: 'Alice', role: 'admin' });
    console.log(`HSET '${hashKey}' executed.`);
    const hashResult = await client.hgetall(hashKey);
    console.log(`HGETALL '${hashKey}' returned:`, hashResult, '\n');

    // 6. DEL (Delete) test
    console.log('--- 6. Testing DEL ---');
    await client.del(testKey, hashKey);
    console.log(`Deleted '${testKey}' and '${hashKey}'`);
    const afterDelResult = await client.get(testKey);
    console.log(`GET '${testKey}' after deletion returned: '${afterDelResult}'\n`);

    // 7. Get specific app configuration key (from backend usage)
    console.log('--- 7. Checking app_config from backend ---');
    const appConfigStr = await client.get('app_config');
    if (appConfigStr) {
      console.log(`GET 'app_config' found data (length: ${appConfigStr.length} chars).`);
    } else {
      console.log(`GET 'app_config' returned null (it might have expired or not been set yet).`);
    }
    console.log('');
    
  } catch (error) {
    console.error('❌ An error occurred during tests:', error);
  } finally {
    console.log('🔌 Disconnecting from Redis...');
    await client.quit();
  }
}

runRedisTests();
