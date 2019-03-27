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

/** Lowercase single-char marketplace zones, mapping to server regions
 * @constant {Array}
 */
const marketplaceZones = ['e', 's']
if (!marketplaceZones.every((sep) => sep.length === 1 && sep === sep.toLowerCase())) {
  throw new Error('All marketplaceZones should have a single char')
}

const encodedMarketplaceIdStringLength = 4
const marketplacePartLength = encodedMarketplaceIdStringLength + 1 // including zone
const marketplaceIdBase = Math.pow(62, 3) - 1 // ensuring it is encoded in 4 chars
const maxMarketplaceId = Math.pow(62, 4) - 1 - base62.decode('zzz', base62Index) - marketplaceIdBase
// max 'z000' to allow masking up to '0zzz'

const objectIdLength = 24
// High enough to generate 14,000,000+ marketplaces
// with low collision risk each second across marketplace objects of the same type
// See https://github.com/stelace/stelace-core/pull/13 for math details
const objectIdTimestampLength = 6
// (Math.pow(62, 6) - 1) seconds from epoch is 3769-12-05T03:13:03.499Z

/**
 * Async function returning a random string, made of base64 chars except for '+' and '/'
 * replaced by 0.
 * replacePattern and replacementString can be provided but you
 * should make sure length remains the same after String.replace is run, since the function
 * only checks that replacementString is not empty if replacePattern is provided.
 *
 * http://blog.tompawlak.org/how-to-generate-random-values-nodejs-javascript
 * @param {Number} length - length to reach
 * @param {Object} [options]
 * @param {String} [options.prefix]
 * @param {String} [options.separator='_'] - separator between the prefix and random chars
 * @param {Regex|String} [options.replaceRegex] - to ban some chars from output
 * @param {String|Function} [options.replacement] - can’t be empty string
 * @return {String}
 */
