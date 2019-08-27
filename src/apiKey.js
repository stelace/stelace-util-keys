const {
  getRandomString,
  encodePlatformId,
  extractEncodedPlatformId,
  platformZones,
  formatPlatformZone,
  platformPartLength
} = require('./generator')

const builtInTypes = [
  'seck', // secret
  'pubk', // publishable
  'cntk' // content
]

// TODO: detect zone from server environment region (AWS)
const platformZone = platformZones[0] // using 'e' as default
const platformPartIndex = 12 // excludes 'type_env_' prefix
const keyLength = 32 // excludes 'type_env_' prefix
const typeMinLength = 4
const typeMaxLength = 10
const customTypeRegex = new RegExp(`^[a-z\\d]{5,${typeMaxLength}}$`, 'i')

/**
 * Generate API key with appropriate info and random characters
 * @param  {String} type - '(sec|pub)k' built-in type, or custom user type [a-z\d]{5,10}
 * @param  {String} env - either 'live' or 'test'
 * @param  {String} platformId - Platform Id string integer
 * @param  {String} [zone='e'] - one of allowed zones such as 'e'
 * @return {String}
 */
async function generateKey ({ type, env, platformId, zone = platformZone }) {
  const validType = validateKeyType(type)

  if (typeof platformId !== 'string') {
    throw new Error('Platform id is expected to be a string')
  }
  if (platformId !== '' + parseInt(platformId, 10)) {
    throw new Error('Platform id is expected to be a string integer')
  }
  if (typeof env !== 'string') {
    throw new Error('Environment is expected to be a string')
  }

  const baseString = `${validType.substring(0, typeMaxLength)}_${env}_`

  // Keep one char for platform zone
  const randomCharsNeeded = keyLength - platformPartLength
  const randomString = await getRandomString(randomCharsNeeded)
  const encodedPlatformId = encodePlatformId({
    platformId,
    shuffler: randomString.slice(-3)
  })

  const platformString = formatPlatformZone({ env, zone }) + encodedPlatformId

  const str = baseString +
    randomString.substring(0, platformPartIndex) +
    platformString +
    randomString.substring(platformPartIndex)

  return str
}

/**
 * Returned extracted information from API `key`. Note that it does not throw and rather sets
 * `hasValidFormat` value to false in returned object if `key` format is invalid.
 * @param  {String} key
 * @return {Object} `{ type, env, platformId, zone, hasValidFormat }`
 */
function parseKey (key) {
  let hasValidFormat = false
  if (typeof key !== 'string') return { hasValidFormat }

  const parts = key.split('_')
  if (parts.length !== 3) return { hasValidFormat }

  let platformId
  let type = parts[0]
  const env = parts[1]
  const randomString = parts[2]

  const zone = (randomString.charAt(platformPartIndex) || '').toLowerCase()
  const encodedPlatformId = randomString.slice(
    platformPartIndex,
    platformPartIndex + platformPartLength
  )
  const shuffler = randomString.slice(-3)

  try {
    type = validateKeyType(type)
    platformId = extractEncodedPlatformId(encodedPlatformId, { shuffler })
  } catch (e) {}

  hasValidFormat = [type, env, platformId, zone].every(i => !!i)

  return {
    type,
    env,
    platformId,
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
