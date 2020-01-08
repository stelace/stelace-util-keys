const crypto = require('crypto')
const escapeStringRegexp = require('escape-string-regexp')

const base62 = require('base62/lib/custom')
/** Preserves ASCII sorting order
 * @constant {String}
 */
const base62Chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const base62Index = base62.indexCharset(base62Chars)

const defaultPrefix = ''
const defaultSeparator = '_'

/** Lowercase single-char platform zones, mapping to server regions
 * @constant {Array}
 */
const platformZones = ['e', 's']
if (!platformZones.every((sep) => sep.length === 1 && sep === sep.toLowerCase())) {
  throw new Error('All platformZones should have a single char')
}

const encodedPlatformIdStringLength = 4
const platformPartLength = encodedPlatformIdStringLength + 1 // including zone
const platformIdBase = Math.pow(62, 3) - 1 // ensuring it is encoded in 4 chars
const maxPlatformId = Math.pow(62, 4) - 1 - base62.decode('zzz', base62Index) - platformIdBase
// max 'z000' to allow masking up to '0zzz'

const objectIdLength = 24
// High enough to generate 14,000,000+ platforms,
// with low collision risk each second across platform objects of the same type.
// Please refer to README for more math details.
const objectIdTimestampLength = 6
// (Math.pow(62, 6) - 1) seconds from epoch is 3769-12-05T03:13:03.499Z

/**
 * Async function returning a random string, made of base64 chars except for '+' and '/'
 * replaced by 0.
 * replaceRegex and replacement can be provided but you
 * should make sure length remains the same after String.replace is run, since the function
 * only checks that replacement is not falsy when replaceRegex is provided.
 *
 * http://blog.tompawlak.org/how-to-generate-random-values-nodejs-javascript
 * @param {Number} length - length to reach
 * @param {Object} [options]
 * @param {String} [options.prefix]
 * @param {String} [options.separator='_'] - separator between the prefix and random chars
 * @param {Regex|String} [options.replaceRegex] - to ban some chars from output
 * @param {String|Function} [options.replacement] - can’t be falsy
 * @return {String}
 */
