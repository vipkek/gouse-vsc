import { runTests } from '@vscode/test-electron'
import { run as runSuite } from '@test/suite/index'

const main = async (): Promise<void> => {
	const extensionTestsModule = Object.values(require.cache).find(
		(
			entry,
		): entry is NodeModule & {
			exports: { run?: unknown }
		} => {
			if (entry === undefined) return false
			const moduleExports: unknown = entry.exports
			if (typeof moduleExports !== 'object' || moduleExports === null) {
				return false
			}
			return (moduleExports as { run?: unknown }).run === runSuite
		},
	)
	if (!extensionTestsModule) {
		throw new Error('Could not resolve compiled extension tests path.')
	}
	const extensionDevelopmentPath = process.cwd()
	const extensionTestsPath = extensionTestsModule.filename

	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
	})
}

void main().catch((error: unknown) => {
	console.error(error)
	process.exit(1)
})
