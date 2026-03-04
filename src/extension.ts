import * as vscode from 'vscode'
import {
	createGouseCodeActionProvider,
	getGouseSourceFixAllKind,
} from './codeActions'
import { toggle } from './gouse'

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('gouse.toggle', toggle),
		vscode.languages.registerCodeActionsProvider(
			{ language: 'go', scheme: 'file' },
			createGouseCodeActionProvider(),
			{
				providedCodeActionKinds: [
					vscode.CodeActionKind.QuickFix,
					getGouseSourceFixAllKind(),
				],
			},
		),
	)
}
