import * as assert from 'assert'
import { describe, it } from 'mocha'
import * as vscode from 'vscode'
import {
	createGouseCodeAction,
	getGouseSourceFixAllKind,
	newGouseCodeActionProvider,
} from '../../codeActions'

const EXTENSION_ID = 'looshch.gouse'
const TOGGLE_COMMAND_ID = 'gouse.toggle'

interface CommandContribution {
	command?: string
	title?: string
}

interface ExtensionPackageJson {
	contributes?: {
		commands?: CommandContribution[]
	}
}

const waitForActivation = async (
	extension: vscode.Extension<unknown>,
	timeoutMs = 5_000,
): Promise<void> => {
	const startTime = Date.now()

	while (!extension.isActive) {
		if (Date.now() - startTime >= timeoutMs) {
			throw new Error('The extension did not activate in time.')
		}
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
}

const getToggleCommandTitle = (): string => {
	const extension = vscode.extensions.getExtension(EXTENSION_ID)
	if (!extension) {
		throw new Error(`Missing extension: ${EXTENSION_ID}`)
	}

	const packageJson = extension.packageJSON as ExtensionPackageJson
	const commandContribution = packageJson.contributes?.commands?.find(
		(command) => command.command === TOGGLE_COMMAND_ID,
	)
	if (!commandContribution?.title) {
		throw new Error(
			`Could not find title for command contribution: ${TOGGLE_COMMAND_ID}`,
		)
	}

	return commandContribution.title
}

const createDocumentWithUnusedVariable =
	async (): Promise<vscode.TextDocument> =>
		vscode.workspace.openTextDocument({
			language: 'go',
			content: 'package main\nfunc main() {\n\tvar unused int\n}\n',
		})

const createDocumentWithGouseTodo = async (): Promise<vscode.TextDocument> =>
	vscode.workspace.openTextDocument({
		language: 'go',
		content: 'package main\n/* TODO: gouse */\nfunc main() {}\n',
	})

const createUnusedDiagnostic = (): vscode.Diagnostic =>
	new vscode.Diagnostic(
		new vscode.Range(new vscode.Position(2, 5), new vscode.Position(2, 11)),
		'unused declared and not used',
		vscode.DiagnosticSeverity.Error,
	)

const createIrrelevantDiagnostic = (): vscode.Diagnostic =>
	new vscode.Diagnostic(
		new vscode.Range(new vscode.Position(2, 5), new vscode.Position(2, 11)),
		'some other diagnostic',
		vscode.DiagnosticSeverity.Warning,
	)

const assertGouseActionShape = (
	action: vscode.CodeAction,
	document: vscode.TextDocument,
	expectedKind: vscode.CodeActionKind,
	expectedTitle: string,
	diagnostics: readonly vscode.Diagnostic[],
): void => {
	assert.ok(action.command)
	assert.strictEqual(action.kind?.value, expectedKind.value)
	assert.strictEqual(action.title, expectedTitle)
	assert.strictEqual(action.command.command, TOGGLE_COMMAND_ID)
	assert.strictEqual(action.command.title, expectedTitle)
	assert.strictEqual(
		(action.command.arguments?.[0] as vscode.Uri | undefined)?.toString(),
		document.uri.toString(),
	)
	assert.deepStrictEqual(action.diagnostics, diagnostics)
}

const getProvidedActions = async (
	provider: vscode.CodeActionProvider,
	document: vscode.TextDocument,
	context: vscode.CodeActionContext,
): Promise<vscode.CodeAction[]> => {
	const cancellation = new vscode.CancellationTokenSource()
	const provided = provider.provideCodeActions(
		document,
		new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
		context,
		cancellation.token,
	)
	if (!provided) return []
	const resolved = await Promise.resolve(provided)
	if (!resolved) return []
	return resolved.filter(
		(item): item is vscode.CodeAction => item instanceof vscode.CodeAction,
	)
}

describe('gouse extension', () => {
	it('activates for Go files and registers the command', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID)
		if (!extension) {
			throw new Error(`Missing extension: ${EXTENSION_ID}`)
		}

		const document = await vscode.workspace.openTextDocument({
			language: 'go',
			content: 'package main\n',
		})
		await vscode.window.showTextDocument(document)
		await waitForActivation(extension)

		const commands = await vscode.commands.getCommands(true)
		assert.ok(commands.includes(TOGGLE_COMMAND_ID))
	})

	it('creates gouse code actions for both supported kinds', async () => {
		const expectedTitle = getToggleCommandTitle()
		const document = await createDocumentWithUnusedVariable()
		const diagnostic = createUnusedDiagnostic()
		const testCases = [
			{
				name: 'quick fix',
				kind: vscode.CodeActionKind.QuickFix,
			},
			{
				name: 'source fix all',
				kind: getGouseSourceFixAllKind(),
			},
		]

		for (const testCase of testCases) {
			const action = createGouseCodeAction(
				document,
				[diagnostic],
				testCase.kind,
			)
			if (!action) {
				throw new Error(
					`Expected a ${testCase.name} action for the unused variable diagnostic.`,
				)
			}
			assertGouseActionShape(action, document, testCase.kind, expectedTitle, [
				diagnostic,
			])
		}
	})

	it('returns no code action for unrelated diagnostics', async () => {
		const document = await createDocumentWithUnusedVariable()
		const action = createGouseCodeAction(
			document,
			[createIrrelevantDiagnostic()],
			vscode.CodeActionKind.QuickFix,
		)

		assert.strictEqual(action, undefined)
	})

	it('creates a code action when gouse TODO marker is present', async () => {
		const expectedTitle = getToggleCommandTitle()
		const document = await createDocumentWithGouseTodo()
		const action = createGouseCodeAction(
			document,
			[createIrrelevantDiagnostic()],
			vscode.CodeActionKind.QuickFix,
		)

		if (!action) {
			throw new Error('Expected a quick fix action for gouse TODO marker.')
		}
		assert.ok(action.command)
		assert.strictEqual(action.kind?.value, vscode.CodeActionKind.QuickFix.value)
		assert.strictEqual(action.title, expectedTitle)
		assert.strictEqual(action.command.command, TOGGLE_COMMAND_ID)
		assert.strictEqual(action.command.title, expectedTitle)
		assert.strictEqual(
			(action.command.arguments?.[0] as vscode.Uri | undefined)?.toString(),
			document.uri.toString(),
		)
		assert.strictEqual(action.diagnostics, undefined)
	})

	it('provider emits only quick fix actions when quick fix kind is requested', async () => {
		const expectedTitle = getToggleCommandTitle()
		const provider = newGouseCodeActionProvider()
		const document = await createDocumentWithUnusedVariable()
		const diagnostic = createUnusedDiagnostic()
		const collection = vscode.languages.createDiagnosticCollection(
			'gouse-test-provider-quickfix',
		)
		collection.set(document.uri, [diagnostic])

		try {
			const actions = await getProvidedActions(provider, document, {
				diagnostics: [diagnostic],
				only: vscode.CodeActionKind.QuickFix,
				triggerKind: vscode.CodeActionTriggerKind.Invoke,
			})
			assert.strictEqual(actions.length, 1)
			const firstAction = actions[0]
			if (!firstAction) {
				throw new Error('Expected one quick fix action.')
			}
			assertGouseActionShape(
				firstAction,
				document,
				vscode.CodeActionKind.QuickFix,
				expectedTitle,
				[diagnostic],
			)
		} finally {
			collection.dispose()
		}
	})

	it('provider emits quick fix action when gouse TODO marker is present', async () => {
		const expectedTitle = getToggleCommandTitle()
		const provider = newGouseCodeActionProvider()
		const document = await createDocumentWithGouseTodo()

		const actions = await getProvidedActions(provider, document, {
			diagnostics: [],
			only: vscode.CodeActionKind.QuickFix,
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
		})
		assert.strictEqual(actions.length, 1)
		const firstAction = actions[0]
		if (!firstAction) {
			throw new Error('Expected one quick fix action for gouse TODO marker.')
		}
		assert.ok(firstAction.command)
		assert.strictEqual(
			firstAction.kind?.value,
			vscode.CodeActionKind.QuickFix.value,
		)
		assert.strictEqual(firstAction.title, expectedTitle)
		assert.strictEqual(firstAction.command.command, TOGGLE_COMMAND_ID)
		assert.strictEqual(firstAction.command.title, expectedTitle)
		assert.strictEqual(
			(
				firstAction.command.arguments?.[0] as vscode.Uri | undefined
			)?.toString(),
			document.uri.toString(),
		)
		assert.strictEqual(firstAction.diagnostics, undefined)
	})

	it('provider emits only source fix all actions when source fix all kind is requested', async () => {
		const expectedTitle = getToggleCommandTitle()
		const provider = newGouseCodeActionProvider()
		const document = await createDocumentWithUnusedVariable()
		const diagnostic = createUnusedDiagnostic()
		const sourceFixAllKind = getGouseSourceFixAllKind()
		const collection = vscode.languages.createDiagnosticCollection(
			'gouse-test-provider-sourcefixall',
		)
		collection.set(document.uri, [diagnostic])

		try {
			const actions = await getProvidedActions(provider, document, {
				diagnostics: [diagnostic],
				only: sourceFixAllKind,
				triggerKind: vscode.CodeActionTriggerKind.Invoke,
			})
			assert.strictEqual(actions.length, 1)
			const firstAction = actions[0]
			if (!firstAction) {
				throw new Error('Expected one source fix all action.')
			}
			assertGouseActionShape(
				firstAction,
				document,
				sourceFixAllKind,
				expectedTitle,
				[diagnostic],
			)
		} finally {
			collection.dispose()
		}
	})
})
