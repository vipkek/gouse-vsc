import * as fs from 'fs'
import * as path from 'path'
import * as Mocha from 'mocha'

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'bdd',
		color: true,
	})

	return new Promise((resolve, reject) => {
		fs.readdir(__dirname, (error, files) => {
			if (error) {
				reject(error)
				return
			}

			for (const file of files) {
				if (file.endsWith('.test.js')) {
					mocha.addFile(path.resolve(__dirname, file))
				}
			}

			try {
				mocha.run((failures) => {
					if (failures > 0) {
						reject(new Error(`${String(failures)} tests failed.`))
						return
					}
					resolve()
				})
			} catch (runError) {
				reject(
					runError instanceof Error ? runError : (
						new Error('Failed to run the extension test suite.')
					),
				)
			}
		})
	})
}
