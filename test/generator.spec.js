const test = require('ava')
const debug = require('debug')('stelace:util')
const { performance } = require('perf_hooks')

const {
  getRandomString,
  getRandomStringRegex,
  padWithRandomChars,
  getObjectId,
  objectIdLength,
  getRandomMarketplaceId,
  isValidMarketplaceId,
  encodeMarketplaceId,
  extractEncodedMarketplaceId,
  extractDataFromObjectId,
  maxMarketplaceId
} = require('../src/generator')

test('generates a random string of given length', async (t) => {
  const randomString = await getRandomString(10)

  t.is(typeof randomString, 'string')
  t.true(getRandomStringRegex(10).test(randomString))
})

test('generates a random padded string', async (t) => {
  const base = '123'
  const length = 10

  t.is((await padWithRandomChars(base, length)).length, 10)
})

test('generates a random string of given length with empty options', async (t) => {
  const randomString = await getRandomString(10, {})

  t.true(getRandomStringRegex(10).test(randomString))
})

test('generates a random string of given length with prefix and default separator', async (t) => {
  const randomString = await getRandomString(16, { prefix: 'TEST' })

  t.true(/^TEST_[a-zA-Z0-9]{11}$/.test(randomString)) // test default separator
  t.true(getRandomStringRegex(16, { prefix: 'TEST' }).test(randomString))
})

test('generates a random string of given length with custom prefix and separator', async (t) => {
  const randomString = await getRandomString(16, { prefix: 'TesT', separator: '@' })
  const specialRandomString = await getRandomString(16, { prefix: '+00/', separator: '+' })

  t.true(/^TesT@[a-zA-Z0-9]{11}$/.test(randomString))
  t.true(getRandomStringRegex(16, { prefix: 'TesT', separator: '@' }).test(randomString))
  t.true(/^\+00\/\+[a-zA-Z0-9]{11}$/.test(specialRandomString))
  t.true(getRandomStringRegex(16, { prefix: '+00/', separator: '+' }).test(specialRandomString))
})

test('throws when generating a random string with wrong options types', async (t) => {
  await t.throwsAsync(async () => getRandomString(16, { prefix: 0, separator: '@' }), {
    message: /string/i
  })
  await t.throwsAsync(async () => getRandomString(16, { prefix: '+00/', separator: false }), {
    message: /string/i
  })
})

test('returns custom prefix and separator if length is too low', async (t) => {
  const options = { prefix: '9Char', separator: 'LONG' }
  const randomString = await getRandomString(11, options)
  const notRandomString = await getRandomString(9, options)
  const notRandomEither = await getRandomString(5, options)

  t.true(/^9CharLONG[a-zA-Z0-9]{2}$/.test(randomString))
  t.is(notRandomString, '9CharLONG')
  t.is(notRandomEither, '9CharLONG')
})

test('generates strings with figures and randomly cased letters only', async (t) => {
  const randomStringsPromises = []
  const stringLength = 32
  const nbStrings = 1000

  const start = performance.now()

  debug(`Start generating ${nbStrings} random strings…`)

  for (let i = 0; i < nbStrings; i++) randomStringsPromises.push(getRandomString(stringLength))

  const randomStrings = await Promise.all(randomStringsPromises)

  debug(`Random strings generated after: ${performance.now() - start}ms`)

  t.true(randomStrings.every(string => getRandomStringRegex(stringLength).test(string)))
})

test('generates strings with appropriate substitutions using RegExp (digits only)', async (t) => {
  const randomStringsPromises = []
  const length = 8
  const options = {
    replaceRegex: /([^\d])/g,
    replacement: (match, $1) => $1.charCodeAt(0) % 9
    // replace all non-digit chars by ASCII char code % 9, e.g. 'a' (97) => 7
    // Minor bias making 1 and 6 a bit more unlikely due to [A-Za-z] ASCII codes.
  }
  const nbStrings = 1000
  const digitRegExp = /^\d+$/

  const start = performance.now()

  debug(`Start generating ${nbStrings} random strings with substitutions…`)

  for (let i = 0; i < nbStrings; i++) randomStringsPromises.push(getRandomString(length, options))

  const randomStrings = await Promise.all(randomStringsPromises)

  debug(`Random strings with substitutions generated after: ${performance.now() - start}ms`)

  t.true(randomStrings.every(string => getRandomStringRegex(length).test(string)))
  t.true(randomStrings.every(string => digitRegExp.test(string)))
})

