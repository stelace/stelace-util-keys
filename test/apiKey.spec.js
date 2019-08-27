const test = require('ava')

const {
  platformZones,
  getRandomPlatformId
} = require('../src/generator')
const {
  generateKey,
  parseKey
} = require('../src/apiKey')

test('generates valid keys for a given platformId', async (t) => {
  const type = 'seck'
  const env = 'test'
  const platformId = '12'
  const expectedPrefix = `${type}_${env}_`

  for (let i = 0; i < 100; i++) {
    const key = await generateKey({ type, env, platformId })

    t.true(key.startsWith(expectedPrefix))
    t.is(key.length, 32 + expectedPrefix.length)
  }
})

test('generates valid custom keys', async (t) => {
  const type = 'customKey1'
  const env = 'live'
  const expectedPrefix = `${type}_${env}_`

  for (let i = 0; i < 100; i++) {
    const platformId = getRandomPlatformId()
    const key = await generateKey({ type, env, platformId })

    t.true(key.startsWith(expectedPrefix))
    t.is(key.length, 32 + expectedPrefix.length)

    t.deepEqual(parseKey(key), {
      type,
      env,
      platformId,
      zone: platformZones[0],
      hasValidFormat: true
    })
  }
})

test('throws when trying to generate custom key with invalid type', async (t) => {
  const env = 'live'
  const platformId = getRandomPlatformId()

  await t.throwsAsync(async () => generateKey({ type: 'tooLongType', env, platformId }),
    { message: /custom apikey type/i }
  )

  await t.throwsAsync(async () => generateKey({ type: 'Éxoti©Key', env, platformId }),
    { message: /custom apikey type/i }
  )
})

test('parses a valid key', async (t) => {
  const type = 'pubk'
  const env = 'test'
  const zone = platformZones[0]

  for (let i = 0; i < 1000; i++) {
    const platformId = getRandomPlatformId()
    const key = await generateKey({ type, env, platformId })

    t.deepEqual(parseKey(key), {
      type,
      env,
      platformId,
      zone,
      hasValidFormat: true
    })
  }
})

test('rejects a forged key with invalid platform id / mask', async (t) => {
  t.is(parseKey('pubk_live_iuJzTKo5wumuE1imRjmcgimx').hasValidFormat, false)

  t.deepEqual(parseKey('pubk_live_iuJzTKo5wumuE1inRjmcgimx'), {
    type: 'pubk',
    env: 'live',
    platformId: '31',
    zone: 'e',
    hasValidFormat: true
  })
})