async function getRandomString (length, {
  prefix = defaultPrefix,
  separator = defaultSeparator,
  replaceRegex,
  replacement
} = {}) {
  if ([prefix, separator].some(s => typeof s !== 'string')) {
    throw new Error('String prefix options expected')
  }
  if (!!replaceRegex !== !!replacement) { // XOR negation: can’t have 1 falsy when the other is not
    throw new Error('Both of replaceRegex and replacement optional parameters expected')
  }
  const charsNeeded = getCharsNeededAfterPrefix({ length, prefix, separator })
  let randomString = prefix ? prefix + separator : ''

  if (charsNeeded <= 0) return randomString

  const randomArray = await new Promise((resolve, reject) => {
    crypto.randomBytes(Math.ceil(charsNeeded * 3 / 4), (err, buffer) => {
      if (err) reject(new Error('Error when generating random bytes'))
      else resolve(buffer)
    })
  })

  randomString += randomArray.toString('base64')
    .slice(0, charsNeeded)
    .replace(/\+/g, '0')
    .replace(/\//g, '0')

  if (replaceRegex) randomString = randomString.replace(replaceRegex, replacement)

  return randomString
}

function getRandomStringRegex (length = 1, {
  prefix = defaultPrefix,
  separator = defaultSeparator
} = {}) {
  const charsNeeded = getCharsNeededAfterPrefix({ length, prefix, separator })
  if ([prefix, separator].some(s => typeof s !== 'string')) {
    throw new Error('String prefix options expected')
  }
  const escapedBase = escapeStringRegexp(prefix ? prefix + separator : '')
  return new RegExp(`^${escapedBase}[a-zA-Z0-9]{${charsNeeded}}$`)
}

function getCharsNeededAfterPrefix ({ length, prefix, separator }) {
  return prefix ? (length - prefix.length - separator.length) : length
}

/**
 * Async function returning string of given length with (pre|suf)fix random chars
 * @param {String} base - base string
 * @param {Number} length - length to reach
 * @param {Object} [options]
 * @param {String} [options.position=right] - position of the random characters ('left' -> before the base)
 * @param {Object} [options.randomOptions] - options accepted by getRandomString called internally
 * @return {String}
 */
async function padWithRandomChars (base, length, { position = '', randomOptions = {} } = {}) {
  const diffLength = length - base.length

  const randomString = await getRandomString(diffLength, { ...randomOptions })
  let str = ''

  if (position === 'left') {
    str = randomString + base
  } else {
    str = base + randomString
  }

  return str
}

/**
 * Async function returning a new objectId with model prefix, base-64 encoded platformId
 * random chars, and some magic to ensure ids of the same type can be differentiated easily
 * on the same platform.
 * Outputs 24-char object ids with 7 parts:
 *
 * - A: 3/4 char-long prefix (preferably 3 for numerous resources like ast or evt)
 * - B: underscore
 * - C: 5 or 6 random base62 equivalent chars generated by crypto module
 * - D: server zone ('e' -> EU), uppercase if env is 'live'
 * - E: 4 chars dedicated to platformId integer encoded in base62, and masked with G (see below)
 *   starting from '1000' = 238328 (62^3)
 *   up to 'z000' = 14776335 - 238327 = 14538008
 *   (in case shuffler reaches its max 'zzz' = 61*62^2 + 61*62^1 + 61*62^0 = 238327)
 *   which makes 14538008 - 238328 + 1 = 14299681 platforms…
 * - F: 6 chars for UNIX timestamp integer encoded in base 62
 *   (enough for more than 1000 years)
 *   We use some masking again to ensure ids can be differentiated easily.
 * - G: 3 last chars are a random base62 shuffler added to platformId (D) as a 'XYZ' mask.
 *   This avoids having 4 constant characters, so ids can still be differentiated easily on same platform.
 *   For instance:
 *   platformId 384130 '1bve'
 *   can be turned into   '2awd' if mask is 'z0z'
 *   or                   '1bwf' if mask is '011'
 *
 * Example:
 * ast _ 2l7fQp s 1I3a 1gJYz2 I3a
 * A   B C      D E    F      G
 *
 * This makes it easy to sort by env code + platformId + (approximated) createdDate.
 * Note that ABC is 10-char long.
 *
 * 5 Built-in pieces of info (object, zone, liveEnv, platformId, timestamp) can have various use cases:
 * - Monitoring: provide help (e.g. missing publishable key) or qualify basic attacks
 * - Optimization: reject invalid keys as soon as touching our servers to avoid useless DB queries
 * - Analytics/Big data with ids only (e.g. date range aggregation for visualisation)
 *
 * @param {Object} [options]
 * @param {String} options.prefix - before default separator
 * @param {String} [options.separator='_'] - separator between the prefix and random chars
 * @param {String} [options.platformId]
 * @param {String} [options.env] - platform environment such as 'live'
 * @param {String} [options.platformZone=platformZones[0]]
 * @return {String}
 */
async function getObjectId ({
  prefix,
  separator = defaultSeparator,
  platformId,
  env = 'test',
  platformZone = platformZones[0]
} = {}) {
  if (typeof prefix !== 'string') {
    throw new Error('String prefix option expected')
  }

  const baseString = prefix ? prefix + separator : ''
  if (objectIdLength <= (4 / 3) * (baseString.length + platformPartLength)) {
    throw new Error('Length should be high enough to pad ID with random characters')
  }

  const randomCharsNeeded = getRandomCharsNeededInObjectId(baseString)

  const randomChars = await getRandomString(randomCharsNeeded)

  const base62Shuffler = randomChars.slice(-3)
  const encodedPlatformId = encodePlatformId({
    platformId,
    shuffler: base62Shuffler
  })
  const zone = formatPlatformZone({
    env,
    zone: platformZone
  })

  const encodedSecondsSinceEpoch = base62.encode(
    Math.round(Date.now() / 1000) + base62.decode(`${base62Shuffler}0`, base62Index),
    base62Index
  )

  return baseString + // AB
    randomChars.substring(0, randomChars.length - 3) + // C
    zone + // D
    encodedPlatformId + // E
    encodedSecondsSinceEpoch + // F
    base62Shuffler // G
}

function getRandomCharsNeededInObjectId (baseString) {
  return objectIdLength - baseString.length - platformPartLength - objectIdTimestampLength
}

/**
 * Encode platformId in base62 with optional “shuffler” (mask), that may be useful
 * to add some variation for easy ID differentiation.
 * @param {String} platformId
 * @param {String} [shuffler='000'] - 'XYZ' base62 string used as a mask
 * @param {String} [length=4]
 * @return {String} base62 encoded platformId
 */
function encodePlatformId ({
  platformId,
  shuffler = '000',
  length = encodedPlatformIdStringLength
}) {
  const platformIdInt = parseInt(platformId, 10)
  const hasDefaultLength = length === encodedPlatformIdStringLength
  if (!platformIdInt || (hasDefaultLength && platformIdInt > maxPlatformId)) {
    throw new Error(`Expect platformId to be a number in [1-${maxPlatformId}] range`)
  }

  const platformIdShifted = platformIdInt + platformIdBase
  const maskInteger = base62.decode(shuffler, base62Index)
  return base62.encode(platformIdShifted + maskInteger, base62Index)
}

/**
 * Upper-cased zone means we are in live environment.
 * @param  {Object} params
 * @param  {String} env - 'live' or 'test'
 * @param  {String} zone - one of allowed platform zones such as 'e'
 * @return {String}
 */
function formatPlatformZone ({ env, zone }) {
  if (typeof env !== 'string') throw new Error('String env expected')
  return env === 'live' ? zone.toUpperCase() : zone
}

function isLiveObjectId (zone) {
  return zone === zone.toUpperCase()
}

/**
 * Extracts platformId and timestamp from base62-encoded string + other basic info
 * Wrap in a try/catch since it can throw.
 * @param {String} objectId
 * @return {Object}
 */
function extractDataFromObjectId (objectId) {
  const splitObjectId = objectId.split(defaultSeparator)

  const object = splitObjectId[0]

  const baseString = splitObjectId[0] + defaultSeparator
  const randomCharsLength = getRandomCharsNeededInObjectId(baseString) - 3 // 1 trailing shuffler
  const encodedString = splitObjectId[splitObjectId.length - 1]
  const platformIdPart = encodedString.slice(randomCharsLength, randomCharsLength + platformPartLength)
  const shuffler = objectId.slice(-3)

  const platformId = extractEncodedPlatformId(platformIdPart, { shuffler })
  const zone = platformIdPart[0]
  const isLive = isLiveObjectId(zone)
  const timestamp = extractTimestampFromObjectId({ objectId, shuffler })

  return {
    object,
    platformId,
    zone,
    isLive,
    timestamp
  }
}

function extractTimestampFromObjectId ({ objectId, shuffler }) {
  const timestampPositionFromEnd = objectIdTimestampLength + shuffler.length
  const decodedSecondsSinceEpoch = base62.decode(
    objectId.slice(-timestampPositionFromEnd, -shuffler.length),
    base62Index
  ) - base62.decode(`${shuffler}0`, base62Index)

  return decodedSecondsSinceEpoch
}

/**
 * Extracts platformId from padded string of length platformPartLength.
 * Wrap in a try/catch since it can throw.
 * @param {String} encodedString
 * @param {String} [shuffler='000'] - 'XYZ' base62 string used as a mask
 * @param {String} [options.zone=platformZones[0]] - pass empty string to allow extraction without zone
 * @return {String}
 */
function extractEncodedPlatformId (encodedString, {
  shuffler = '000',
  zone = platformZones[0]
}) {
  const extractPlatformIdRegex = new RegExp(`${
    zone ? `[${platformZones.join('')}]` : ''
  }([a-zA-Z0-9]+)`, 'i')
  const matches = encodedString.match(extractPlatformIdRegex)
  if (!matches || matches.length < 1) {
    throw new Error(`Can’t extract platformId from ${encodedString}${
      shuffler ? ` with ${shuffler} shuffler` : ''
    } in ${zone} zone.`)
  }

  const arrangeInt = base62.decode(shuffler, base62Index) + platformIdBase
  const platformId = (base62.decode(matches[1], base62Index) - arrangeInt).toString()

  if (!isValidPlatformId(platformId)) {
    throw new Error(`Invalid platformId ${platformId}`)
  }

  return platformId
}

/**
 * Checks if `platformId` is valid, i.e. within appropriate range.
 * `platformId` is automatically parsed as an integer if string is passed.
 * @param {String|Number} - platformId
 * @return {Boolean}
 */
function isValidPlatformId (platformId) {
  const id = platformId ? parseInt(platformId, 10) : -1
  if (isNaN(id) || id < 0 || id > maxPlatformId) return false

  return true
}

/**
 * Generates a valid pseudo-random platformId
 * @return {String}
 */
function getRandomPlatformId () {
  const min = 1
  const max = maxPlatformId
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString()
}

/**
 * Returned extracted information from “public” platform ID like `e11` or `e11_live`,
 * containing info needed to locate the platform on infrastructure built with Stelace server.
 * Note that this function does not throw and rather sets `hasValidFormat` value to `false`
 * in returned object if `publicPlatformId` format is invalid.
 * @param  {String} publicPlatformId
 * @return {Object} `{ env, platformId, zone, hasValidFormat }`,
 *   `env` can be null if `_[env]` part is not provided in publicPlatformId
 */
function parsePublicPlatformId (publicPlatformId) {
  let hasValidFormat = false
  if (typeof publicPlatformId !== 'string') return { hasValidFormat }

  const parts = publicPlatformId.split('_')
  if (!parts.length || parts.length > 2) return { hasValidFormat }

  const zone = parts[0].charAt(0)
  const platformId = parts[0].slice(1)
  const env = parts[1] || null

  if (!platformZones.includes(zone)) return { hasValidFormat }
  if (!platformId || !isValidPlatformId(platformId)) return { hasValidFormat }

  hasValidFormat = [platformId, zone].every(i => !!i)

  return {
    env,
    platformId,
    zone,
    hasValidFormat
  }
}

module.exports = {
  getRandomString,
  getRandomStringRegex,
  padWithRandomChars,
  getObjectId,
  objectIdLength,
  encodePlatformId,
  extractDataFromObjectId,
  extractEncodedPlatformId,
  platformPartLength,
  formatPlatformZone,
  getRandomPlatformId,
  isValidPlatformId,
  parsePublicPlatformId,
  platformIdBase,
  maxPlatformId,
  platformZones,
  base62Chars
}
