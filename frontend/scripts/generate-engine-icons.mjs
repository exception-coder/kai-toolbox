import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const frontendRoot = new URL('../', import.meta.url)
const outputDirectory = new URL('src/features/claude-chat/assets/icons/', frontendRoot)
const selectedIcons = {
  ri: ['RiOpenaiFill'],
  si: ['SiClaude', 'SiDeepseek', 'SiGoogle', 'SiOpencode', 'SiQwen'],
}

async function generateIcons() {
  const metadata = JSON.parse(await readFile(new URL('node_modules/react-icons/package.json', frontendRoot), 'utf8'))
  const declarations = []
  for (const [collection, names] of Object.entries(selectedIcons)) {
    const source = await readFile(new URL(`node_modules/react-icons/${collection}/index.mjs`, frontendRoot), 'utf8')
    for (const name of names) {
      const match = new RegExp(`export function ${name} \\(props\\) \\{\\s*return GenIcon\\(([^\\n]+)\\)\\(props\\);`).exec(source)
      if (!match) throw new Error(`Unable to extract ${name}; review the installed react-icons format.`)
      const data = JSON.parse(match[1])
      declarations.push(`export const ${name} = GenIcon(${JSON.stringify(data, null, 2)})`)
    }
  }
  return `// Generated from react-icons ${metadata.version}; run node scripts/generate-engine-icons.mjs.\n// Original SVG paths and licenses: ./LICENSE.txt. Avoid importing full icon collections.\nimport { GenIcon } from 'react-icons'\n\n${declarations.join('\n\n')}\n`
}

async function generateLicenses() {
  const upstream = await readFile(new URL('node_modules/react-icons/LICENSE', frontendRoot), 'utf8')
  const apache = (await readFile(new URL('node_modules/typescript/LICENSE.txt', frontendRoot), 'utf8')).replace(/[ \t]+$/gm, '')
  return `Selected engine icons from React Icons (https://github.com/react-icons/react-icons).\n\nSimple Icons (SiClaude, SiDeepseek, SiGoogle, SiOpencode, SiQwen):\nhttps://simpleicons.org/ — CC0 1.0 Universal\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\nRemix Icon (RiOpenaiFill):\nhttps://github.com/Remix-Design/RemixIcon — Apache License 2.0\n\nReact Icons generator/runtime license:\n${upstream.split('---')[0].trim()}\n\nRemix Icon license:\n${apache.trim()}\n`
}

const outputs = {
  'engineBrandIcons.ts': await generateIcons(),
  'LICENSE.txt': await generateLicenses(),
}
if (process.argv.includes('--check')) {
  for (const [name, expected] of Object.entries(outputs)) {
    const target = new URL(name, outputDirectory)
    if (await readFile(target, 'utf8') !== expected) throw new Error(`Stale engine icon asset: ${fileURLToPath(target)}`)
  }
  console.log('Engine icon subset matches the installed SVG paths and licenses.')
} else {
  await mkdir(outputDirectory, { recursive: true })
  for (const [name, contents] of Object.entries(outputs)) await writeFile(new URL(name, outputDirectory), contents)
  console.log('Generated six engine icons without the full collection imports.')
}
