import * as assert from 'assert'
import { describe, it } from 'mocha'
import * as vscode from 'vscode'
import {
	_autoUpdateOnStartup as autoUpdateOnStartupWithDependencies,
	type AutoUpdateOnStartupParams as AutoUpdateOnStartupDependencies,
	_toggle as toggleWithDependencies,
	type ToggleParams as ToggleDependencies,
} from '../../gouse'

interface ExecCall {
	file: string
	args: readonly string[]
}

interface TestHarnessOptions {
	autoUpdateOnStartup?: boolean
	configuredPath?: string
	execFile: AutoUpdateOnStartupDependencies['execFile']
	resolveInstalledPath?: AutoUpdateOnStartupDependencies['resolveInstalledPath']
}

interface ToggleHarnessOptions {
	activeDocument?: vscode.TextDocument
	openedDocument?: vscode.TextDocument
}

const createExecError = (
	message: string,
	options: {
		code?: string
		stderr?: string
	} = {},
): NodeJS.ErrnoException & { stderr?: string } => {
	const error = new Error(message) as NodeJS.ErrnoException & {
		stderr?: string
	}
	if (options.code !== undefined) {
		error.code = options.code
	}
	if (options.stderr !== undefined) {
		error.stderr = options.stderr
	}
	return error
}

const createTestHarness = (options: TestHarnessOptions) => {
	const execCalls: ExecCall[] = []
	const warningMessages: string[] = []
	let resolveInstalledPathCalls = 0

	const dependencies: AutoUpdateOnStartupDependencies = {
		getConfiguredExecutablePath: () => options.configuredPath ?? '',
		getAutoUpdateOnStartup: () => options.autoUpdateOnStartup ?? true,
		execFile: async (file, args) => {
			execCalls.push({ file, args: [...args] })
			return await options.execFile(file, args)
		},
		resolveInstalledPath: async () => {
			resolveInstalledPathCalls += 1
			if (!options.resolveInstalledPath) return undefined
			return await options.resolveInstalledPath()
		},
		showWarningMessage: (message) => {
			warningMessages.push(message)
			return Promise.resolve(undefined)
		},
	}

	return {
		dependencies,
		execCalls,
		warningMessages,
		getResolveInstalledPathCalls: (): number => resolveInstalledPathCalls,
	}
}

const createDocumentDouble = (options: {
	languageId: string
	scheme: string
	saveResult: boolean
}): vscode.TextDocument => {
	const uri =
		options.scheme === 'file' ?
			vscode.Uri.file('/tmp/gouse-test.go')
		:	vscode.Uri.parse(`${options.scheme}:gouse-test.go`)
	return {
		languageId: options.languageId,
		uri,
		save: () => Promise.resolve(options.saveResult),
	} as unknown as vscode.TextDocument
}

const createToggleHarness = (options: ToggleHarnessOptions = {}) => {
	const warningMessages: string[] = []
	const errorMessages: string[] = []
	const execCalls: ExecCall[] = []

	const dependencies: ToggleDependencies = {
		getConfiguredExecutablePath: () => '',
		getResolvedExecutablePath: () => 'gouse',
		execFile: (file, args) => {
			execCalls.push({ file, args: [...args] })
			return Promise.resolve({ stdout: '', stderr: '' })
		},
		resolveInstalledPath: () => Promise.resolve(undefined),
		getActiveTextDocument: () => options.activeDocument,
		openTextDocument: () => {
			if (!options.openedDocument) {
				return Promise.reject(new Error('No opened document double provided'))
			}
			return Promise.resolve(options.openedDocument)
		},
		showWarningMessage: (message) => {
			warningMessages.push(message)
			return Promise.resolve(undefined)
		},
		showErrorMessage: (message) => {
			errorMessages.push(message)
			return Promise.resolve(undefined)
		},
		openReadme: () => Promise.resolve(),
		openExecutableSettings: () => Promise.resolve(),
	}

	return {
		dependencies,
		warningMessages,
		errorMessages,
		execCalls,
	}
}

