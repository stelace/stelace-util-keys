[![CircleCI](https://circleci.com/gh/stelace/stelace-util-keys.svg?style=svg&circle-token=97389301ee98438504e639c138922ca4f44caf21)](https://circleci.com/gh/stelace/stelace-util-keys)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)

# stelace-util-keys

Checking and generating [Stelace server](https://github.com/stelace/stelace) object IDs, keys or other identifiers using random characters and some tricks.

## Some math about ID collision

Supposing we are able to generate 10 000 objects per second, of the same type, say asset (`ast_` prefix), in the same platform and environment, the probability to have an ID collision during such a _single second_ is roughly `Math.pow(10000, 2)/(2 * Math.pow(62, 9))` = 4e-9 ([Birthday problem](https://en.wikipedia.org/wiki/Birthday_problem)), since we have 9 random chars available for `ast` IDs, including “shuffler” part (called `G` in JSDoc comment in [generator.js](/src/generator.js)).

In other words, supposing we’re able to constantly generate 10 000 objects _per second_ in the same table, and using a geometrical law with the probability of collision we’ve just computed, we will statistically have a collision after 2.7e8 seconds, or more than 8 years of _constant heavy load_ and 2500 billion objects generated (let’s imagine it’s a bulk upload…).

Quite an acceptable risk of generating a single 500 error.
