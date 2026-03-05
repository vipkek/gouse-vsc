import * as cp from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'

const README_URL = 'https://github.com/vipkek/gouse-vsc#readme'
const GOUSE_MODULE_PATH = 'github.com/looshch/gouse/v2@latest'
const INSTALL_ACTION = 'Install'
const OPEN_README_ACTION = 'Open README'
const OPEN_SETTINGS_ACTION = 'Open Settings'
const AUTO_UPDATE_FAILURE_PREFIX = 'gouse auto-update failed:'
const DEFAULT_NAME = 'gouse'

interface ExecResult {
	stdout: string
	stderr: string
}

type ExecError = NodeJS.ErrnoException & {
	stderr?: string
}

export interface AutoUpdateOnStartupParams {
	getConfiguredExecutablePath: () => string
	getAutoUpdateOnStartup: () => boolean
	execFile: (
		file: string,
		args: readonly string[],
	) => Promise<{
		stdout: string
		stderr: string
	}>
	resolveInstalledPath: () => Promise<string | undefined>
	showWarningMessage: (message: string) => Thenable<unknown>
}

export interface ToggleParams {
	getConfiguredExecutablePath: () => string
	getResolvedExecutablePath: () => string
	execFile: (
		file: string,
		args: readonly string[],
	) => Promise<{
		stdout: string
		stderr: string
	}>
	resolveInstalledPath: () => Promise<string | undefined>
	getActiveTextDocument: () => vscode.TextDocument | undefined
	openTextDocument: (resource: vscode.Uri) => Thenable<vscode.TextDocument>
	showWarningMessage: (message: string) => Thenable<unknown>
	showErrorMessage: (
		message: string,
		...items: string[]
	) => Thenable<string | undefined>
	openReadme: () => Promise<void>
	openExecutableSettings: () => Promise<void>
}

let installedExecutablePath: string | undefined

const execFile = (file: string, args: readonly string[]): Promise<ExecResult> =>
	new Promise((resolve, reject) => {
		cp.execFile(
			file,
			args,
			{
				encoding: 'utf8',
				windowsHide: true,
			},
			(error, stdout, stderr) => {
				if (error) {
					const execError = error as ExecError
					execError.stderr = stderr
					reject(execError)
					return
				}
				resolve({ stdout, stderr })
			},
		)
	})

const getConfiguredGousePath = (): string =>
	vscode.workspace.getConfiguration('gouse').get<string>('path', '').trim()

const getAutoUpdateOnStartup = (): boolean =>
	vscode.workspace
		.getConfiguration('gouse')
		.get<boolean>('autoUpdateOnStartup', true)

const openReadme = async (): Promise<void> => {
	await vscode.env.openExternal(vscode.Uri.parse(README_URL))
}

const openExecutableSettings = async (): Promise<void> => {
	await vscode.commands.executeCommand(
		'workbench.action.openSettings',
		'gouse.path',
	)
}

const isMissingExecutable = (error: unknown): error is ExecError =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as ExecError).code === 'ENOENT'

const asExecError = (error: unknown): ExecError =>
	error instanceof Error ?
		(error as ExecError)
	:	(new Error(String(error)) as ExecError)

const getExecErrorMessage = (error: ExecError): string => {
	const stderr = error.stderr?.trim()
	return stderr ? stderr : error.message
}

const getAutoUpdateFailureMessage = (error: ExecError): string =>
	isMissingExecutable(error) ?
		`${AUTO_UPDATE_FAILURE_PREFIX} Go is not installed or is not available on PATH.`
	:	`${AUTO_UPDATE_FAILURE_PREFIX} ${getExecErrorMessage(error)}`

const getResolvedExecutablePath = (): string => {
	const configuredExecutablePath = getConfiguredGousePath()
	if (configuredExecutablePath) return configuredExecutablePath

	return installedExecutablePath ?? DEFAULT_NAME
}

const resolveInstalledPath = async (): Promise<string | undefined> => {
	const gouseExecutableFilename =
		process.platform === 'win32' ? `${DEFAULT_NAME}.exe` : DEFAULT_NAME
	try {
		const { stdout } = await execFile('go', ['env', 'GOBIN', 'GOPATH'])
		const [rawGoBin = '', rawGoPath = ''] = stdout.split(/\r?\n/)
		const goBin = rawGoBin.trim()
		if (goBin) return path.join(goBin, gouseExecutableFilename)

		const goPath = rawGoPath.trim()
		if (!goPath) return undefined

		const primaryGoPathEntry = goPath.split(path.delimiter).find(Boolean)
		if (!primaryGoPathEntry) return undefined

		return path.join(primaryGoPathEntry, 'bin', gouseExecutableFilename)
	} catch {
		return undefined
	}
}

export async function _autoUpdateOnStartup(
	params: AutoUpdateOnStartupParams,
): Promise<void> {
	if (!params.getAutoUpdateOnStartup()) return
	if (params.getConfiguredExecutablePath()) return

	try {
		await params.execFile(DEFAULT_NAME, ['-v'])
	} catch (error) {
		if (isMissingExecutable(error)) return
	}

	try {
		await params.execFile('go', ['install', GOUSE_MODULE_PATH])
	} catch (error) {
		const execError = asExecError(error)
		await params.showWarningMessage(getAutoUpdateFailureMessage(execError))
		return
	}

	const installedPath = await params.resolveInstalledPath()
	if (installedPath) {
		installedExecutablePath = installedPath
	}
}

