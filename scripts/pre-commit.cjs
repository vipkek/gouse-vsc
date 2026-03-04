const fs = require('fs')
const path = require('path')
const cp = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const prettierPath = path.join(
	projectRoot,
	'node_modules',
	'prettier',
	'bin',
	'prettier.cjs',
)
const eslintPath = path.join(
	projectRoot,
	'node_modules',
	'eslint',
	'bin',
	'eslint.js',
)
const lintableExtensions = new Set([
	'.js',
	'.cjs',
	'.mjs',
	'.ts',
	'.mts',
	'.cts',
])

const run = (file, args) => {
	cp.execFileSync(file, args, {
		cwd: projectRoot,
		stdio: 'inherit',
	})
}

const stagedFilesOutput = cp.execFileSync(
	'git',
	['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
	{
		cwd: projectRoot,
		encoding: 'utf8',
	},
)

const stagedFiles = stagedFilesOutput
	.split('\0')
	.filter(Boolean)
	.filter((filePath) => !filePath.startsWith('.husky/'))
	.filter((filePath) => fs.existsSync(path.join(projectRoot, filePath)))

if (stagedFiles.length === 0) process.exit(0)

run(process.execPath, [
	prettierPath,
	'--write',
	'--ignore-unknown',
	...stagedFiles,
])

const lintableFiles = stagedFiles.filter((filePath) =>
	lintableExtensions.has(path.extname(filePath)),
)

if (lintableFiles.length > 0) {
	run(process.execPath, [eslintPath, '--fix', ...lintableFiles])
}

run('git', ['add', '--', ...stagedFiles])