test('extracts marketplaceId from marketplaceId encoded and masked string', async (t) => {
  const marketplaceIds = {
    'S1123': { id: '1', shuffler: '123' }, // base 62
    'S1a0A': { id: '11', shuffler: 'a00' },
    'szzzz': { id: maxMarketplaceId.toString(), shuffler: 'zzz' }
  }

  Object.keys(marketplaceIds).forEach((paddedIdString) => {
    let decodedMarketplaceId
    try {
      decodedMarketplaceId = extractEncodedMarketplaceId(paddedIdString, {
        shuffler: marketplaceIds[paddedIdString].shuffler
      })
    } catch (e) {
      t.fail(`fails to extract marketplaceId from ${paddedIdString}`)
    }
    t.true(decodedMarketplaceId === marketplaceIds[paddedIdString].id)
  })
})

test('encodes marketplaceId with a shuffler (mask)', async (t) => {
  const marketplaceIds = {}

  for (let i = 0; i < 1000; i++) {
    const marketplaceId = getRandomMarketplaceId()
    const shuffler = await getRandomString(3)

    marketplaceIds[marketplaceId] = {
      encoded: encodeMarketplaceId({
        marketplaceId: marketplaceId,
        shuffler
      }),
      shuffler
    }
  }

  for (let marketplaceId in marketplaceIds) {
    const id = marketplaceIds[marketplaceId]
    let decodedMarketplaceId
    try {
      decodedMarketplaceId = extractEncodedMarketplaceId(id.encoded, {
        shuffler: id.shuffler,
        zone: ''
      })
    } catch (e) {
      t.fail(`fails to extract marketplaceId from ${id.encoded} after encoding`)
    }
    t.true(decodedMarketplaceId === marketplaceId)
  }
})

test('generates objectIds with model idPrefix and base62-encoded marketplaceId', async (t) => {
  const objectIdsPromises = []
  const nbStrings = 1000
  const env = 'live'
  const idPrefixes = [
    'test',
    'usr',
    'catgy',
    'ast',
    'assm'
  ]
  const prefixes = Array.from(Array(nbStrings), (_, i) => {
    // Test all prefix lengths
    return i < idPrefixes.length
      ? idPrefixes[i] : idPrefixes[Math.floor(Math.random() * idPrefixes.length)]
  })
  const marketplaceIds = Array.from(Array(nbStrings), (_, i) => {
    // Test all marketplaces from 1 to 101, go random afterwards
    const id = i <= 100 ? i + 1 : getRandomMarketplaceId()
    return id.toString()
  })
  const start = performance.now()

  debug(`Start generating ${nbStrings} object Ids…`)

  for (let i = 0; i < nbStrings; i++) {
    objectIdsPromises.push(getObjectId({
      prefix: prefixes[i],
      marketplaceId: marketplaceIds[i],
      env
    }))
  }

  const objectIds = await Promise.all(objectIdsPromises)

  debug(`Object Ids generated after: ${performance.now() - start}ms`)

  t.true(objectIds.every((string, i) => {
    return getRandomStringRegex(objectIdLength, { prefix: prefixes[i], env }).test(string)
  }))
  t.true(objectIds.every((string, index) => {
    let decodedMarketplaceId
    try {
      decodedMarketplaceId = extractDataFromObjectId(string).marketplaceId
    } catch (e) {
      return false
    }

    return decodedMarketplaceId === marketplaceIds[index]
  }))
})

test('throws when generating objectIds with invalid marketplaceId', async (t) => {
  const prefix = 'test'

  await t.throwsAsync(async () => getObjectId({ prefix }))

  const marketplaceId = maxMarketplaceId + 1

  await t.throwsAsync(async () => getObjectId({ prefix, marketplaceId }))
})

test('validates marketplaceId format', t => {
  for (let i = 0; i < 1000; i++) {
    const id = getRandomMarketplaceId()
    t.true(isValidMarketplaceId(id))
  }

  const maxId = maxMarketplaceId
  t.true(isValidMarketplaceId(maxId))
  t.false(isValidMarketplaceId(maxId + 1))
  t.false(isValidMarketplaceId(-1))
  t.false(isValidMarketplaceId(-Infinity))
  t.false(isValidMarketplaceId(null))
  t.false(isValidMarketplaceId())
})
