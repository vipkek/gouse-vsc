import * as assert from 'assert'
import { describe, it } from 'mocha'
import * as vscode from 'vscode'
import {
	createGouseQuickFix,
	createGouseSourceFixAll,
	getGouseSourceFixAllKind,
} from '../../codeActions'

const EXTENSION_ID = 'looshch.gouse'

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
		assert.ok(commands.includes('gouse.toggle'))
	})

	it('creates a quick fix for declared and not used diagnostics', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'go',
			content: 'package main\nfunc main() {\n\tvar unused int\n}\n',
		})
		const diagnostic = new vscode.Diagnostic(
			new vscode.Range(new vscode.Position(2, 5), new vscode.Position(2, 11)),
			'unused declared and not used',
			vscode.DiagnosticSeverity.Error,
		)

		const action = createGouseQuickFix(document, [diagnostic])
		if (!action) {
			throw new Error(
				'Expected a quick fix for the unused variable diagnostic.',
			)
		}
		if (!action.command) {
			throw new Error('Expected the quick fix to invoke the gouse command.')
		}

		assert.strictEqual(action.kind?.value, vscode.CodeActionKind.QuickFix.value)
		assert.strictEqual(action.command.command, 'gouse.toggle')
		assert.strictEqual(
			(action.command.arguments?.[0] as vscode.Uri | undefined)?.toString(),
			document.uri.toString(),
		)
		assert.deepStrictEqual(action.diagnostics, [diagnostic])
	})

	it('creates a source fix all action for declared and not used diagnostics', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'go',
			content: 'package main\nfunc main() {\n\tvar unused int\n}\n',
		})
		const diagnostic = new vscode.Diagnostic(
			new vscode.Range(new vscode.Position(2, 5), new vscode.Position(2, 11)),
			'unused declared and not used',
			vscode.DiagnosticSeverity.Error,
		)

		const action = createGouseSourceFixAll(document, [diagnostic])
		if (!action) {
			throw new Error(
				'Expected a source fix all action for the unused variable diagnostic.',
			)
		}
		if (!action.command) {
			throw new Error(
				'Expected the source fix all action to invoke the gouse command.',
			)
		}

		assert.strictEqual(action.kind?.value, getGouseSourceFixAllKind().value)
		assert.strictEqual(action.command.command, 'gouse.toggle')
		assert.strictEqual(
			(action.command.arguments?.[0] as vscode.Uri | undefined)?.toString(),
			document.uri.toString(),
		)
		assert.deepStrictEqual(action.diagnostics, [diagnostic])
	})
})
