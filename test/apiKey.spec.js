const test = require('ava')

const {
  marketplaceZones,
  getRandomMarketplaceId
} = require('../src/generator')
const {
  generateKey,
  parseKey
} = require('../src/apiKey')

test('generates a random key', async (t) => {
  const type = 'sk'
  const env = 'test'
  const marketplaceId = '12'

  for (let i = 0; i < 100; i++) {
    const key = await generateKey({ type, env, marketplaceId })

    t.true(key.startsWith(`${type}_${env}_`))
    t.is(key.length, 32)
  }
})

test('parses a random key', async (t) => {
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
      zone
    })
  }
})
