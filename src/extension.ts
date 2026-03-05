import * as vscode from 'vscode'
import {
	newGouseCodeActionProvider,
	getGouseSourceFixAllKind,
} from './codeActions'
import { autoUpdateOnStartup, toggle } from './gouse'

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('gouse.toggle', toggle),
		vscode.languages.registerCodeActionsProvider(
			{ language: 'go', scheme: 'file' },
			newGouseCodeActionProvider(),
			{
				providedCodeActionKinds: [
					vscode.CodeActionKind.QuickFix,
					getGouseSourceFixAllKind(),
				],
			},
		),
	)

	void autoUpdateOnStartup()
}
