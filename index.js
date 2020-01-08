const apiKey = require('./src/apiKey')
const generator = require('./src/generator')

module.exports.apiKey = apiKey
module.exports.generator = generator

// Also expose functions directly for convenience
for (const f in apiKey) module.exports[f] = apiKey[f]
for (const f in generator) module.exports[f] = generator[f]