export async function autoUpdateOnStartup(): Promise<void> {
	try {
		await _autoUpdateOnStartup({
			getConfiguredExecutablePath: getConfiguredGousePath,
			getAutoUpdateOnStartup,
			execFile,
			resolveInstalledPath,
			showWarningMessage: (message: string) =>
				vscode.window.showWarningMessage(message),
		})
	} catch (error) {
		const execError = asExecError(error)
		await vscode.window.showWarningMessage(
			getAutoUpdateFailureMessage(execError),
		)
	}
}

export async function _toggle(
	resource: vscode.Uri | undefined,
	params: ToggleParams,
): Promise<void> {
	const document =
		resource ?
			await params.openTextDocument(resource)
		:	params.getActiveTextDocument()
	if (!document) {
		await params.showWarningMessage('Open a Go file to use gouse.')
		return
	}
	if (document.languageId !== 'go') {
		await params.showWarningMessage('gouse only supports Go files.')
		return
	}
	if (document.uri.scheme !== 'file') {
		await params.showWarningMessage('gouse only supports files saved on disk.')
		return
	}

	const wasSaved = await document.save()
	if (!wasSaved) {
		await params.showWarningMessage('Save the file before running gouse.')
		return
	}

	const configuredPath = params.getConfiguredExecutablePath()
	const executablePath = configuredPath || params.getResolvedExecutablePath()

	try {
		await params.execFile(executablePath, ['-w', document.uri.fsPath])
		return
	} catch (error) {
		const execError = asExecError(error)
		if (!isMissingExecutable(execError)) {
			await params.showErrorMessage(
				`gouse failed: ${getExecErrorMessage(execError)}`,
			)
			return
		}
		if (configuredPath) {
			const action = await params.showErrorMessage(
				`The configured gouse.path does not point to an executable: ${configuredPath}`,
				OPEN_SETTINGS_ACTION,
			)
			if (action === OPEN_SETTINGS_ACTION) {
				await params.openExecutableSettings()
			}
			return
		}
	}

	const discoveredInstalledPath = await params.resolveInstalledPath()
	if (discoveredInstalledPath && discoveredInstalledPath !== executablePath) {
		try {
			await params.execFile(discoveredInstalledPath, [
				'-w',
				document.uri.fsPath,
			])
			installedExecutablePath = discoveredInstalledPath
			return
		} catch (error) {
			const execError = asExecError(error)
			if (!isMissingExecutable(execError)) {
				await params.showErrorMessage(
					`gouse failed: ${getExecErrorMessage(execError)}`,
				)
				return
			}
		}
	}

	const installAction = await params.showErrorMessage(
		'gouse is not installed or is not available on PATH.',
		INSTALL_ACTION,
		OPEN_README_ACTION,
	)
	if (installAction === OPEN_README_ACTION) {
		await params.openReadme()
		return
	}
	if (installAction !== INSTALL_ACTION) return

	try {
		await params.execFile('go', ['install', GOUSE_MODULE_PATH])
	} catch (error) {
		const execError = asExecError(error)
		const action = await params.showErrorMessage(
			isMissingExecutable(execError) ?
				'Go is not installed or is not available on PATH, so gouse could not be installed.'
			:	`Failed to install gouse: ${getExecErrorMessage(execError)}`,
			OPEN_README_ACTION,
		)
		if (action === OPEN_README_ACTION) {
			await params.openReadme()
		}
		return
	}

	const installedPath = await params.resolveInstalledPath()
	if (installedPath) {
		installedExecutablePath = installedPath
	}
	const executablePathAfterInstall =
		installedPath ?? params.getResolvedExecutablePath()

	try {
		await params.execFile(executablePathAfterInstall, [
			'-w',
			document.uri.fsPath,
		])
	} catch (error) {
		const execError = asExecError(error)
		if (isMissingExecutable(execError)) {
			const action = await params.showErrorMessage(
				'gouse was installed, but the executable is still not reachable. Set gouse.path or add your Go bin directory to PATH.',
				OPEN_SETTINGS_ACTION,
			)
			if (action === OPEN_SETTINGS_ACTION) {
				await params.openExecutableSettings()
			}
			return
		}
		await params.showErrorMessage(
			`gouse failed after installation: ${getExecErrorMessage(execError)}`,
		)
	}
}

export async function toggle(resource?: vscode.Uri): Promise<void> {
	await _toggle(resource, {
		getConfiguredExecutablePath: getConfiguredGousePath,
		getResolvedExecutablePath,
		execFile,
		resolveInstalledPath,
		getActiveTextDocument: () => vscode.window.activeTextEditor?.document,
		openTextDocument: (targetResource) =>
			vscode.workspace.openTextDocument(targetResource),
		showWarningMessage: (message: string) =>
			vscode.window.showWarningMessage(message),
		showErrorMessage: (message: string, ...items: string[]) =>
			vscode.window.showErrorMessage(message, ...items),
		openReadme,
		openExecutableSettings,
	})
}
