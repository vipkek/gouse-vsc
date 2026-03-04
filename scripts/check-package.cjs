const fs = require('fs')
const path = require('path')
const Module = require('module')

const projectRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.join(projectRoot, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const mainPath = path.resolve(projectRoot, packageJson.main)

if (!fs.existsSync(mainPath)) {
	throw new Error(`Missing extension entrypoint: ${packageJson.main}`)
}

const originalLoad = Module._load
let exportsObject

try {
	Module._load = function load(request, parent, isMain) {
		if (request === 'vscode') return {}
		return originalLoad.call(this, request, parent, isMain)
	}
	exportsObject = require(mainPath)
} finally {
	Module._load = originalLoad
}

if (typeof exportsObject?.activate !== 'function') {
	throw new Error('The extension entrypoint must export an activate function.')
}

console.log('Package entrypoint looks valid.')
