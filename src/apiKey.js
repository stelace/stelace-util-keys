const {
  getRandomString,
  encodeMarketplaceId,
  extractEncodedMarketplaceId,
  marketplaceZones,
  formatMarketplaceZone,
  marketplacePartLength
} = require('./generator')

const listTypes = [
  'sk',
  'pk'
]

// TODO: detect zone from server environment region (AWS)
const marketplaceZone = marketplaceZones[0] // 'e'
const marketplacePartIndex = 20
const keyLength = 32

async function generateKey ({ type, env, marketplaceId, zone = marketplaceZone }) {
  if (!listTypes.includes(type)) {
    throw new Error('Invalid type')
  }
  if (typeof marketplaceId !== 'string') {
    throw new Error('Marketplace id is expected to be a string')
  }
  if (marketplaceId !== '' + parseInt(marketplaceId, 10)) {
    throw new Error('Marketplace id is expected to be a string integer')
  }
  if (typeof env !== 'string') {
    throw new Error('Environment is expected to be a string')
  }

  const baseString = type + '_' + env + '_'

  // Keep one char for marketplace zone
  const randomCharsNeeded = keyLength - marketplacePartLength - baseString.length
  const randomString = await getRandomString(randomCharsNeeded)
  const encodedMarketplaceId = encodeMarketplaceId({
    marketplaceId,
    shuffler: randomString.slice(-3)
  })

  const marketplaceString = formatMarketplaceZone({ env, zone }) + encodedMarketplaceId

  const breakRandomStringIndex = marketplacePartIndex - baseString.length
  const str = baseString +
    randomString.substring(0, breakRandomStringIndex) +
    marketplaceString +
    randomString.substring(breakRandomStringIndex)

  return str
}

function parseKey (key) {
  const parts = key.split('_')

  if (parts.length !== 3) {
    return
  }

  const type = parts[0]
  const env = parts[1]
  const randomString = parts[2]

  if (!listTypes.includes(type)) {
    return
  }

  const zone = (key.charAt(marketplacePartIndex) || '').toLowerCase()
  const encodedMarketplaceId = key.slice(
    marketplacePartIndex,
    marketplacePartIndex + marketplacePartLength
  )
  const shuffler = randomString.slice(-3)

  const marketplaceId = extractEncodedMarketplaceId(encodedMarketplaceId, { shuffler })

  return {
    type,
    env,
    marketplaceId,
    zone
  }
}

function getBaseKey (key) {
  const parsedKey = parseKey(key)
  if (!parsedKey) return

  const {
    type,
    env
  } = parsedKey

  return type + '_' + env + '_'
}

module.exports = {
  generateKey,
  parseKey,
  getBaseKey
}
