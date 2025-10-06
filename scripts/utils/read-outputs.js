const fs = require('fs').promises
const path = require('path')

/**
 * Read the outputs.json file and return the outputs as an object
 */ 
async function readOutputs() {
  try {
  const outputContents = await fs.readFile(path.join(__dirname, '../..', 'outputs.json'), 'utf8')
  return JSON.parse(outputContents).reduce((acc, output) => {
      acc[output.OutputKey] = output.OutputValue
      return acc
    }, {})
  } catch (error) {
    return {}
  }
}

module.exports = { readOutputs }