describe('gouse startup auto-update', () => {
	it('does nothing when auto-update is disabled', async () => {
		const harness = createTestHarness({
			autoUpdateOnStartup: false,
			execFile: () => Promise.resolve({ stdout: '', stderr: '' }),
		})

		await autoUpdateOnStartupWithDependencies(harness.dependencies)

		assert.deepStrictEqual(harness.execCalls, [])
		assert.strictEqual(harness.getResolveInstalledPathCalls(), 0)
		assert.deepStrictEqual(harness.warningMessages, [])
	})

	it('does nothing when gouse.path is configured', async () => {
		const harness = createTestHarness({
			configuredPath: '/custom/tools/gouse',
			execFile: () => Promise.resolve({ stdout: '', stderr: '' }),
		})

		await autoUpdateOnStartupWithDependencies(harness.dependencies)

		assert.deepStrictEqual(harness.execCalls, [])
		assert.strictEqual(harness.getResolveInstalledPathCalls(), 0)
		assert.deepStrictEqual(harness.warningMessages, [])
	})

	it('skips update when gouse is not installed on PATH', async () => {
		const harness = createTestHarness({
			execFile: (file) => {
				if (file === 'gouse') {
					return Promise.reject(
						createExecError('gouse not found', { code: 'ENOENT' }),
					)
				}
				return Promise.reject(new Error(`Unexpected command: ${file}`))
			},
		})

		await autoUpdateOnStartupWithDependencies(harness.dependencies)

		assert.deepStrictEqual(harness.execCalls, [{ file: 'gouse', args: ['-v'] }])
		assert.strictEqual(harness.getResolveInstalledPathCalls(), 0)
		assert.deepStrictEqual(harness.warningMessages, [])
	})

	it('updates gouse when installed and resolves installed path', async () => {
		const harness = createTestHarness({
			execFile: (file, args) => {
				if (file === 'gouse' && args[0] === '-v') {
					return Promise.resolve({ stdout: 'gouse v0.6.0\n', stderr: '' })
				}
				if (
					file === 'go' &&
					args[0] === 'install' &&
					args[1] === 'github.com/looshch/gouse/v2@latest'
				) {
					return Promise.resolve({ stdout: '', stderr: '' })
				}
				return Promise.reject(
					new Error(`Unexpected command: ${file} ${args.join(' ')}`),
				)
			},
			resolveInstalledPath: () => Promise.resolve('/tmp/gobin/gouse'),
		})

		await autoUpdateOnStartupWithDependencies(harness.dependencies)

		assert.deepStrictEqual(harness.execCalls, [
			{ file: 'gouse', args: ['-v'] },
			{
				file: 'go',
				args: ['install', 'github.com/looshch/gouse/v2@latest'],
			},
		])
		assert.strictEqual(harness.getResolveInstalledPathCalls(), 1)
		assert.deepStrictEqual(harness.warningMessages, [])
	})

	it('shows a warning when auto-update fails', async () => {
		const harness = createTestHarness({
			execFile: (file, args) => {
				if (file === 'gouse' && args[0] === '-v') {
					return Promise.resolve({ stdout: 'gouse v0.6.0\n', stderr: '' })
				}
				if (
					file === 'go' &&
					args[0] === 'install' &&
					args[1] === 'github.com/looshch/gouse/v2@latest'
				) {
					return Promise.reject(
						createExecError('go install failed', {
							stderr: 'network timeout',
						}),
					)
				}
				return Promise.reject(
					new Error(`Unexpected command: ${file} ${args.join(' ')}`),
				)
			},
		})

		await autoUpdateOnStartupWithDependencies(harness.dependencies)

		assert.strictEqual(harness.warningMessages.length, 1)
		assert.ok(harness.warningMessages[0]?.includes('gouse auto-update failed:'))
		assert.ok(harness.warningMessages[0]?.includes('network timeout'))
		assert.strictEqual(harness.getResolveInstalledPathCalls(), 0)
	})
})

describe('gouse toggle validation', () => {
	it('shows a warning when no Go document is open', async () => {
		const harness = createToggleHarness()

		await toggleWithDependencies(undefined, harness.dependencies)

		assert.deepStrictEqual(harness.warningMessages, [
			'Open a Go file to use gouse.',
		])
		assert.deepStrictEqual(harness.errorMessages, [])
		assert.deepStrictEqual(harness.execCalls, [])
	})

	it('shows a warning for non-Go documents', async () => {
		const harness = createToggleHarness({
			activeDocument: createDocumentDouble({
				languageId: 'typescript',
				scheme: 'file',
				saveResult: true,
			}),
		})

		await toggleWithDependencies(undefined, harness.dependencies)

		assert.deepStrictEqual(harness.warningMessages, [
			'gouse only supports Go files.',
		])
		assert.deepStrictEqual(harness.errorMessages, [])
		assert.deepStrictEqual(harness.execCalls, [])
	})

	it('shows a warning for non-file documents', async () => {
		const harness = createToggleHarness({
			activeDocument: createDocumentDouble({
				languageId: 'go',
				scheme: 'untitled',
				saveResult: true,
			}),
		})

		await toggleWithDependencies(undefined, harness.dependencies)

		assert.deepStrictEqual(harness.warningMessages, [
			'gouse only supports files saved on disk.',
		])
		assert.deepStrictEqual(harness.errorMessages, [])
		assert.deepStrictEqual(harness.execCalls, [])
	})

	it('shows a warning when the document cannot be saved', async () => {
		const harness = createToggleHarness({
			activeDocument: createDocumentDouble({
				languageId: 'go',
				scheme: 'file',
				saveResult: false,
			}),
		})

		await toggleWithDependencies(undefined, harness.dependencies)

		assert.deepStrictEqual(harness.warningMessages, [
			'Save the file before running gouse.',
		])
		assert.deepStrictEqual(harness.errorMessages, [])
		assert.deepStrictEqual(harness.execCalls, [])
	})
})
