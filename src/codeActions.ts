import * as vscode from 'vscode'

const UNUSED_DIAGNOSTIC_FRAGMENT = 'declared and not used'
const ACTION_TITLE = 'gouse: Toggle ‘declared and not used’ errors'

const createSourceFixAllKind = (): vscode.CodeActionKind =>
	vscode.CodeActionKind.SourceFixAll.append('gouse')

export function createGouseCodeAction(
	document: vscode.TextDocument,
	diagnostics: readonly vscode.Diagnostic[],
	kind: vscode.CodeActionKind,
): vscode.CodeAction | undefined {
	const matchingDiagnostics = diagnostics.filter((diagnostic) =>
		diagnostic.message.includes(UNUSED_DIAGNOSTIC_FRAGMENT),
	)
	if (matchingDiagnostics.length === 0) return undefined

	const action = new vscode.CodeAction(ACTION_TITLE, kind)
	action.command = {
		command: 'gouse.toggle',
		title: ACTION_TITLE,
		arguments: [document.uri],
	}
	action.diagnostics = matchingDiagnostics
	return action
}

class GouseCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		_: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = []

		if (
			context.only === undefined ||
			context.only.contains(vscode.CodeActionKind.QuickFix)
		) {
			const quickFix = createGouseCodeAction(
				document,
				context.diagnostics,
				vscode.CodeActionKind.QuickFix,
			)
			if (quickFix) actions.push(quickFix)
		}

		const sourceFixAllKind = createSourceFixAllKind()
		if (context.only?.contains(sourceFixAllKind) ?? false) {
			const fileDiagnostics = vscode.languages.getDiagnostics(document.uri)
			const sourceFixAll = createGouseCodeAction(
				document,
				fileDiagnostics,
				sourceFixAllKind,
			)
			if (sourceFixAll) actions.push(sourceFixAll)
		}

		return actions
	}
}

export function newGouseCodeActionProvider(): vscode.CodeActionProvider {
	return new GouseCodeActionProvider()
}

export function getGouseSourceFixAllKind(): vscode.CodeActionKind {
	return createSourceFixAllKind()
}
