import * as vscode from 'vscode'

const UNUSED_DIAGNOSTIC_FRAGMENT = 'declared and not used'

const createSourceFixAllKind = (): vscode.CodeActionKind =>
	vscode.CodeActionKind.SourceFixAll.append('gouse')

const getMatchingDiagnostics = (
	diagnostics: readonly vscode.Diagnostic[],
): vscode.Diagnostic[] =>
	diagnostics.filter((diagnostic) =>
		diagnostic.message.includes(UNUSED_DIAGNOSTIC_FRAGMENT),
	)

export function createGouseQuickFix(
	document: vscode.TextDocument,
	diagnostics: readonly vscode.Diagnostic[],
): vscode.CodeAction | undefined {
	const matchingDiagnostics = getMatchingDiagnostics(diagnostics)
	if (matchingDiagnostics.length === 0) return undefined

	const action = new vscode.CodeAction(
		'Apply gouse to fix unused variables in this file',
		vscode.CodeActionKind.QuickFix,
	)
	action.command = {
		command: 'gouse.toggle',
		title: 'Apply gouse',
		arguments: [document.uri],
	}
	action.diagnostics = matchingDiagnostics
	return action
}

export function createGouseSourceFixAll(
	document: vscode.TextDocument,
	diagnostics: readonly vscode.Diagnostic[],
): vscode.CodeAction | undefined {
	const matchingDiagnostics = getMatchingDiagnostics(diagnostics)
	if (matchingDiagnostics.length === 0) return undefined

	const action = new vscode.CodeAction(
		'Fix all unused variables in this file with gouse',
		createSourceFixAllKind(),
	)
	action.command = {
		command: 'gouse.toggle',
		title: 'Fix all unused variables with gouse',
		arguments: [document.uri],
	}
	action.diagnostics = matchingDiagnostics
	return action
}

const shouldProvideQuickFix = (
	kind: vscode.CodeActionKind | undefined,
): boolean =>
	kind === undefined || kind.contains(vscode.CodeActionKind.QuickFix)

const shouldProvideSourceFixAll = (
	kind: vscode.CodeActionKind | undefined,
): boolean => kind?.contains(createSourceFixAllKind()) ?? false

class GouseCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = []

		if (shouldProvideQuickFix(context.only)) {
			const quickFix = createGouseQuickFix(document, context.diagnostics)
			if (quickFix) actions.push(quickFix)
		}

		if (shouldProvideSourceFixAll(context.only)) {
			const fileDiagnostics = vscode.languages.getDiagnostics(document.uri)
			const sourceFixAll = createGouseSourceFixAll(document, fileDiagnostics)
			if (sourceFixAll) actions.push(sourceFixAll)
		}

		return actions
	}
}

export function createGouseCodeActionProvider(): vscode.CodeActionProvider {
	return new GouseCodeActionProvider()
}

export function getGouseSourceFixAllKind(): vscode.CodeActionKind {
	return createSourceFixAllKind()
}