async function getRandomString (length, {
  prefix = defaultPrefix,
  separator = defaultSeparator,
  replaceRegex,
  replacement
} = {}) {
  if (typeof prefix !== 'string' || typeof separator !== 'string') {
    throw new Error('String prefix options expected')
  }
  if (!!replaceRegex !== !!replacement) { // kind of XOR, can’t have 1 of 2 strings empty
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
  if (typeof prefix !== 'string' || typeof separator !== 'string') {
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
 * Async function returning a new objectId with model prefix, base-64 encoded marketplaceId
 * random chars, and some magic. Outputs 24-char object ids with 7 parts:
 *
 * - A: 3/4 char-long prefix (preferably 3 for numerous resources like ast or evt)
 * - B: underscore
 * - C: 5 or 6 random base62 equivalent chars generated by crypto module, 62^7 or 62^8 possibilities.
 * - D: server zone ('s' -> USA), uppercase if env is 'live'
 * - E: 4 chars dedicated to marketplaceId integer encoded in base62, and masked with G (see below)
 *   starting from '1000' = 238328 (62^3)
 *   up to 'z000' = 14776335 - 238327 = 14538008
 *   (in case shuffler reaches its max 'zzz' = 61*62^2 + 61*62^1 + 61*62^0 = 238327)
 *   which makes 14538008 - 238328 + 1 = 14299681 marketplaces…
 * - F: 6 chars for UNIX timestamp integer encoded in base 62
 *   (enough for more than 1000 years <sup>[1](#footnote1)</sup>)
 *   We use some masking again to ensure ids can be differentiated easily.
 * - G: 3 last chars are a random base62 shuffler added to marketplaceId (D) as a 'XYZ' mask.
 *   This avoids having 4 constant characters, so ids can still be differentiated easily on same marketplace.
 *   For instance:
 *   marketplaceId 384130 '1bve'
 *   can be turned into   '2awd' if mask is 'z0z'
 *   or                   '1bwf' if mask is '011'
 *
 * Example:
 * ast _ 2l7fQp s 1I3a 1gJYz2 I3a
 * A   B C      D E    F      G
 *
 * This makes it easy to sort by env code + marketplaceId + (approximated) createdDate.
 * Note that ABC is 10-char long.
 *
 * 5 Built-in pieces of info (object, zone, liveEnv, marketplaceId, timestamp) can have various use cases:
 * - Analytics/Big data with ids only (e.g. date range aggregation for visualisation, or billing)
 * - Monitoring/security to qualify attacks or provide help (e.g. missing public key)
 * - Optimization: reject invalid keys as soon as touching our servers rather avoiding DB queries
 *
 * @param {Object} [options]
 * @param {String} options.prefix - before default separator
 * @param {String} [options.separator='_'] - separator between the prefix and random chars
 * @param {String} [options.marketplaceId]
 * @param {String} [options.env] - marketplace environment such as 'live'
 * @param {String} [options.marketplaceZone=marketplaceZones[0]]
 * @return {String}
 */
async function getObjectId ({
  prefix,
  separator = defaultSeparator,
  marketplaceId,
  env = 'test',
  marketplaceZone = marketplaceZones[0]
} = {}) {
  if (typeof prefix !== 'string') {
    throw new Error('String prefix option expected')
  }

  let baseString = prefix ? prefix + separator : ''
  if (objectIdLength <= (4 / 3) * (baseString.length + marketplacePartLength)) {
    throw new Error('Length should be high enough to pad ID with random characters')
  }

  const randomCharsNeeded = getRandomCharsNeededInObjectId(baseString)

  const randomChars = await getRandomString(randomCharsNeeded)

  const base62Shuffler = randomChars.slice(-3)
  const encodedMarketplaceId = encodeMarketplaceId({
    marketplaceId,
    shuffler: base62Shuffler
  })
  const zone = formatMarketplaceZone({
    env,
    zone: marketplaceZone
  })

  const encodedSecondsSinceEpoch = base62.encode(
    Math.round(Date.now() / 1000) + base62.decode(`${base62Shuffler}0`, base62Index),
    base62Index
  )

  return baseString + // AB
    randomChars.substring(0, randomChars.length - 3) + // C
    zone + // D
    encodedMarketplaceId + // E
    encodedSecondsSinceEpoch + // F
    base62Shuffler // G
}

function getRandomCharsNeededInObjectId (baseString) {
  return objectIdLength - baseString.length - marketplacePartLength - objectIdTimestampLength
}

/**
 * Encode marketplaceId in base62 with optional “shuffler” (mask), that may be useful
 * to add some variation for easy ID differentiation.
 * @param {String} marketplaceId
 * @param {String} [shuffler='000'] - 'XYZ' base62 string used as a mask
 * @param {String} [length=4]
 * @return {String} base62 encoded marketplaceId
 */
function encodeMarketplaceId ({
  marketplaceId,
  shuffler = '000',
  length = encodedMarketplaceIdStringLength
}) {
  const marketplaceIdInt = parseInt(marketplaceId, 10)
  const hasDefaultLength = length === encodedMarketplaceIdStringLength
  if (!marketplaceIdInt || (hasDefaultLength && marketplaceIdInt > maxMarketplaceId)) {
    throw new Error(`Expect marketplaceId to be a number in [1-${maxMarketplaceId}] range`)
  }

  const marketplaceIdShifted = marketplaceIdInt + marketplaceIdBase
  const maskInteger = base62.decode(shuffler, base62Index)
  return base62.encode(marketplaceIdShifted + maskInteger, base62Index)
}

function formatMarketplaceZone ({ env, zone }) {
  if (typeof env !== 'string') throw new Error('String env expected')
  return env === 'live' ? zone.toUpperCase() : zone
}

function isLiveObjectId (zone) {
  return zone === zone.toUpperCase()
}

/**
 * Extracts marketplaceId and timestamp from base62-encoded string + other basic info
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
  const marketplaceIdPart = encodedString.slice(randomCharsLength, randomCharsLength + marketplacePartLength)
  const shuffler = objectId.slice(-3)

  const marketplaceId = extractEncodedMarketplaceId(marketplaceIdPart, { shuffler })
  const zone = marketplaceIdPart[0]
  const isLive = isLiveObjectId(zone)
  const timestamp = extractTimestampFromObjectId({ objectId, shuffler })

  return {
    object,
    marketplaceId,
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
 * Extracts marketplaceId from padded string of length marketplacePartLength.
 * Wrap in a try/catch since it can throw.
 * @param {String} encodedString
 * @param {String} [shuffler='000'] - 'XYZ' base62 string used as a mask
 * @param {String} [options.zone=marketplaceZones[0]] - pass empty string to allow extraction without zone
 * @return {String}
 */
function extractEncodedMarketplaceId (encodedString, {
  shuffler = '000',
  zone = marketplaceZones[0]
}) {
  const extractMarketplaceIdRegex = new RegExp(`${
    zone ? `[${marketplaceZones.join('')}]` : ''
  }([a-zA-Z0-9]+)`, 'i')
  const matches = encodedString.match(extractMarketplaceIdRegex)
  if (!matches || matches.length < 1) {
    throw new Error(`Can’t extract marketplaceId from ${encodedString}${
      shuffler ? ` with ${shuffler} shuffler` : ''
    } in ${zone} zone.`)
  }

  const arrangeInt = base62.decode(shuffler, base62Index) + marketplaceIdBase
  const marketplaceId = (base62.decode(matches[1], base62Index) - arrangeInt).toString()

  if (!marketplaceId || parseInt(marketplaceId, 10) > maxMarketplaceId) {
    throw new Error(`Invalid marketplaceId ${marketplaceId}`)
  }

  return marketplaceId
}

/**
 * Generates a valid pseudo-random marketplaceId
 * @return {String}
 */
function getRandomMarketplaceId () {
  const min = 1
  const max = maxMarketplaceId
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString()
}

module.exports = {
  getRandomString,
  getRandomStringRegex,
  padWithRandomChars,
  getObjectId,
  objectIdLength,
  encodeMarketplaceId,
  extractDataFromObjectId,
  extractEncodedMarketplaceId,
  marketplacePartLength,
  formatMarketplaceZone,
  getRandomMarketplaceId,
  marketplaceIdBase,
  maxMarketplaceId,
  marketplaceZones,
  base62Chars
}
