const test = require('ava')
const debug = require('debug')('stelace:util')
const { performance } = require('perf_hooks')

const {
  getRandomString,
  getRandomStringRegex,
  padWithRandomChars,
  getObjectId,
  objectIdLength,
  getRandomPlatformId,
  isValidPlatformId,
  encodePlatformId,
  extractEncodedPlatformId,
  extractDataFromObjectId,
  parsePublicPlatformId,
  platformZones,
  maxPlatformId
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

test('extracts platformId from platformId encoded and masked string', async (t) => {
  const platformIds = {
    S1123: { id: '1', shuffler: '123' }, // base 62
    S1a0A: { id: '11', shuffler: 'a00' },
    szzzz: { id: maxPlatformId.toString(), shuffler: 'zzz' }
  }

  Object.keys(platformIds).forEach((paddedIdString) => {
    let decodedPlatformId
    try {
      decodedPlatformId = extractEncodedPlatformId(paddedIdString, {
        shuffler: platformIds[paddedIdString].shuffler
      })
    } catch (e) {
      t.fail(`fails to extract platformId from ${paddedIdString}`)
    }
    t.true(decodedPlatformId === platformIds[paddedIdString].id)
  })
})

test('encodes platformId with a shuffler (mask)', async (t) => {
  const platformIds = {}

  for (let i = 0; i < 1000; i++) {
    const platformId = getRandomPlatformId()
    const shuffler = await getRandomString(3)

    platformIds[platformId] = {
      encoded: encodePlatformId({
        platformId: platformId,
        shuffler
      }),
      shuffler
    }
  }

  for (const platformId in platformIds) {
    const id = platformIds[platformId]
    let decodedPlatformId
    try {
      decodedPlatformId = extractEncodedPlatformId(id.encoded, {
        shuffler: id.shuffler,
        zone: ''
      })
    } catch (e) {
      t.fail(`fails to extract platformId from ${id.encoded} after encoding`)
    }
    t.true(decodedPlatformId === platformId)
  }
})

test('generates objectIds with model idPrefix and base62-encoded platformId', async (t) => {
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
  const platformIds = Array.from(Array(nbStrings), (_, i) => {
    // Test all platforms from 1 to 101, go random afterwards
    const id = i <= 100 ? i + 1 : getRandomPlatformId()
    return id.toString()
  })
  const start = performance.now()

  debug(`Start generating ${nbStrings} object Ids…`)

  for (let i = 0; i < nbStrings; i++) {
    objectIdsPromises.push(getObjectId({
      prefix: prefixes[i],
      platformId: platformIds[i],
      env
    }))
  }

  const objectIds = await Promise.all(objectIdsPromises)

  debug(`Object Ids generated after: ${performance.now() - start}ms`)

  t.true(objectIds.every((string, i) => {
    return getRandomStringRegex(objectIdLength, { prefix: prefixes[i], env }).test(string)
  }))
  t.true(objectIds.every((string, index) => {
    let decodedPlatformId
    try {
      decodedPlatformId = extractDataFromObjectId(string).platformId
    } catch (e) {
      return false
    }

    return decodedPlatformId === platformIds[index]
  }))
})

test('throws when generating objectIds with invalid platformId', async (t) => {
  const prefix = 'test'

  await t.throwsAsync(async () => getObjectId({ prefix }))

  const platformId = maxPlatformId + 1

  await t.throwsAsync(async () => getObjectId({ prefix, platformId }))
})

test('validates platformId format', t => {
  for (let i = 0; i < 1000; i++) {
    const id = getRandomPlatformId()
    t.true(isValidPlatformId(id))
  }

  const maxId = maxPlatformId
  t.true(isValidPlatformId(maxId))
  t.false(isValidPlatformId(maxId + 1))
  t.false(isValidPlatformId(-1))
  t.false(isValidPlatformId(-Infinity))
  t.false(isValidPlatformId(null))
  t.false(isValidPlatformId())
})

test('parses a public platform ID', async (t) => {
  const env = 'test'
  const zone = platformZones[0]

  for (let i = 0; i < 1000; i++) {
    const platformId = getRandomPlatformId()
    const publicPlatformId = `${zone}${platformId}_${env}`
    const withoutEnv = `${zone}${platformId}`

    t.deepEqual(parsePublicPlatformId(publicPlatformId), {
      env,
      platformId,
      zone,
      hasValidFormat: true
    })
    t.deepEqual(parsePublicPlatformId(withoutEnv), {
      env: null,
      platformId,
      zone,
      hasValidFormat: true
    })
  }
})
