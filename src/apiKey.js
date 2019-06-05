const {
  getRandomString,
  encodeMarketplaceId,
  extractEncodedMarketplaceId,
  marketplaceZones,
  formatMarketplaceZone,
  marketplacePartLength
} = require('./generator')

const builtInTypes = [
  'seck', // secret
  'pubk', // publishable
  'cntk', // content
  // DEPRECATED
  'sk', // secret
  'pk', // publishable
  'ck' // content
  // DEPRECATED:END
]

// TODO: detect zone from server environment region (AWS)
const marketplaceZone = marketplaceZones[0] // 'e'
const marketplacePartIndex = 12 // excludes 'type_env_' prefix
const keyLength = 32 // excludes 'type_env_' prefix
const typeMinLength = 4
const typeMaxLength = 10
const customTypeRegex = new RegExp(`^[a-z\\d]{5,${typeMaxLength}}$`, 'i')

/**
 * Generate API key with appropriate info and random characters
 * @param  {String} type - '(s|p|c)k' built-in type, or custom user type [a-z\d]{3,10}
 * @param  {String} env - either 'live' or 'test'
 * @param  {String} marketplaceId - Marketplace Id string integer
 * @param  {String} [zone='e'] - one of allowed zones such as 'e'
 * @return {String}
 */
async function generateKey ({ type, env, marketplaceId, zone = marketplaceZone }) {
  const validType = validateKeyType(type)

  if (typeof marketplaceId !== 'string') {
    throw new Error('Marketplace id is expected to be a string')
  }
  if (marketplaceId !== '' + parseInt(marketplaceId, 10)) {
    throw new Error('Marketplace id is expected to be a string integer')
  }
  if (typeof env !== 'string') {
    throw new Error('Environment is expected to be a string')
  }

  const baseString = `${validType.substring(0, typeMaxLength)}_${env}_`

  // Keep one char for marketplace zone
  const randomCharsNeeded = keyLength - marketplacePartLength
  const randomString = await getRandomString(randomCharsNeeded)
  const encodedMarketplaceId = encodeMarketplaceId({
    marketplaceId,
    shuffler: randomString.slice(-3)
  })

  const marketplaceString = formatMarketplaceZone({ env, zone }) + encodedMarketplaceId

  const str = baseString +
    randomString.substring(0, marketplacePartIndex) +
    marketplaceString +
    randomString.substring(marketplacePartIndex)

  return str
}

/**
 * Returned extracted information from API `key`. Note that it does not throw and rather sets
 * `hasValidFormat` value to false in returned object if `key` format is invalid.
 * @param  {String} key
 * @return {Object} `{ type, env, marketplaceId, zone, hasValidFormat }`
 */
function parseKey (key) {
  const parts = key.split('_')
  let hasValidFormat = false

  if (parts.length !== 3) return { hasValidFormat }

  let marketplaceId
  let type = parts[0]
  const env = parts[1]
  const randomString = parts[2]

  const zone = (randomString.charAt(marketplacePartIndex) || '').toLowerCase()
  const encodedMarketplaceId = randomString.slice(
    marketplacePartIndex,
    marketplacePartIndex + marketplacePartLength
  )
  const shuffler = randomString.slice(-3)

  try {
    type = validateKeyType(type)
    marketplaceId = extractEncodedMarketplaceId(encodedMarketplaceId, { shuffler })
  } catch (e) {}

  hasValidFormat = [type, env, marketplaceId, zone].every(i => !!i)

  // DEPRECATED: remove this after migration to longer prefixes
  if (type === 'pk') type = 'pubk'
  else if (type === 'sk') type = 'seck'
  else if (type === 'ck') type = 'cntk'
  // DEPRECATED:END

  return {
    type,
    env,
    marketplaceId,
    zone,
    hasValidFormat
  }
}

function validateKeyType (type) {
  if (!type || typeof type !== 'string') {
    throw new Error('ApiKey type is expected to be a string')
  }
  if (type.length <= typeMinLength && !builtInTypes.includes(type)) {
    throw new Error('Invalid ApiKey type')
  }
  if (type.length > typeMinLength && !customTypeRegex.test(type)) {
    throw new Error(`Custom ApiKey type must match ${customTypeRegex}`)
  }
  return type
}

function getBaseKey (key) {
  const parsedKey = parseKey(key)
  if (!parsedKey.hasValidFormat) return

  const {
    type,
    env
  } = parsedKey

  return `${type}_${env}_`
}

module.exports = {
  generateKey,
  parseKey,
  getBaseKey,

  builtInTypes,
  typeMaxLength,
  customTypeRegex
}
