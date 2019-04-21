const test = require('ava')

const {
  marketplaceZones,
  getRandomMarketplaceId
} = require('../src/generator')
const {
  generateKey,
  parseKey
} = require('../src/apiKey')

test('generates valid keys for a given platformId', async (t) => {
  const type = 'sk'
  const env = 'test'
  const marketplaceId = '12'
  const expectedPrefix = `${type}_${env}_`

  for (let i = 0; i < 100; i++) {
    const key = await generateKey({ type, env, marketplaceId })

    t.true(key.startsWith(expectedPrefix))
    t.is(key.length, 32 + expectedPrefix.length)
  }
})

test('generates valid custom keys', async (t) => {
  const type = 'customKey1'
  const env = 'live'
  const expectedPrefix = `${type}_${env}_`

  for (let i = 0; i < 100; i++) {
    const marketplaceId = getRandomMarketplaceId()
    const key = await generateKey({ type, env, marketplaceId })

    t.true(key.startsWith(expectedPrefix))
    t.is(key.length, 32 + expectedPrefix.length)

    t.deepEqual(parseKey(key), {
      type,
      env,
      marketplaceId,
      zone: marketplaceZones[0],
      hasValidFormat: true
    })
  }
})

test('throws when trying to generate custom key with invalid type', async (t) => {
  const env = 'live'
  const marketplaceId = getRandomMarketplaceId()

  await t.throwsAsync(async () => generateKey({ type: 'tooLongType', env, marketplaceId }),
    { message: /custom apikey type/i }
  )

  await t.throwsAsync(async () => generateKey({ type: 'Éxoti©Key', env, marketplaceId }),
    { message: /custom apikey type/i }
  )
})

test('parses a valid key', async (t) => {
  const type = 'pk'
  const env = 'test'
  const zone = marketplaceZones[0]

  for (let i = 0; i < 1000; i++) {
    const marketplaceId = getRandomMarketplaceId()
    const key = await generateKey({ type, env, marketplaceId })

    t.deepEqual(parseKey(key), {
      type,
      env,
      marketplaceId,
      zone,
      hasValidFormat: true
    })
  }
})

test('rejects a forged key with invalid platform id / mask', async (t) => {
  t.is(parseKey('pk_live_iuJzTKo5wumuE1imRjmcgimx').hasValidFormat, false)

  t.deepEqual(parseKey('pk_live_iuJzTKo5wumuE1inRjmcgimx'), {
    type: 'pk',
    env: 'live',
    marketplaceId: '31',
    zone: 'e',
    hasValidFormat: true
  })
})

test('parses a shorter key (legacy)', async (t) => {
  t.deepEqual(parseKey('pk_test_m6DF3SOm0DcIs1atGMMPoasm'), {
    type: 'pk',
    env: 'test',
    marketplaceId: '31',
    zone: 's',
    hasValidFormat: true
  })

  t.deepEqual(parseKey('pk_live_iuJzTKo5wumuE1imRjmcgilx'), {
    type: 'pk',
    env: 'live',
    marketplaceId: '31',
    zone: 'e',
    hasValidFormat: true
  })
})
