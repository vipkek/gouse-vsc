import * as path from 'path'
import { runTests } from '@vscode/test-electron'

const main = async (): Promise<void> => {
	const extensionDevelopmentPath = path.resolve(__dirname, '../../..')
	const extensionTestsPath = path.resolve(__dirname, './suite/index')

	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
	})
}

void main().catch((error: unknown) => {
	console.error(error)
	process.exit(1)
})
