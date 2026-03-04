import * as cp from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'

const README_URL = 'https://github.com/looshch/gouse-vsc#readme'
const INSTALL_ACTION = 'Install'
const OPEN_README_ACTION = 'Open README'
const OPEN_SETTINGS_ACTION = 'Open Settings'

interface ExecResult {
	stdout: string
	stderr: string
}

type ExecError = NodeJS.ErrnoException & {
	stderr?: string
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

const getConfiguredExecutablePath = (): string =>
	vscode.workspace.getConfiguration('gouse').get<string>('path', '').trim()

const getDefaultExecutableName = (): string => 'gouse'

const getPlatformBinaryName = (name: string): string =>
	process.platform === 'win32' ? `${name}.exe` : name

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

const getExecErrorMessage = (error: ExecError): string => {
	const stderr = error.stderr?.trim()
	return stderr ? stderr : error.message
}

const getResolvedExecutablePath = (): string => {
	const configuredExecutablePath = getConfiguredExecutablePath()
	if (configuredExecutablePath) return configuredExecutablePath

	return installedExecutablePath ?? getDefaultExecutableName()
}

const resolveTargetDocument = async (
	resource?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> => {
	if (!resource) return vscode.window.activeTextEditor?.document
	return vscode.workspace.openTextDocument(resource)
}

const validateTargetDocument = async (
	resource?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> => {
	const document = await resolveTargetDocument(resource)
	if (!document) {
		await vscode.window.showWarningMessage('Open a Go file to use gouse.')
		return undefined
	}
	if (document.languageId !== 'go') {
		await vscode.window.showWarningMessage('gouse only supports Go files.')
		return undefined
	}
	if (document.uri.scheme !== 'file') {
		await vscode.window.showWarningMessage(
			'gouse only supports files saved on disk.',
		)
		return undefined
	}
	return document
}

const runGouse = async (
	executablePath: string,
	targetPath: string,
): Promise<void> => {
	await execFile(executablePath, ['-w', targetPath])
}

const resolveInstalledPath = async (): Promise<string | undefined> => {
	try {
		const { stdout } = await execFile('go', ['env', 'GOBIN', 'GOPATH'])
		const [rawGoBin = '', rawGoPath = ''] = stdout.split(/\r?\n/)
		const goBin = rawGoBin.trim()
		if (goBin) return path.join(goBin, getPlatformBinaryName('gouse'))

		const goPath = rawGoPath.trim()
		if (!goPath) return undefined

		const firstGoPath = goPath.split(path.delimiter).find(Boolean)
		if (!firstGoPath) return undefined

		return path.join(firstGoPath, 'bin', getPlatformBinaryName('gouse'))
	} catch {
		return undefined
	}
}

const showConfiguredPathError = async (
	configuredPath: string,
): Promise<void> => {
	const action = await vscode.window.showErrorMessage(
		`The configured gouse.path does not point to an executable: ${configuredPath}`,
		OPEN_SETTINGS_ACTION,
	)
	if (action === OPEN_SETTINGS_ACTION) {
		await openExecutableSettings()
	}
}

const showInstallPrompt = async (): Promise<boolean> => {
	const action = await vscode.window.showErrorMessage(
		'gouse is not installed or is not available on PATH.',
		INSTALL_ACTION,
		OPEN_README_ACTION,
	)
	if (action === OPEN_README_ACTION) {
		await openReadme()
		return false
	}
	return action === INSTALL_ACTION
}

const installGouse = async (): Promise<string | undefined> => {
	try {
		await execFile('go', ['install', 'github.com/looshch/gouse@latest'])
	} catch (error) {
		const execError = error as ExecError
		const action = await vscode.window.showErrorMessage(
			isMissingExecutable(execError) ?
				'Go is not installed or is not available on PATH, so gouse could not be installed.'
			:	`Failed to install gouse: ${getExecErrorMessage(execError)}`,
			OPEN_README_ACTION,
		)
		if (action === OPEN_README_ACTION) {
			await openReadme()
		}
		return undefined
	}

	const installedPath = await resolveInstalledPath()
	if (installedPath) {
		installedExecutablePath = installedPath
		return installedPath
	}

	return getResolvedExecutablePath()
}

const runWithInstallFallback = async (targetPath: string): Promise<void> => {
	const configuredPath = getConfiguredExecutablePath()
	const executablePath = configuredPath || getResolvedExecutablePath()

	try {
		await runGouse(executablePath, targetPath)
		return
	} catch (error) {
		const execError = error as ExecError
		if (!isMissingExecutable(execError)) {
			await vscode.window.showErrorMessage(
				`gouse failed: ${getExecErrorMessage(execError)}`,
			)
			return
		}
		if (configuredPath) {
			await showConfiguredPathError(configuredPath)
			return
		}
	}

	const shouldInstall = await showInstallPrompt()
	if (!shouldInstall) return

	const installedPath = await installGouse()
	if (!installedPath) return

	try {
		await runGouse(installedPath, targetPath)
	} catch (error) {
		const execError = error as ExecError
		if (isMissingExecutable(execError)) {
			const action = await vscode.window.showErrorMessage(
				'gouse was installed, but the executable is still not reachable. Set gouse.path or add your Go bin directory to PATH.',
				OPEN_SETTINGS_ACTION,
			)
			if (action === OPEN_SETTINGS_ACTION) {
				await openExecutableSettings()
			}
			return
		}
		await vscode.window.showErrorMessage(
			`gouse failed after installation: ${getExecErrorMessage(execError)}`,
		)
	}
}

export async function toggle(resource?: vscode.Uri): Promise<void> {
	const document = await validateTargetDocument(resource)
	if (!document) return

	const wasSaved = await document.save()
	if (!wasSaved) {
		await vscode.window.showWarningMessage(
			'Save the file before running gouse.',
		)
		return
	}

	await runWithInstallFallback(document.uri.fsPath)
}
